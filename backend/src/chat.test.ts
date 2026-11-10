import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { io as connect, type Socket } from "socket.io-client";
import { deleteAccount } from "./account-deletion.js";
import { chatRouter } from "./chat.js";
import { sendMessage, chatUserByClerk } from "./chat-data.js";
import { db } from "./db.js";
import { matchingRouters } from "./matching.js";
import { attachRealtime } from "./realtime.js";
import type { Storage } from "./storage.js";
import { webhookRouter } from "./webhooks.js";

const ORIGIN = "http://localhost:3000";
const removed: string[] = [];
const storage: Storage = {
  presignPut: async (k) => k, presignGet: async (k) => k, read: async () => null, write: async () => {}, exists: async () => true,
  remove: async (k) => void removed.push(k),
};
const who = (req: express.Request) => req.header("x-test-user") ?? null;
const app = express();
app.use("/api/webhooks", webhookRouter(storage, undefined));
app.use("/api/messages", chatRouter(who));
const m = matchingRouters(who, storage);
app.use("/api/blocks", m.blocks);
app.use("/api/matches", m.matches);
app.use("/api/reports", m.reports);
const server = createServer(app);
// Tokens are "tok|<clerkId>|<expEpochSeconds>|<sessionId>"; real deployments verify Clerk JWTs instead.
const rt = attachRealtime(server, {
  frontendOrigin: ORIGIN, limits: { sendsPerMinute: 12, sendsPerConversation10s: 100, typingTtlMs: 250, refreshesPerMinute: 100 },
  verify: async (t) => { const [k, sub, exp, sid] = t.split("|"); if (k !== "tok" || !sub || !exp) throw new Error("bad"); return { sub, exp: Number(exp), sid: sid ?? "s1" }; },
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as AddressInfo).port;
const base = `http://localhost:${port}`;
const stamp = Date.now();
const keys = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"] as const;
type K = (typeof keys)[number];
const cid = Object.fromEntries(keys.map((k) => [k, `test_${stamp}_c${k}`])) as Record<K, string>;
const tok = (k: K, ttlMs = 60_000, sid = "s1") => `tok|${cid[k]}|${Math.floor((Date.now() + ttlMs) / 1000)}|${sid}`;
const uuid = () => crypto.randomUUID();
const rest = async (k: K | null, path: string, method = "GET", body?: unknown) => {
  const res = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json", ...(k && { "x-test-user": cid[k] }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  return { status: res.status, json: (await res.json()) as any, headers: res.headers };
};

// ---- socket helpers ----
const sockets: Socket[] = [];
type Evt = { name: string; data: any };
function open(k: K, o: { ttlMs?: number; origin?: string; token?: string; sid?: string } = {}) {
  const s = connect(base, { transports: ["websocket"], reconnection: false, extraHeaders: { Origin: o.origin ?? ORIGIN }, auth: { token: o.token ?? tok(k, o.ttlMs, o.sid) } });
  sockets.push(s);
  const log: Evt[] = [];
  s.onAny((name, data) => log.push({ name, data }));
  const ready = new Promise<void>((res, rej) => { s.once("connect", () => res()); s.once("connect_error", (e) => rej(e)); });
  const wait = async (name: string, pred: (d: any) => boolean = () => true, ms = 3000) => {
    const end = Date.now() + ms * 5; // generous: the dev database is remote (~130 ms per round trip)
    for (;;) {
      const hit = log.find((e) => e.name === name && pred(e.data));
      if (hit) return hit.data;
      if (Date.now() > end) throw new Error(`timeout waiting for ${name}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  return { s, log, ready, wait, count: (n: string) => log.filter((e) => e.name === n).length };
}
const ack = (s: Socket, ev: string, payload: unknown) => new Promise<any>((res) => s.timeout(30_000).emit(ev, payload, (err: Error | null, r: any) => res(err ? { ok: false, error: { code: "TIMEOUT" } } : r)));
const send = (s: Socket, matchId: string, body: string, clientMessageId = uuid()) => ack(s, "message:send", { matchId, clientMessageId, body });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const closedUnsent = (r: any) => assert.equal(r.error?.code, "CONVERSATION_CLOSED");

try {
  const mkUser = async (k: K, name: string) => {
    const u = await db.user.create({ data: { clerkUserId: cid[k], housingIntent: "TEAM_UP", onboardingCompletedAt: new Date(), discoveryEnabled: true, matchingEnabledAt: new Date() } });
    await db.profile.create({ data: { userId: u.id, displayName: name, birthDate: new Date("1999-05-17T00:00:00Z"), occupation: "STUDENT", gender: "WOMAN", bio: "Hi" } });
    return u;
  };
  const users = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await mkUser(k, k.toUpperCase() + "ani")]))) as Record<K, Awaited<ReturnType<typeof mkUser>>>;
  const pairOf = async (x: K, y: K) => {
    const [low, high] = [users[x].id, users[y].id].sort();
    return db.match.create({ data: { userLowId: low!, userHighId: high!, scoreAtMatch: 90, scorePolicy: "compatibility-v1" } });
  };
  const AB = await pairOf("a", "b"), CD = await pairOf("c", "d"), FG = await pairOf("f", "g"), HI = await pairOf("h", "i"), JK = await pairOf("j", "k");

  // =============== connection security ===============
  assert.equal((await rest(null, "/messages")).status, 401);
  const noTok = connect(base, { transports: ["websocket"], reconnection: false, extraHeaders: { Origin: ORIGIN } }); sockets.push(noTok);
  assert.equal(await new Promise((r) => noTok.once("connect_error", (e) => r(e.message))), "UNAUTHENTICATED");
  const badTok = open("a", { token: "garbage" });
  await assert.rejects(badTok.ready, /UNAUTHENTICATED/);
  const expired = open("a", { ttlMs: -5000 });
  await assert.rejects(expired.ready, /UNAUTHENTICATED/);
  const evil = open("a", { origin: "https://evil.example" });
  await assert.rejects(evil.ready); // third-party Origin refused at the handshake
  const ghost = open("a", { token: `tok|nobody_${stamp}|${Math.floor(Date.now() / 1000) + 60}|s` });
  await assert.rejects(ghost.ready, /UNAUTHENTICATED/); // valid signature but no application user

  const A = open("a"), B = open("b"), E = open("e");
  await Promise.all([A.ready, B.ready, E.ready]);

  // =============== reads: membership, no-store, empty chat for an existing match ===============
  const inbox = await rest("a", "/messages");
  assert.equal(inbox.status, 200);
  assert.match(inbox.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(inbox.json.conversations.length, 1);
  assert.deepEqual([inbox.json.conversations[0].state, inbox.json.conversations[0].last, inbox.json.conversations[0].unread], ["ACTIVE", null, 0]);
  assert.equal((await rest("e", `/messages/${AB.id}`)).status, 404, "a non-member can't read by guessing the id");
  assert.equal((await rest("e", `/messages/${AB.id}/history`)).status, 404);
  assert.equal((await rest("e", "/messages")).json.conversations.length, 0);
  assert.equal((await rest("a", "/messages/not-a-uuid")).status, 404);
  assert.equal((await rest("a", `/messages/${AB.id}/history?beforeSeq=3&afterSeq=1`)).status, 422);
  assert.equal((await rest("a", `/messages/${AB.id}/history?limit=101`)).status, 422);
  assert.equal((await rest("a", `/messages/${AB.id}/history?bogus=1`)).status, 422);
  assert.equal((await rest("a", "/messages?cursor=nope")).status, 422);
  const snap0 = (await rest("a", `/messages/${AB.id}`)).json;
  assert.deepEqual([snap0.state, snap0.headSeq, snap0.messages.length, snap0.peer.displayName], ["ACTIVE", 0, 0, "Bani"]);

  // =============== validation, forged fields, non-members over the socket ===============
  assert.equal((await send(E.s, AB.id, "let me in")).error.code, "NOT_FOUND");
  assert.equal((await ack(A.s, "message:send", { matchId: AB.id, clientMessageId: uuid(), body: "x", senderId: users.b.id })).error.code, "VALIDATION_ERROR", "sender comes from the session only");
  assert.equal((await ack(A.s, "message:send", { matchId: AB.id, clientMessageId: "nope", body: "x" })).error.code, "VALIDATION_ERROR");
  for (const body of ["", "   \n\t ", "x".repeat(2001), "a\u0000b", "\ud800", "😀".repeat(2000) + "x"]) {
    assert.equal((await send(A.s, AB.id, body)).error.code, "VALIDATION_ERROR", JSON.stringify(body).slice(0, 20));
  }
  assert.equal((await send(A.s, AB.id, "😀".repeat(2000))).ok, true, "2000 code points of 4 bytes each is within both caps");
  assert.equal(await db.message.count({ where: { matchId: AB.id } }), 1);
  await db.message.deleteMany({ where: { matchId: AB.id } });
  await db.match.update({ where: { id: AB.id }, data: { lastMessageSeq: 0, lastMessageAt: null } });
  assert.equal(await A.s.timeout(500).emitWithAck("join", "user:" + users.b.id).catch(() => "no-handler"), "no-handler", "clients cannot join rooms");

  // =============== send: commit before emit, idempotency, ordering, unicode ===============
  const text = "Hi 👋🏽 नमस्ते\nline two <b>not html</b>";
  const id1 = uuid();
  const r1 = await send(A.s, AB.id, `  ${text}  `, id1);
  assert.equal(r1.ok, true);
  assert.deepEqual([r1.message.seq, r1.message.mine, r1.message.body, r1.message.clientMessageId], [1, true, text, id1]);
  const got = await B.wait("message:created", (d) => d.body === text);
  assert.deepEqual([got.mine, got.body, got.clientMessageId], [false, text, undefined], "recipient copy: not mine, no client id");
  await A.wait("message:created", (d) => d.body === text && d.mine); // sender's other tabs see it too
  const retry = await send(A.s, AB.id, text, id1);
  assert.deepEqual([retry.ok, retry.message.id, retry.message.seq], [true, r1.message.id, 1], "same id and content returns the original");
  assert.equal(await db.message.count({ where: { matchId: AB.id } }), 1);
  const conflict = await send(A.s, AB.id, "different words", id1);
  assert.equal(conflict.error.code, "IDEMPOTENCY_CONFLICT");
  const r2 = await send(B.s, AB.id, "reply from B"), r3 = await send(A.s, AB.id, "third");
  assert.deepEqual([r2.message.seq, r3.message.seq], [2, 3]);
  const head = await db.match.findUniqueOrThrow({ where: { id: AB.id } });
  assert.deepEqual([head.lastMessageSeq, head.lastMessageAt != null], [3, true]);
  // concurrent sends: gapless, unique, ordered sequences
  const burst = await Promise.all([1, 2, 3, 4].map((n) => send(n % 2 ? A.s : B.s, AB.id, `burst ${n}`)));
  assert.equal(burst.every((x) => x.ok), true, JSON.stringify(burst));
  const seqs = (await db.message.findMany({ where: { matchId: AB.id }, orderBy: { seq: "asc" } })).map((x) => x.seq);
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7]);

  // =============== chat survives discovery opt-out, unenrollment, and a closed listing ===============
  await db.user.update({ where: { id: users.a.id }, data: { discoveryEnabled: false, matchingEnabledAt: null } });
  assert.equal((await send(A.s, AB.id, "still here after opting out of discovery")).ok, true);
  await db.user.update({ where: { id: users.a.id }, data: { discoveryEnabled: true, matchingEnabledAt: new Date() } });

  // =============== history pagination ===============
  const latest = (await rest("a", `/messages/${AB.id}/history?limit=3`)).json;
  assert.deepEqual(latest.messages.map((x: any) => x.seq), [6, 7, 8]);
  assert.equal(latest.hasMore, true);
  const older = (await rest("a", `/messages/${AB.id}/history?beforeSeq=6&limit=3`)).json;
  assert.deepEqual(older.messages.map((x: any) => x.seq), [3, 4, 5]);
  const asc = (await rest("a", `/messages/${AB.id}/history?afterSeq=2&limit=4`)).json;
  assert.deepEqual([asc.messages.map((x: any) => x.seq), asc.hasMore], [[3, 4, 5, 6], true]);
  const tail = (await rest("a", `/messages/${AB.id}/history?afterSeq=6&limit=4`)).json;
  assert.deepEqual([tail.messages.map((x: any) => x.seq), tail.hasMore], [[7, 8], false]);
  assert.equal(JSON.stringify(latest).includes("senderId"), false, "no internal ids in message DTOs");

  // =============== receipts: delivered, read, monotonic, unread excludes own ===============
  const unread = async (k: K) => (await rest(k, "/messages/unread")).json.unread;
  const incoming = (uid: string) => db.message.count({ where: { matchId: AB.id, senderId: { not: uid } } });
  assert.equal(await unread("b"), await incoming(users.b.id));
  assert.equal(await unread("a"), await incoming(users.a.id), "own messages never count as unread");
  assert.ok((await unread("b")) >= 5);
  assert.deepEqual((await ack(B.s, "message:delivered", { matchId: AB.id, throughSeq: 3 })).delivered, 3);
  assert.deepEqual(await A.wait("receipt:updated", (d) => d.who === "peer" && d.delivered === 3), { matchId: AB.id, who: "peer", delivered: 3, read: 0 });
  await B.wait("receipt:updated", (d) => d.who === "me" && d.delivered === 3); // B's other tabs sync
  const rd = await ack(B.s, "message:read", { matchId: AB.id, throughSeq: 2 });
  assert.deepEqual([rd.delivered, rd.read], [3, 2], "read never exceeds delivered; delivered kept");
  await A.wait("receipt:updated", (d) => d.who === "peer" && d.read === 2);
  const before = A.count("receipt:updated");
  assert.deepEqual((await ack(B.s, "message:delivered", { matchId: AB.id, throughSeq: 1 })).delivered, 3, "cursors never decrease");
  await sleep(80);
  assert.equal(A.count("receipt:updated"), before, "no change, no broadcast");
  assert.equal((await ack(B.s, "message:read", { matchId: AB.id, throughSeq: 99 })).error.code, "VALIDATION_ERROR", "can't acknowledge the future");
  assert.equal((await ack(B.s, "message:read", { matchId: AB.id, throughSeq: 0 })).error.code, "VALIDATION_ERROR");
  assert.equal((await ack(E.s, "message:read", { matchId: AB.id, throughSeq: 1 })).error.code, "NOT_FOUND");
  const headSeq = (await db.match.findUniqueOrThrow({ where: { id: AB.id } })).lastMessageSeq;
  const full = await ack(B.s, "message:read", { matchId: AB.id, throughSeq: headSeq });
  assert.deepEqual([full.delivered, full.read], [headSeq, headSeq]);
  await A.wait("receipt:updated", (d) => d.who === "peer" && d.read === headSeq);
  assert.equal(await unread("b"), 0);
  assert.equal(await unread("a"), await incoming(users.a.id), "B reading A's messages doesn't touch A's own unread");
  assert.deepEqual((await rest("a", `/messages/${AB.id}`)).json.cursors, { me: { delivered: 0, read: 0 }, peer: { delivered: headSeq, read: headSeq } });
  assert.equal(await db.chatMemberState.count({ where: { matchId: AB.id } }), 1, "rows exist only for explicit receipt writes (GETs create none)");
  await assert.rejects(db.$executeRaw`UPDATE chat_member_states SET "readThroughSeq" = "deliveredThroughSeq" + 1 WHERE "matchId" = ${AB.id}::uuid`, /chat_member_states_bounds_chk|check/i);

  // =============== typing: bounded, expires, cleared by send ===============
  await ack(A.s, "typing:set", { matchId: AB.id, active: true });
  await B.wait("typing:changed", (d) => d.active === true);
  await B.wait("typing:changed", (d) => d.active === false, 2000); // server expiry without renewal
  await ack(A.s, "typing:set", { matchId: AB.id, active: true });
  const tCount = B.log.filter((e) => e.name === "typing:changed").length;
  await send(A.s, AB.id, "typing stops on send");
  await B.wait("typing:changed", (d) => d.active === false && B.log.filter((e) => e.name === "typing:changed").length > tCount);
  assert.equal((await ack(E.s, "typing:set", { matchId: AB.id, active: true })).error.code, "NOT_FOUND");

  // =============== reconnect, gaps and persist-before-emit repair ===============
  B.s.disconnect();
  const seenByB = (await db.message.findFirst({ where: { matchId: AB.id }, orderBy: { seq: "desc" } }))!.seq;
  for (const t of ["offline 1", "offline 2", "offline 3"]) assert.equal((await send(A.s, AB.id, t)).ok, true);
  const ua = (await chatUserByClerk(cid.a))!;
  const silent = await sendMessage(ua, AB.id, uuid(), "committed, but the emit never happened"); // simulates a crash after commit
  assert.equal(silent.created, true);
  const B2 = open("b"); await B2.ready;
  await sleep(150);
  assert.equal(B2.log.some((e) => e.name === "message:created"), false, "the reconnected socket received nothing live");
  const caught = (await rest("b", `/messages/${AB.id}/history?afterSeq=${seenByB}&limit=2`)).json;
  assert.deepEqual([caught.messages.map((x: any) => x.body), caught.hasMore], [["offline 1", "offline 2"], true]);
  const caught2 = (await rest("b", `/messages/${AB.id}/history?afterSeq=${caught.messages.at(-1).seq}&limit=2`)).json;
  assert.deepEqual([caught2.messages.map((x: any) => x.body), caught2.hasMore], [["offline 3", "committed, but the emit never happened"], false]);
  assert.equal((await rest("b", `/messages/${AB.id}/history?afterSeq=${caught2.messages.at(-1).seq}`)).json.messages.length, 0);

  // =============== rate limits: fresh sends limited, committed retries are not ===============
  const C = open("c"), D = open("d"); await Promise.all([C.ready, D.ready]);
  const firstId = uuid();
  assert.equal((await send(C.s, CD.id, "limit 0", firstId)).ok, true);
  for (let n = 1; n < 12; n++) assert.equal((await send(C.s, CD.id, `limit ${n}`)).ok, true);
  assert.equal((await send(C.s, CD.id, "one too many")).error.code, "RATE_LIMITED");
  assert.equal(await db.message.count({ where: { matchId: CD.id } }), 12);
  assert.equal((await send(C.s, CD.id, "limit 0", firstId)).ok, true, "an idempotent retry consumes no allowance");
  assert.equal((await ack(C.s, "typing:set", { matchId: CD.id, active: "yes" })).error.code, "VALIDATION_ERROR");

  // =============== block: closes sending, typing and receipts; history stays; unblock restores nothing ===============
  const pubD = (await db.profile.findUniqueOrThrow({ where: { userId: users.d.id } })).publicId;
  assert.equal((await send(D.s, CD.id, "D before the block")).ok, true);
  assert.equal((await rest("c", "/blocks", "POST", { publicId: pubD })).status, 200);
  for (const X of [C, D]) {
    assert.deepEqual(await X.wait("conversation:closed"), { matchId: CD.id }, "neutral: no blocker, no reason");
    await X.wait("inbox:changed");
  }
  closedUnsent(await send(D.s, CD.id, "after block"));
  assert.equal((await send(C.s, CD.id, "after block")).ok, false, "the blocker can't send either (rate-limited here, closed otherwise)");
  closedUnsent(await ack(D.s, "typing:set", { matchId: CD.id, active: true }));
  closedUnsent(await ack(D.s, "message:read", { matchId: CD.id, throughSeq: 1 }));
  const dSnap = (await rest("d", `/messages/${CD.id}`)).json;
  assert.deepEqual([dSnap.state, dSnap.peer.publicId, dSnap.peer.avatarUrl, dSnap.messages.length, dSnap.unread], ["READ_ONLY", null, null, 13, 0]);
  assert.equal((await rest("c", `/messages/${CD.id}/history?limit=5`)).json.state, "READ_ONLY");
  assert.equal((await rest("d", "/messages")).json.conversations.find((x: any) => x.id === CD.id).unread, 0);
  assert.equal((await rest("c", `/blocks/${pubD}`, "DELETE")).status, 200);
  closedUnsent(await send(D.s, CD.id, "after unblock"));
  assert.equal((await rest("d", `/messages/${CD.id}`)).json.state, "READ_ONLY", "unblock never reopens chat");
  assert.equal(await db.message.count({ where: { matchId: CD.id } }), 13);

  // =============== unmatch racing a send, in either commit order ===============
  const J = open("j"), K = open("k"); await Promise.all([J.ready, K.ready]);
  const preId = uuid();
  assert.equal((await send(J.s, JK.id, "before the end", preId)).ok, true);
  await ack(K.s, "typing:set", { matchId: JK.id, active: true });
  await J.wait("typing:changed", (d) => d.active);
  const [raced, un] = await Promise.all([send(J.s, JK.id, "racing the unmatch"), rest("k", `/matches/${JK.id}/unmatch`, "POST")]);
  assert.equal(un.status, 200);
  await Promise.all([J.wait("conversation:closed"), K.wait("conversation:closed")]);
  await J.wait("typing:changed", (d) => d.active === false); // typing cleared on closure
  const rows = await db.message.findMany({ where: { matchId: JK.id }, orderBy: { seq: "asc" } });
  if (raced.ok) assert.deepEqual(rows.map((x) => x.body), ["before the end", "racing the unmatch"], "committed before the end: kept in history");
  else { assert.equal(raced.error.code, "CONVERSATION_CLOSED"); assert.deepEqual(rows.map((x) => x.body), ["before the end"], "closure won: nothing inserted"); }
  closedUnsent(await send(J.s, JK.id, "late"));
  const again = await send(J.s, JK.id, "before the end", preId);
  assert.deepEqual([again.ok, again.message.seq], [true, 1], "a known committed retry returns its original after closure, never a new row");
  assert.equal((await rest("k", `/matches/${JK.id}/unmatch`, "POST")).status, 200, "repeat unmatch is harmless");
  const jInbox = (await rest("j", "/messages")).json;
  assert.equal(jInbox.conversations.find((x: any) => x.id === JK.id).state, "READ_ONLY");
  assert.equal((await rest("j", `/messages/${JK.id}/history`)).json.messages.length, rows.length);

  // =============== suspension fails closed and is reversible; the peer keeps read access ===============
  const H = open("h"), I = open("i"); await Promise.all([H.ready, I.ready]);
  assert.equal((await send(H.s, HI.id, "hello I")).ok, true);
  await db.user.update({ where: { id: users.i.id }, data: { suspendedAt: new Date() } });
  assert.equal((await send(I.s, HI.id, "suspended sender")).error.code, "UNAUTHENTICATED");
  await sleep(100);
  assert.equal(I.s.connected, false, "an already-connected suspended socket is dropped");
  assert.equal((await rest("i", "/messages")).status, 403);
  closedUnsent(await send(H.s, HI.id, "to a suspended peer"));
  closedUnsent(await ack(H.s, "typing:set", { matchId: HI.id, active: true }));
  const hSnap = (await rest("h", `/messages/${HI.id}`)).json;
  assert.deepEqual([hSnap.state, hSnap.messages.length], ["UNAVAILABLE", 1]);
  await db.user.update({ where: { id: users.i.id }, data: { suspendedAt: null } });
  assert.equal((await send(H.s, HI.id, "restored")).ok, true);

  // =============== token refresh and expiry ===============
  const X = open("e", { ttlMs: 1600 }); await X.ready;
  assert.equal((await ack(X.s, "auth:refresh", { token: tok("e", 60_000) })).ok, true);
  await sleep(1900);
  assert.equal(X.s.connected, true, "a refreshed token replaces the old expiry");
  const Y = open("e", { ttlMs: 1200 }); await Y.ready;
  await sleep(1500);
  assert.equal(Y.s.connected, false, "no refresh: the socket closes at token expiry");
  const Z = open("e"); await Z.ready;
  assert.equal((await ack(Z.s, "auth:refresh", { token: tok("a") })).error.code, "UNAUTHENTICATED", "another user's token can't be swapped in");
  await sleep(100);
  assert.equal(Z.s.connected, false);
  const S = open("e", { sid: "s1" }); await S.ready;
  assert.equal((await ack(S.s, "auth:refresh", { token: tok("e", 60_000, "s2") })).error.code, "UNAUTHENTICATED", "different session");
  assert.equal((await ack(X.s, "auth:refresh", { token: "x" })).error.code, "VALIDATION_ERROR");
  const many: ReturnType<typeof open>[] = [];
  for (let n = 0; n < 6; n++) many.push(open("e"));
  const settled = await Promise.allSettled(many.map((x) => x.ready));
  assert.ok(settled.filter((x) => x.status === "rejected").some((x) => /TOO_MANY/.test(String((x as PromiseRejectedResult).reason?.message))), "per-user socket cap");

  // =============== inbox ordering and keyset pagination ===============
  const extra = await Promise.all([1, 2, 3].map((n) => db.user.create({ data: { clerkUserId: `test_${stamp}_x${n}`, housingIntent: "TEAM_UP", onboardingCompletedAt: new Date() } })));
  await Promise.all(extra.map((u, n) => db.profile.create({ data: { userId: u.id, displayName: `X${n + 1}`, birthDate: new Date("1999-05-17T00:00:00Z"), occupation: "STUDENT", gender: "MAN" } })));
  const mkMatch = async (other: string, createdAt: Date, lastMessageAt: Date | null) => {
    const [low, high] = [users.a.id, other].sort();
    return db.match.create({ data: { userLowId: low!, userHighId: high!, scoreAtMatch: 80, scorePolicy: "compatibility-v1", createdAt, ...(lastMessageAt && { lastMessageAt, lastMessageSeq: 1 }) } });
  };
  const m1 = await mkMatch(extra[0]!.id, new Date("2020-01-01"), new Date(Date.now() + 3_600_000));
  await db.message.create({ data: { matchId: m1.id, senderId: extra[0]!.id, clientMessageId: uuid(), seq: 1, body: "newest of all" } });
  const m2 = await mkMatch(extra[1]!.id, new Date("2021-01-01"), null), m3 = await mkMatch(extra[2]!.id, new Date("2022-01-01"), null);
  const p1 = (await rest("a", "/messages?limit=2")).json;
  const p2 = (await rest("a", `/messages?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).json;
  const order = [...p1.conversations, ...p2.conversations].map((x: any) => x.id);
  assert.deepEqual(order, [m1.id, AB.id, m3.id, m2.id], "messages first (newest), then empty matches (newest), no duplicates across pages");
  assert.deepEqual([p1.nextCursor != null, p2.nextCursor, p1.conversations[0].last.body, p1.conversations[0].unread], [true, null, "newest of all", 1]);
  assert.equal(p1.unreadTotal, (await unread("a")));

  // =============== selected-message reports ===============
  const pubB = (await db.profile.findUniqueOrThrow({ where: { userId: users.b.id } })).publicId;
  const mm = await db.message.findMany({ where: { matchId: AB.id }, orderBy: { seq: "asc" }, take: 3 });
  const rep = (b: object, k: K = "a") => rest(k, "/reports", "POST", { publicId: pubB, reason: "HARASSMENT", ...b });
  assert.equal((await rep({ matchId: AB.id, messageIds: mm.slice(0, 2).map((x) => x.id), details: "rude" })).status, 200);
  const saved = await db.userReport.findFirstOrThrow({ where: { reporterId: users.a.id, matchId: AB.id } });
  const ev = (saved.snapshot as any).messages;
  assert.deepEqual(ev.map((x: any) => [x.seq, x.body, x.from]), mm.slice(0, 2).map((x) => [x.seq, x.body, x.senderId === users.a.id ? "reporter" : "reported"]), "excerpts come from stored rows");
  const jMsg = await db.message.findFirstOrThrow({ where: { matchId: JK.id } });
  assert.equal((await rep({ matchId: AB.id, messageIds: [jMsg.id] })).status, 422, "a message from another chat is rejected");
  assert.equal((await rep({ messageIds: [mm[0]!.id] })).status, 422, "needs the conversation");
  assert.equal((await rep({ matchId: AB.id, messageIds: Array.from({ length: 11 }, uuid) })).status, 422, "max 10");
  assert.equal((await rep({ matchId: AB.id, messageIds: [mm[0]!.id], excerpts: ["forged"] })).status, 422, "client excerpts are never accepted");
  assert.equal((await rep({ matchId: AB.id, messageIds: [mm[0]!.id] }, "e")).status, 422, "a non-member can't report using this match");
  assert.equal(await db.userReport.count({ where: { reporterId: users.a.id } }), 1);

  // reporting from an ended chat needs no profile reference: the conversation identifies the person
  assert.equal((await rest("c", "/reports", "POST", { reason: "HARASSMENT", matchId: CD.id, messageIds: [(await db.message.findFirstOrThrow({ where: { matchId: CD.id } })).id] })).status, 200);
  assert.equal(await db.userReport.count({ where: { reporterId: users.c.id, targetId: users.d.id, matchId: CD.id } }), 1);
  assert.equal((await rest("e", "/reports", "POST", { reason: "SCAM", matchId: CD.id })).status, 200, "same acknowledgement for a non-member");
  assert.equal(await db.userReport.count({ where: { reporterId: users.e.id } }), 0, "nothing stored for a non-member");
  assert.equal((await rest("c", "/reports", "POST", { reason: "SCAM" })).status, 422);

  // =============== database invariants ===============
  const base1 = { matchId: AB.id, senderId: users.a.id };
  const ins = (o: Partial<{ seq: number; body: string; cm: string }>) =>
    db.$executeRaw`INSERT INTO messages ("matchId","senderId","clientMessageId","seq","body") VALUES (${base1.matchId}::uuid, ${base1.senderId}::uuid, ${o.cm ?? uuid()}::uuid, ${o.seq ?? 9999}, ${o.body ?? "ok"})`;
  await assert.rejects(ins({ body: "" }), /check|constraint/i);
  await assert.rejects(ins({ body: "x".repeat(2001) }), /check|constraint/i);
  await assert.rejects(ins({ seq: 0 }), /check|constraint/i);
  await assert.rejects(ins({ seq: 1 }), /unique|duplicate/i);
  const dup = await db.message.findFirstOrThrow({ where: { matchId: AB.id, senderId: users.a.id } });
  await assert.rejects(ins({ cm: dup.clientMessageId, seq: 9998 }), /unique|duplicate/i);
  const lastAB = (await db.match.findUniqueOrThrow({ where: { id: AB.id } })).lastMessageSeq;
  assert.equal(await db.message.count({ where: { matchId: AB.id } }), lastAB, "sequence is gapless: count equals head");

  // =============== account deletion: coordinated, idempotent, peers reconcile ===============
  const F = open("f"), G = open("g"); await Promise.all([F.ready, G.ready]);
  await send(F.s, FG.id, "from F"); await send(G.s, FG.id, "from G");
  const listing = await db.flatListing.create({ data: { ownerId: users.f.id } });
  const photo = await db.flatPhoto.create({ data: { listingId: listing.id, stagingKey: `staging/${stamp}/p`, finalKey: `flats/${stamp}/p`, state: "READY", category: "ROOM", uploadExpiresAt: new Date(), contentHash: `h${stamp}`, mimeType: "image/webp", bytes: 1000, width: 800, height: 600 } });
  await db.flatListing.update({ where: { id: listing.id }, data: { coverPhotoId: photo.id } });
  assert.deepEqual(await deleteAccount(cid.f, storage), { deleted: true });
  assert.deepEqual(removed.sort(), [`flats/${stamp}/p`, `staging/${stamp}/p`].sort(), "listing photos removed from storage first");
  assert.equal(await db.user.count({ where: { clerkUserId: cid.f } }), 0);
  assert.equal(await db.message.count({ where: { matchId: FG.id } }), 0, "shared chat purged");
  assert.equal(await db.match.count({ where: { id: FG.id } }), 0);
  await sleep(150);
  assert.equal(F.s.connected, false, "the deleted account's sockets are dropped");
  await G.wait("inbox:changed");
  assert.equal((await rest("g", `/messages/${FG.id}`)).status, 404);
  assert.equal((await rest("g", "/messages")).json.conversations.some((x: any) => x.id === FG.id), false);
  assert.deepEqual(await deleteAccount(cid.f, storage), { deleted: false }, "repeat is a no-op");

  // =============== Clerk webhook: unconfigured, forged, and correctly signed ===============
  const hook = (path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) assert.equal((await hook("/webhooks/clerk", "{}")).status, 503, "no secret configured: does nothing");
  const secret = "whsec_" + Buffer.from("flatter-test-signing-secret").toString("base64");
  app.use("/api/hooks2", webhookRouter(storage, secret));
  const payload = JSON.stringify({ type: "user.deleted", data: { id: cid.k, deleted: true, object: "user" } });
  assert.equal((await hook("/hooks2/clerk", payload)).status, 400, "unsigned");
  assert.equal((await hook("/hooks2/clerk", payload, { "svix-id": "msg_1", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,AAAA" })).status, 400, "forged signature");
  assert.equal(await db.user.count({ where: { clerkUserId: cid.k } }), 1);
  const { createHmac } = await import("node:crypto");
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_2.${ts}.${payload}`).digest("base64");
  const signed = await hook("/hooks2/clerk", payload, { "svix-id": "msg_2", "svix-timestamp": ts, "svix-signature": `v1,${sig}` });
  assert.equal(signed.status, 200);
  assert.equal(await db.user.count({ where: { clerkUserId: cid.k } }), 0, "a verified user.deleted removes the account");
  assert.equal((await hook("/hooks2/clerk", payload, { "svix-id": "msg_2", "svix-timestamp": ts, "svix-signature": `v1,${sig}` })).status, 200, "Clerk retries are harmless");

  console.log("chat checks passed");
} finally {
  for (const s of sockets) s.disconnect();
  const users = await db.user.findMany({ where: { clerkUserId: { startsWith: `test_${stamp}_` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.flatPhoto.updateMany({ where: { listing: { ownerId: { in: ids } } }, data: {} });
  await db.flatPhoto.deleteMany({ where: { listing: { ownerId: { in: ids } } } });
  await db.flatListing.deleteMany({ where: { ownerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await rt.close();
  await db.$disconnect();
}
