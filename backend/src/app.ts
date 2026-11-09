import { clerkMiddleware, getAuth } from "@clerk/express";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { onboardingRouter } from "./onboarding.js";

export function createApp(frontendOrigin: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: frontendOrigin, allowedHeaders: ["Authorization", "Content-Type"] }));

  // Public liveness: registered before Clerk; no Clerk/DB calls.
  app.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok", service: "flatter-backend" });
  });

  app.use("/api", clerkMiddleware({ authorizedParties: [frontendOrigin] }));

  app.get("/api/me", (req, res) => {
    res.set("Cache-Control", "no-store");
    const { isAuthenticated, userId } = getAuth(req);
    if (!isAuthenticated) return void res.status(401).json({ error: "Unauthorized" });
    res.json({ clerkUserId: userId });
  });

  app.use("/api/onboarding", onboardingRouter((req) => {
    const a = getAuth(req);
    return a.isAuthenticated ? a.userId : null;
  }));

  app.use((_req, res) => void res.status(404).json({ error: "Not found" }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);
  return app;
}
