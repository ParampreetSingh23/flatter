import { type Request, Router } from "express";
import { chatUserByClerk, conversationSnapshot, historyPage, inboxPage, notFound, openConversation, unreadTotal } from "./chat-data.js";
import { historyQuery, inboxQuery } from "./chat-rules.js";
import { db } from "./db.js";
import { ApiError, apiErrorHandler } from "./http.js";
import { base } from "./profiles.js";

// Chat reads. Sends, receipts and typing are Socket.IO events (realtime.ts). All responses are private/no-store.
export function chatRouter(getUserId: (req: Request) => string | null): Router {
  const r = base(getUserId);
  const me = async (req: Request) => {
    const u = await chatUserByClerk(getUserId(req)!);
    if (!u) throw new ApiError(403, "NOT_ELIGIBLE", "Messaging isn't available for this account.");
    return u;
  };
  r.get("/", async (req, res) => {
    const u = await me(req);
    const q = inboxQuery.parse(req.query);
    res.json({ ...(await inboxPage(u, q)), unreadTotal: await unreadTotal(u.id) });
  });
  r.get("/unread", async (req, res) => void res.json({ unread: await unreadTotal((await me(req)).id) }));
  r.get("/:matchId", async (req, res) => void res.json(await conversationSnapshot(await me(req), req.params.matchId as string)));
  r.get("/:matchId/history", async (req, res) => {
    const u = await me(req);
    const q = historyQuery.parse(req.query);
    const conv = await openConversation(db, u, req.params.matchId as string);
    if (!conv) throw notFound();
    const page = await historyPage(db, conv.m.id, q, u.id);
    res.json({ ...page, headSeq: conv.m.lastMessageSeq, state: conv.state });
  });
  r.use(apiErrorHandler);
  return r;
}
