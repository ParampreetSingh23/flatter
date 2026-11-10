import express, { type Router } from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { deleteAccount } from "./account-deletion.js";
import type { Storage } from "./storage.js";

// Clerk lifecycle events. Signature verification is Clerk's (Svix) via CLERK_WEBHOOK_SIGNING_SECRET, set only in the
// deployment secret store. Without it the route answers 503 and does nothing; it never trusts an unsigned body.
export function webhookRouter(storage: Storage | null, signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET): Router {
  const r = express.Router();
  r.post("/clerk", express.raw({ type: "application/json", limit: "64kb" }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!signingSecret) return void res.status(503).json({ error: { code: "WEBHOOKS_NOT_CONFIGURED", message: "Webhook signing secret is not configured." } });
    let evt;
    try {
      evt = await verifyWebhook(req, { signingSecret });
    } catch {
      return void res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Webhook verification failed." } });
    }
    if (evt.type !== "user.deleted" || !evt.data.id) return void res.json({ ok: true, ignored: true });
    try {
      await deleteAccount(evt.data.id, storage);
      res.json({ ok: true });
    } catch (e) {
      console.error("account deletion failed", e instanceof Error ? e.name : "error");
      res.status(500).json({ error: { code: "RETRY", message: "Will be retried." } }); // Clerk retries; the cleanup is idempotent
    }
  });
  return r;
}
