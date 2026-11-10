import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { ApiError } from "./http.js";
import { iso } from "./listing-rules.js";
import { blockedBetween, pairLock } from "./matching-data.js";
import { decodeCursor, encodeCursor, HISTORY_DEFAULT, normalizeBody, uuidRe } from "./chat-rules.js";
import { isAdult, istToday } from "./onboarding-rules.js";

type Db = Prisma.TransactionClient | typeof db;
export type ChatUser = Prisma.UserGetPayload<{ include: { profile: true } }>;
export type ConvState = "ACTIVE" | "READ_ONLY" | "UNAVAILABLE";

export const notFound = () => new ApiError(404, "NOT_FOUND", "Conversation not found.");
export const closedErr = () => new ApiError(409, "CONVERSATION_CLOSED", "This conversation has ended.");
export const invalid = (message: string) => new ApiError(422, "VALIDATION_ERROR", message);

/** Adult, onboarded, not suspended. Deliberately NOT discovery eligibility: a chat survives opting out of discovery. */
export const chatActorOk = (u: ChatUser | null | undefined, today = istToday()): u is ChatUser =>
  !!(u && u.onboardingCompletedAt && !u.suspendedAt && u.profile?.birthDate && isAdult(iso(u.profile.birthDate), today));

export const chatUserByClerk = async (clerkUserId: string) => {
  const u = await db.user.findUnique({ where: { clerkUserId }, include: { profile: true } });
  return chatActorOk(u) ? u : null;
};

async function stateOf(c: Db, m: { id: string; endedAt: Date | null }, me: ChatUser, peer: ChatUser): Promise<ConvState> {
  if (m.endedAt) return "READ_ONLY";
  if (await blockedBetween(c, me.id, peer.id, true)) return "READ_ONLY";
  return chatActorOk(peer) && chatActorOk(me) ? "ACTIVE" : "UNAVAILABLE";
}

/** Membership + effective state. Read permission needs an eligible member only; interaction needs state ACTIVE. */
export async function openConversation(c: Db, me: ChatUser, matchId: string) {
  if (!uuidRe.test(matchId)) throw notFound();
  const m = await c.match.findUnique({ where: { id: matchId } });
  if (!m || (m.userLowId !== me.id && m.userHighId !== me.id)) throw notFound();
  const peer = await c.user.findUnique({ where: { id: m.userLowId === me.id ? m.userHighId : m.userLowId }, include: { profile: true } });
  if (!peer) throw notFound();
  return { m, peer, state: await stateOf(c, m, me, peer) };
}
export async function requireInteractive(me: ChatUser, matchId: string) {
  const conv = await openConversation(db, me, matchId);
  if (conv.state !== "ACTIVE") throw closedErr();
  return conv;
}

type MessageRow = Prisma.MessageGetPayload<object>;
export const messageDto = (m: MessageRow, meId: string) => ({
  id: m.id, seq: m.seq, mine: m.senderId === meId, body: m.body, createdAt: m.createdAt.toISOString(),
  ...(m.senderId === meId && { clientMessageId: m.clientMessageId }),
});
// Neutral identity once a chat is not interactive: no avatar and no profile link; the name stays so history makes sense.
export const peerDto = (peer: ChatUser, state: ConvState) => ({
  displayName: peer.profile?.displayName ?? null,
  avatarUrl: state === "ACTIVE" ? peer.profile?.avatarUrl ?? null : null,
  publicId: state === "ACTIVE" && peer.discoveryEnabled ? peer.profile?.publicId ?? null : null,
});

const cursorsOf = (rows: { userId: string; deliveredThroughSeq: number; readThroughSeq: number }[], id: string) => {
  const r = rows.find((x) => x.userId === id);
  return { delivered: r?.deliveredThroughSeq ?? 0, read: r?.readThroughSeq ?? 0 };
};

export async function historyPage(c: Db, matchId: string, q: { beforeSeq?: number | undefined; afterSeq?: number | undefined; limit: number }, meId: string) {
  if (q.afterSeq !== undefined) {
    const rows = await c.message.findMany({ where: { matchId, seq: { gt: q.afterSeq } }, orderBy: { seq: "asc" }, take: q.limit + 1 });
    return { messages: rows.slice(0, q.limit).map((r) => messageDto(r, meId)), hasMore: rows.length > q.limit };
  }
  const rows = await c.message.findMany({ where: { matchId, ...(q.beforeSeq !== undefined && { seq: { lt: q.beforeSeq } }) }, orderBy: { seq: "desc" }, take: q.limit + 1 });
  return { messages: rows.slice(0, q.limit).reverse().map((r) => messageDto(r, meId)), hasMore: rows.length > q.limit };
}

