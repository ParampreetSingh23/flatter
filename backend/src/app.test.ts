import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";

// Clerk SDK needs keys to initialise; fake ones suffice since we only test no-token paths.
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy";

const server = createApp("http://localhost:3000").listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

const health = await fetch(`${base}/health`, { headers: { Authorization: "Bearer garbage" } });
assert.equal(health.status, 200);
assert.match(health.headers.get("content-type") ?? "", /application\/json/);
assert.deepEqual(await health.json(), { status: "ok", service: "flatter-backend" });

const me = await fetch(`${base}/api/me`);
assert.equal(me.status, 401);
assert.deepEqual(await me.json(), { error: "Unauthorized" });

assert.equal((await fetch(`${base}/nope`)).status, 404);
server.close();
console.log("backend checks passed");
