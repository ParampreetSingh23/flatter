import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1-65535");
if (!frontendOrigin) throw new Error("FRONTEND_ORIGIN is required");
if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required");
}

const server = createApp(frontendOrigin).listen(port, () => {
  console.log(`flatter-backend listening on :${port}`);
});
server.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close());