export async function conversationSnapshot(me: ChatUser, matchId: string) {
  const { m, peer, state } = await openConversation(db, me, matchId);
  const [page, states, unread] = await Promise.all([
    historyPage(db, m.id, { limit: HISTORY_DEFAULT }, me.id),
    db.chatMemberState.findMany({ where: { matchId: m.id } }),
    state === "READ_ONLY" ? 0 : unreadFor(me.id, [m.id]).then((x) => x.get(m.id) ?? 0),
  ]);
  return {
    id: m.id, state, peer: peerDto(peer, state), headSeq: m.lastMessageSeq, endedAt: m.endedAt?.toISOString() ?? null,
    cursors: { me: cursorsOf(states, me.id), peer: cursorsOf(states, peer.id) }, unread, ...page,
  };
}

/** Unread INCOMING messages per active conversation (own messages never count; ended chats are hidden). */
export async function unreadFor(meId: string, matchIds: string[]) {
  const out = new Map<string, number>();
  if (!matchIds.length) return out;
  const rows = await db.$queryRaw<{ id: string; n: number }[]>`
    SELECT msg."matchId"::text AS id, count(*)::int AS n FROM messages msg
    JOIN matches m ON m.id = msg."matchId" AND m."endedAt" IS NULL
    LEFT JOIN chat_member_states s ON s."matchId" = msg."matchId" AND s."userId" = ${meId}::uuid
    WHERE msg."matchId" = ANY(${matchIds}::uuid[]) AND msg."senderId" <> ${meId}::uuid AND msg.seq > COALESCE(s."readThroughSeq", 0)
    GROUP BY msg."matchId"`;
  for (const r of rows) out.set(r.id, r.n);
  return out;
}
export async function unreadTotal(meId: string) {
  const [r] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM messages msg
    JOIN matches m ON m.id = msg."matchId" AND m."endedAt" IS NULL AND (m."userLowId" = ${meId}::uuid OR m."userHighId" = ${meId}::uuid)
    LEFT JOIN chat_member_states s ON s."matchId" = msg."matchId" AND s."userId" = ${meId}::uuid
    WHERE msg."senderId" <> ${meId}::uuid AND msg.seq > COALESCE(s."readThroughSeq", 0)`;
  return r?.n ?? 0;
}

export async function inboxPage(me: ChatUser, q: { cursor?: string | undefined; limit: number }) {
  const cur = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cur) throw invalid("Invalid cursor.");
  const after = cur
    ? Prisma.sql`AND ((m."lastMessageAt" IS NULL)::int > ${cur.g} OR ((m."lastMessageAt" IS NULL)::int = ${cur.g} AND (
        COALESCE(m."lastMessageAt", m."createdAt") < ${cur.t}::timestamptz OR (COALESCE(m."lastMessageAt", m."createdAt") = ${cur.t}::timestamptz AND m.id < ${cur.id}::uuid))))`
    : Prisma.empty;
  // Conversations with messages first (newest message), then empty active matches (newest match); id breaks ties.
  const ids = (await db.$queryRaw<{ id: string }[]>`
    SELECT m.id::text AS id FROM matches m
    WHERE (m."userLowId" = ${me.id}::uuid OR m."userHighId" = ${me.id}::uuid) AND (m."endedAt" IS NULL OR m."lastMessageSeq" > 0) ${after}
    ORDER BY (m."lastMessageAt" IS NULL), COALESCE(m."lastMessageAt", m."createdAt") DESC, m.id DESC
    LIMIT ${q.limit + 1}`).map((r) => r.id);
  const pageIds = ids.slice(0, q.limit);
  const matches = await db.match.findMany({ where: { id: { in: pageIds } } });
  const order = new Map(pageIds.map((id, i) => [id, i]));
  matches.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const peerIds = matches.map((m) => (m.userLowId === me.id ? m.userHighId : m.userLowId));
  const [peers, blocks, lasts, unread] = await Promise.all([
    db.user.findMany({ where: { id: { in: peerIds } }, include: { profile: true } }),
    db.userBlock.findMany({ where: { revokedAt: null, OR: [{ blockerId: me.id, blockedId: { in: peerIds } }, { blockedId: me.id, blockerId: { in: peerIds } }] }, select: { blockerId: true, blockedId: true } }),
    db.message.findMany({ where: { OR: matches.filter((m) => m.lastMessageSeq > 0).map((m) => ({ matchId: m.id, seq: m.lastMessageSeq })) } }),
    unreadFor(me.id, pageIds),
  ]);
  const blockedPeers = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  const conversations = matches.flatMap((m) => {
    const peer = peers.find((p) => p.id === (m.userLowId === me.id ? m.userHighId : m.userLowId));
    if (!peer) return [];
    const state: ConvState = m.endedAt || blockedPeers.has(peer.id) ? "READ_ONLY" : chatActorOk(peer) && chatActorOk(me) ? "ACTIVE" : "UNAVAILABLE";
    const last = lasts.find((x) => x.matchId === m.id);
    return [{
      id: m.id, state, peer: peerDto(peer, state), matchedAt: m.createdAt.toISOString(), lastMessageAt: m.lastMessageAt?.toISOString() ?? null,
      last: last ? { seq: last.seq, mine: last.senderId === me.id, body: last.body, createdAt: last.createdAt.toISOString() } : null,
      unread: m.endedAt ? 0 : unread.get(m.id) ?? 0,
    }];
  });
  const lastRow = matches[matches.length - 1];
  const nextCursor = ids.length > q.limit && lastRow
    ? encodeCursor({ g: lastRow.lastMessageAt ? 0 : 1, t: (lastRow.lastMessageAt ?? lastRow.createdAt).toISOString(), id: lastRow.id }) : null;
  return { conversations, nextCursor };
}

/** True when this sender already committed this client id in this conversation (a retry, not a fresh send). */
export const isRetry = async (meId: string, matchId: string, clientMessageId: string) =>
  uuidRe.test(matchId) && !!(await db.message.findUnique({ where: { matchId_senderId_clientMessageId: { matchId, senderId: meId, clientMessageId } }, select: { id: true } }));

/** Commit-first send. Pair lock + share-locked user rows; returns the canonical row and whether it was newly inserted. */
export async function sendMessage(me: ChatUser, matchId: string, clientMessageId: string, raw: string) {
  const n = normalizeBody(raw);
  if (!n.ok) throw invalid(n.message);
  if (!uuidRe.test(matchId)) throw notFound();
  const pre = await db.match.findUnique({ where: { id: matchId }, select: { userLowId: true, userHighId: true } });
  if (!pre || (pre.userLowId !== me.id && pre.userHighId !== me.id)) throw notFound();
  return db.$transaction(async (tx) => {
    await pairLock(tx, pre.userLowId, pre.userHighId);
    // Share-lock both accounts (id order) so a concurrent suspension waits for this send, or this send sees the suspension.
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT id FROM users WHERE id IN (${pre.userLowId}::uuid, ${pre.userHighId}::uuid) ORDER BY id FOR SHARE) AS l`;
    const existing = await tx.message.findUnique({ where: { matchId_senderId_clientMessageId: { matchId, senderId: me.id, clientMessageId } } });
    if (existing) {
      if (existing.body !== n.body) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "That message ID was already used for different text.");
      return { message: existing, created: false, peerId: pre.userLowId === me.id ? pre.userHighId : pre.userLowId };
    }
    const meNow = await tx.user.findUnique({ where: { id: me.id }, include: { profile: true } });
    const conv = meNow && chatActorOk(meNow) ? await openConversation(tx, meNow, matchId) : null;
    if (!conv) throw notFound();
    if (conv.state !== "ACTIVE") throw closedErr();
    const now = new Date();
    const bumped = await tx.match.update({ where: { id: matchId }, data: { lastMessageSeq: { increment: 1 }, lastMessageAt: now }, select: { lastMessageSeq: true } });
    const message = await tx.message.create({ data: { matchId, senderId: me.id, clientMessageId, seq: bumped.lastMessageSeq, body: n.body, createdAt: now } });
    return { message, created: true, peerId: conv.peer.id };
  }, { timeout: 10_000 });
}

