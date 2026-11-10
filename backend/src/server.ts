import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { runCleanup } from "./cleanup.js";
import { attachRealtime } from "./realtime.js";
import { r2Storage } from "./storage.js";

const port = Number(process.env.PORT ?? 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1-65535");
if (!frontendOrigin) throw new Error("FRONTEND_ORIGIN is required");
if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required");
}

const storage = r2Storage();
if (!storage) console.warn("R2 not configured: flat photo upload and publishing are disabled.");
// One always-running process: REST and Socket.IO share this HTTP server. Rooms and rate limits are in memory,
// so run exactly one instance until a shared Socket.IO adapter exists (docs/messaging.md section 9).
const server = createServer(createApp(frontendOrigin, storage));
const realtime = attachRealtime(server, { frontendOrigin });
server.listen(port, () => {
  console.log(`flatter-backend listening on :${port}`);
});
server.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  // Drain: disconnect sockets (clients reconnect to the next instance) and close the HTTP server; force-exit if it hangs.
  process.on(sig, () => {
    setTimeout(() => process.exit(0), 10_000).unref();
    void realtime.close().then(() => process.exit(0));
  });
}

// ponytail: in-process timer, fine for one instance; use a scheduled job if the API is scaled out.
if (storage) {
  const tick = () => runCleanup(storage).catch((e) => console.error("cleanup run failed", e));
  setInterval(tick, 15 * 60_000).unref();
}
