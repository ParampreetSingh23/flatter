"use client";
import { useAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, api } from "@/lib/api";
import type { Ack, ChatEvent } from "@/lib/chat-types";

export type ChatStatus = "connecting" | "online" | "offline";
interface Ctx {
  status: ChatStatus;
  unread: number;
  subscribe: (fn: (e: ChatEvent) => void) => () => void;
  request: <T extends object = object>(event: string, payload: unknown, timeoutMs?: number) => Promise<Ack<T>>;
}
const ChatContext = createContext<Ctx>({ status: "connecting", unread: 0, subscribe: () => () => {}, request: async () => ({ ok: false, error: { code: "OFFLINE" } }) });
export const useChat = () => useContext(ChatContext);

const RECONCILE_MS = 30_000;
// Only used to schedule the refresh. The server verifies every token; it never trusts this decode.
const expiryOf = (jwt: string) => { try { return JSON.parse(atob(jwt.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).exp as number; } catch { return 0; } };

/** One socket per signed-in tab, owned here and shared by the whole app shell. Never persists message data. */
export function ChatProvider({ initialUnread, children }: { initialUnread: number; children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const [status, setStatus] = useState<ChatStatus>("connecting");
  const [unread, setUnread] = useState(initialUnread);
  const socketRef = useRef<Socket | null>(null);
  const listeners = useRef(new Set<(e: ChatEvent) => void>());
  const tokenFn = useRef(getToken);
  useEffect(() => { tokenFn.current = getToken; }, [getToken]);

  const subscribe = useCallback((fn: (e: ChatEvent) => void) => { listeners.current.add(fn); return () => void listeners.current.delete(fn); }, []);
  const request = useCallback(<T extends object = object>(event: string, payload: unknown, timeoutMs = 10_000) => new Promise<Ack<T>>((resolve) => {
    const s = socketRef.current;
    if (!s?.connected) return resolve({ ok: false, error: { code: "OFFLINE" } });
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => resolve(err ? { ok: false, error: { code: "TIMEOUT" } } : res));
  }), []);

  useEffect(() => {
    if (!isSignedIn) return; // signed out: no socket, and the cleanup below already closed any previous one
    let off = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let unreadTimer: ReturnType<typeof setTimeout> | undefined;

    // The auth callback runs on every (re)connect attempt, so each reconnect re-authenticates with a fresh token.
    const socket = io(API_URL, { reconnectionDelayMax: 10_000, auth: (cb) => { tokenFn.current().then((t) => cb({ token: t ?? "" }), () => cb({ token: "" })); } });
    socketRef.current = socket;
    const emitLocal = (name: string, data: unknown = {}) => listeners.current.forEach((fn) => fn({ name, data }));

    const refreshUnread = () => {
      clearTimeout(unreadTimer);
      unreadTimer = setTimeout(async () => {
        try { const r = await api<{ unread: number }>(await tokenFn.current(), "GET", "/api/messages/unread"); if (!off) setUnread(r.unread); } catch { /* keeps the last known count */ }
      }, 300);
    };
    const reconcile = () => { if (document.visibilityState === "visible") { refreshUnread(); emitLocal("reconcile"); } };

    // Refresh shortly before the short-lived session token expires; any failure falls back to a clean reconnect.
    const scheduleRefresh = (jwt: string) => {
      clearTimeout(refreshTimer);
      const wait = Math.max(5_000, expiryOf(jwt) * 1000 - Date.now() - 20_000);
      refreshTimer = setTimeout(async () => {
        try {
          const t = await tokenFn.current({ skipCache: true });
          if (!t) throw new Error("no token");
          const r = await new Promise<Ack>((resolve) => socket.timeout(10_000).emit("auth:refresh", { token: t }, (err: Error | null, res: Ack) => resolve(err ? { ok: false, error: { code: "TIMEOUT" } } : res)));
          if (!r.ok) throw new Error("refresh refused");
          scheduleRefresh(t);
        } catch {
          socket.disconnect(); // fail closed, then reconnect with a fresh token (or stay offline if signed out)
          if (!off) socket.connect();
        }
      }, wait);
    };

    socket.on("connect", async () => {
      setStatus("online");
      try { const t = await tokenFn.current(); if (t) scheduleRefresh(t); } catch { /* the next reconnect re-authenticates */ }
      reconcile();
    });
    socket.on("disconnect", () => { clearTimeout(refreshTimer); setStatus("offline"); });
    socket.on("connect_error", () => {
      setStatus("offline");
      // A server-side denial is not retried by Socket.IO itself, so retry slowly with a fresh token.
      if (!socket.active) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { if (!off) socket.connect(); }, 5_000); }
    });
    socket.onAny((name: string, data: unknown) => {
      emitLocal(name, data);
      const d = data as { mine?: boolean; who?: string };
      if ((name === "message:created" && d.mine === false) || (name === "receipt:updated" && d.who === "me") || name === "inbox:changed" || name === "conversation:closed") refreshUnread();
    });

    const timer = setInterval(reconcile, RECONCILE_MS); // stops doing work in hidden tabs
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      off = true;
      clearInterval(timer); clearTimeout(refreshTimer); clearTimeout(retryTimer); clearTimeout(unreadTimer);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", reconcile);
      socket.removeAllListeners().disconnect(); // local sign-out / unmount closes immediately
      socketRef.current = null;
    };
  }, [isSignedIn]);

  const value = useMemo(() => ({ status: isSignedIn ? status : "offline" as ChatStatus, unread: isSignedIn ? unread : 0, subscribe, request }), [status, unread, isSignedIn, subscribe, request]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
