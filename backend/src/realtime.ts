import type { Server as HttpServer } from "node:http";
import { verifyToken } from "@clerk/express";
import { Server, type Socket } from "socket.io";
import type { ZodType } from "zod";
import { z } from "zod";
import { advanceReceipts, type ChatUser, chatUserByClerk, isRetry, messageDto, requireInteractive, sendMessage } from "./chat-data.js";
import { type ChatHub, setChatHub } from "./chat-hub.js";
import { receiptPayload, refreshPayload, sendPayload, typingPayload } from "./chat-rules.js";
import { ApiError } from "./http.js";

export interface Verified { sub: string; exp: number; sid?: string }
export interface RealtimeOptions {
  frontendOrigin: string;
  /** Injectable for tests; production verifies the Clerk session JWT (signature, expiry, authorized party). */
  verify?: (token: string) => Promise<Verified>;
  limits?: Partial<typeof DEFAULT_LIMITS>;
}
// ponytail: all limits, rooms and typing live in process memory: single-instance launch limit (docs/messaging.md section 9).
const DEFAULT_LIMITS = { socketsPerUser: 5, sendsPerMinute: 30, sendsPerConversation10s: 10, eventsPerMinute: 240, refreshesPerMinute: 12, typingTtlMs: 5000 };

const room = (userId: string) => `user:${userId}`;
type Ack = (r: unknown) => void;
interface Data { userId: string; clerkId: string; sid?: string | undefined; exp: number; timer?: NodeJS.Timeout }