/** Monotonic cursors. Reading implies delivery. Only for an active conversation; never creates rows on GET. */
export async function advanceReceipts(me: ChatUser, matchId: string, kind: "delivered" | "read", through: number) {
  if (!uuidRe.test(matchId)) throw notFound();
  const pre = await db.match.findUnique({ where: { id: matchId }, select: { userLowId: true, userHighId: true } });
  if (!pre || (pre.userLowId !== me.id && pre.userHighId !== me.id)) throw notFound();
  return db.$transaction(async (tx) => {
    await pairLock(tx, pre.userLowId, pre.userHighId);
    const conv = await openConversation(tx, me, matchId);
    if (conv.state !== "ACTIVE") throw closedErr();
    if (through > conv.m.lastMessageSeq) throw invalid("That message doesn't exist yet.");
    const cur = await tx.chatMemberState.findUnique({ where: { matchId_userId: { matchId, userId: me.id } } });
    const read = Math.max(cur?.readThroughSeq ?? 0, kind === "read" ? through : 0);
    const delivered = Math.max(cur?.deliveredThroughSeq ?? 0, through, read);
    const changed = !cur || read !== cur.readThroughSeq || delivered !== cur.deliveredThroughSeq;
    if (changed) await tx.chatMemberState.upsert({
      where: { matchId_userId: { matchId, userId: me.id } },
      create: { matchId, userId: me.id, deliveredThroughSeq: delivered, readThroughSeq: read }, update: { deliveredThroughSeq: delivered, readThroughSeq: read },
    });
    return { changed, delivered, read, peerId: conv.peer.id };
  });
}

/** Evidence for a report: only rows from this conversation, rebuilt from the database, never client-supplied text. */
export async function reportEvidence(matchId: string, reporterId: string, messageIds: string[]) {
  const ids = [...new Set(messageIds)];
  const rows = await db.message.findMany({ where: { matchId, id: { in: ids } }, orderBy: { seq: "asc" } });
  if (rows.length !== ids.length) return null;
  return rows.map((r) => ({ seq: r.seq, from: r.senderId === reporterId ? "reporter" : "reported", sentAt: r.createdAt.toISOString(), body: r.body }));
}
