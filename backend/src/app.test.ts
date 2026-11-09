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

// public catalogue: six cities, globally unique locality IDs, each prefixed by its city
const loc = await fetch(`${base}/api/locations`);
assert.equal(loc.status, 200);
assert.ok(loc.headers.get("etag"));
const cat = (await loc.json()) as { cities: { id: string; localities: { id: string }[] }[] };
assert.deepEqual(cat.cities.map((c) => c.id), ["delhi", "gurugram", "noida", "greater-noida", "ghaziabad", "faridabad"]);
const all = cat.cities.flatMap((c) => c.localities.map((l) => l.id));
assert.equal(new Set(all).size, all.length);
assert.ok(cat.cities.every((c) => c.localities.every((l) => l.id.startsWith(`${c.id}.`))));
assert.equal(health.headers.get("x-content-type-options"), "nosniff"); // helmet

let limited = 0;
for (let i = 0; i < 130; i++) if ((await fetch(`${base}/api/me`)).status === 429) limited++;
assert.ok(limited > 0, "rate limit kicks in");
assert.equal((await fetch(`${base}/health`)).status, 200, "health is not rate limited");
server.close();
console.log("backend checks passed");
