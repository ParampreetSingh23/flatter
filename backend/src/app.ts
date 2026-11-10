import { clerkMiddleware, getAuth } from "@clerk/express";
import cors from "cors";
import express, { type ErrorRequestHandler, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { catalogue } from "./cities.js";
import { chatRouter } from "./chat.js";
import { listingsRouter } from "./listings.js";
import { matchingRouters } from "./matching.js";
import { onboardingRouter } from "./onboarding.js";
import { profileRouters } from "./profiles.js";
import { r2Storage, type Storage } from "./storage.js";
import { webhookRouter } from "./webhooks.js";

export function createApp(frontendOrigin: string, storage: Storage | null = r2Storage()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: frontendOrigin, allowedHeaders: ["Authorization", "Content-Type"] }));

  // Public liveness: registered before Clerk; no Clerk/DB calls.
  app.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok", service: "flatter-backend" });
  });

  // ponytail: per-IP in-memory limit; set `trust proxy` behind a proxy, use a shared store if scaled to >1 instance.
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many requests. Slow down." } } }));
  // Public reference data; Express adds an ETag, so clients revalidate cheaply.
  app.get("/api/locations", (_req, res) => void res.set("Cache-Control", "public, max-age=3600").json(catalogue));

  // Signed server-to-server events: own raw-body parser, verified by signature rather than by session.
  app.use("/api/webhooks", webhookRouter(storage));

  app.use("/api", clerkMiddleware({ authorizedParties: [frontendOrigin] }));

  app.get("/api/me", (req, res) => {
    res.set("Cache-Control", "no-store");
    const { isAuthenticated, userId } = getAuth(req);
    if (!isAuthenticated) return void res.status(401).json({ error: "Unauthorized" });
    res.json({ clerkUserId: userId });
  });

  const userId = (req: Request) => {
    const a = getAuth(req);
    return a.isAuthenticated ? a.userId : null;
  };
  app.use("/api/onboarding", onboardingRouter(userId));
  app.use("/api/listings", listingsRouter(userId, storage));
  const profiles = profileRouters(userId, storage);
  app.use("/api/dashboard", profiles.dashboard);
  app.use("/api/profile", profiles.me);
  app.use("/api/profiles", profiles.viewer);
  const matching = matchingRouters(userId, storage);
  app.use("/api/discovery", matching.discovery);
  app.use("/api/matches", matching.matches);
  app.use("/api/blocks", matching.blocks);
  app.use("/api/reports", matching.reports);
  app.use("/api/messages", chatRouter(userId));

  app.use((_req, res) => void res.status(404).json({ error: "Not found" }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);
  return app;
}