export function attachRealtime(httpServer: HttpServer, opts: RealtimeOptions) {
  const L = { ...DEFAULT_LIMITS, ...opts.limits };
  const verify = opts.verify ?? (async (token: string) => {
    const p = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, authorizedParties: [opts.frontendOrigin] });
    return { sub: p.sub, exp: p.exp, sid: p.sid };
  });
  const io = new Server(httpServer, {
    cors: { origin: opts.frontendOrigin },
    maxHttpBufferSize: 32 * 1024, // text caps are 16 KiB UTF-8; leaves room for JSON framing only
    // Origin is not identity (the token is), but a browser from another site must not even handshake.
    allowRequest: (req, cb) => cb(null, req.headers.origin === opts.frontendOrigin),
  });

  // ---- tiny in-memory sliding-window limiter (the Express limiter does not cover socket events) ----
  const hits = new Map<string, number[]>();
  const recent = (key: string, windowMs: number) => {
    const now = Date.now();
    const a = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.set(key, a);
    return a.length;
  };
  const hit = (key: string) => hits.get(key)?.push(Date.now());
  const sweeper = setInterval(() => { for (const [k] of hits) if (recent(k, 60_000) === 0) hits.delete(k); }, 60_000);
  sweeper.unref();

  const sockets = new Map<string, Set<string>>(); // userId -> socket ids
  const typing = new Map<string, { timer: NodeJS.Timeout; userId: string; peerId: string; matchId: string }>();

  const clearTyping = (key: string, emit = true) => {
    const t = typing.get(key);
    if (!t) return;
    clearTimeout(t.timer);
    typing.delete(key);
    if (emit) io.to(room(t.peerId)).emit("typing:changed", { matchId: t.matchId, active: false });
  };
  const clearTypingFor = (pred: (t: { userId: string; matchId: string }) => boolean) => { for (const [k, t] of typing) if (pred(t)) clearTyping(k); };

  const expire = (socket: Socket) => {
    const d = socket.data as Data;
    clearTimeout(d.timer);
    // Fail closed exactly at token expiry; a refreshed token replaces this timer.
    d.timer = setTimeout(() => socket.disconnect(true), Math.max(0, d.exp * 1000 - Date.now()));
    d.timer.unref();
  };

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== "string" || token.length > 4096) return next(new Error("UNAUTHENTICATED"));
      const v = await verify(token);
      if (v.exp * 1000 <= Date.now()) return next(new Error("UNAUTHENTICATED"));
      const u = await chatUserByClerk(v.sub);
      if (!u) return next(new Error("UNAUTHENTICATED"));
      if ((sockets.get(u.id)?.size ?? 0) >= L.socketsPerUser) return next(new Error("TOO_MANY_CONNECTIONS"));
      socket.data = { userId: u.id, clerkId: v.sub, sid: v.sid, exp: v.exp } satisfies Data;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const d = socket.data as Data;
    socket.join(room(d.userId)); // server-owned room; clients cannot join or subscribe to anything
    (sockets.get(d.userId) ?? sockets.set(d.userId, new Set()).get(d.userId)!).add(socket.id);
    expire(socket);

    const fail = (ack: Ack | undefined, code: string, message: string) => ack?.({ ok: false, error: { code, message } });
    // One wrapper: ack required, payload validated, token fresh, account state re-read, errors structured, no content logged.
    const on = <T>(event: string, schema: ZodType<T>, fn: (me: ChatUser, p: T) => Promise<unknown>, opt: { skipUser?: boolean } = {}) => {
      socket.on(event, async (raw: unknown, ack?: Ack) => {
        if (typeof ack !== "function") return;
        try {
          if (recent(`ev:${d.userId}`, 60_000) >= L.eventsPerMinute) return fail(ack, "RATE_LIMITED", "Slow down.");
          hit(`ev:${d.userId}`);
          if (d.exp * 1000 <= Date.now()) { fail(ack, "UNAUTHENTICATED", "Your session expired."); return void socket.disconnect(true); }
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return fail(ack, "VALIDATION_ERROR", "Invalid request.");
          const me = opt.skipUser ? null : await chatUserByClerk(d.clerkId);
          if (!opt.skipUser && !me) { fail(ack, "UNAUTHENTICATED", "Messaging isn't available for this account."); return void socket.disconnect(true); }
          ack({ ok: true, ...(await fn(me as ChatUser, parsed.data) as object) });
        } catch (e) {
          if (e instanceof ApiError) return fail(ack, e.code, e.message);
          console.error(`realtime ${event} failed`, e instanceof Error ? e.name : "error"); // never the payload
          fail(ack, "UNAVAILABLE", "Something went wrong. Try again.");
        }
      });
    };

    on("auth:refresh", refreshPayload, async (_me, p) => {
      if (recent(`rf:${d.userId}`, 60_000) >= L.refreshesPerMinute) throw new ApiError(429, "RATE_LIMITED", "Slow down.");
      hit(`rf:${d.userId}`);
      try {
        const v = await verify(p.token);
        if (v.sub !== d.clerkId || (d.sid && v.sid !== d.sid) || v.exp * 1000 <= Date.now()) throw new Error("mismatch");
        d.exp = v.exp; // replaced atomically: single-threaded, no await between the checks and the write
        expire(socket);
        return { exp: v.exp };
      } catch {
        setImmediate(() => socket.disconnect(true));
        throw new ApiError(401, "UNAUTHENTICATED", "Your session expired.");
      }
    }, { skipUser: true });

    on("message:send", sendPayload, async (me, p) => {
      // Fresh sends are limited; a retry of an already-committed message is not (checked after, by `created`).
      if ((recent(`s:${me.id}`, 60_000) >= L.sendsPerMinute || recent(`sc:${me.id}:${p.matchId}`, 10_000) >= L.sendsPerConversation10s)
        && !(await isRetry(me.id, p.matchId, p.clientMessageId))) {
        throw new ApiError(429, "RATE_LIMITED", "You're sending messages too fast.");
      }
      const r = await sendMessage(me, p.matchId, p.clientMessageId, p.body);
      if (r.created) { hit(`s:${me.id}`); hit(`sc:${me.id}:${p.matchId}`); }
      clearTyping(`${p.matchId}:${me.id}`);
      // Commit happened before any emit. A crash right here is repaired by catch-up; a retry re-emits harmlessly.
      io.to(room(me.id)).emit("message:created", { ...messageDto(r.message, me.id), matchId: p.matchId });
      io.to(room(r.peerId)).emit("message:created", { ...messageDto(r.message, r.peerId), matchId: p.matchId });
      return { message: messageDto(r.message, me.id) };
    });

    const receipt = (kind: "delivered" | "read") => async (me: ChatUser, p: z.infer<typeof receiptPayload>) => {
      const r = await advanceReceipts(me, p.matchId, kind, p.throughSeq);
      if (r.changed) {
        io.to(room(me.id)).emit("receipt:updated", { matchId: p.matchId, who: "me", delivered: r.delivered, read: r.read });
        io.to(room(r.peerId)).emit("receipt:updated", { matchId: p.matchId, who: "peer", delivered: r.delivered, read: r.read });
      }
      return { delivered: r.delivered, read: r.read };
    };
    on("message:delivered", receiptPayload, receipt("delivered"));
    on("message:read", receiptPayload, receipt("read"));

    on("typing:set", typingPayload, async (me, p) => {
      const key = `${p.matchId}:${me.id}`;
      if (!p.active) { clearTyping(key); return {}; }
      const conv = await requireInteractive(me, p.matchId); // permission rechecked for every event
      const old = typing.get(key);
      if (old) clearTimeout(old.timer);
      else io.to(room(conv.peer.id)).emit("typing:changed", { matchId: p.matchId, active: true });
      const timer = setTimeout(() => clearTyping(key), L.typingTtlMs);
      timer.unref();
      typing.set(key, { timer, userId: me.id, peerId: conv.peer.id, matchId: p.matchId });
      return {};
    });

    socket.on("disconnect", () => {
      clearTimeout(d.timer);
      const set = sockets.get(d.userId);
      set?.delete(socket.id);
      if (!set?.size) { sockets.delete(d.userId); clearTypingFor((t) => t.userId === d.userId); } // restart/disconnect clears typing
    });
  });

  const hub: ChatHub = {
    closed(matchId, userIds) {
      clearTypingFor((t) => t.matchId === matchId);
      // Neutral on purpose: never says who blocked or why.
      for (const id of userIds) {
        io.to(room(id)).emit("conversation:closed", { matchId });
        io.to(room(id)).emit("inbox:changed", {});
      }
    },
    inbox(userIds) { for (const id of userIds) io.to(room(id)).emit("inbox:changed", {}); },
    disconnect(userId) { io.in(room(userId)).disconnectSockets(true); },
  };
  setChatHub(hub);

  return {
    io,
    /** Graceful drain: stop accepting, disconnect clients (they reconnect to the next instance) and close the HTTP server. */
    close: () => new Promise<void>((resolve) => {
      setChatHub(null);
      clearInterval(sweeper);
      for (const t of typing.values()) clearTimeout(t.timer);
      void io.close(() => resolve());
    }),
  };
}

