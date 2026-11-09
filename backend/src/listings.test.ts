import "dotenv/config";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { runCleanup } from "./cleanup.js";
import { db } from "./db.js";
import { listingsRouter } from "./listings.js";
import type { Storage } from "./storage.js";

// In-memory R2 stand-in. Presigned URLs are fake; tests "upload" by writing to the map.
const objects = new Map<string, Buffer>();
const storage: Storage = {
  presignPut: async (k) => `https://r2.test/put/${k}`,
  presignGet: async (k) => `https://r2.test/get/${k}?ttl=60`,
  read: async (k, max) => {
    const b = objects.get(k) ?? null;
    if (b && b.length > max) throw new Error("TOO_LARGE");
    return b;
  },
  write: async (k, b) => void objects.set(k, b),
  exists: async (k) => objects.has(k),
  remove: async (k) => void objects.delete(k),
};

const app = express();
app.use("/api/listings", listingsRouter((req) => req.header("x-test-user") ?? null, storage));
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api/listings`;
const stamp = Date.now();
const ids = { owner: `test_${stamp}_owner`, other: `test_${stamp}_other`, seeker: `test_${stamp}_seeker`, fresh: `test_${stamp}_fresh` };

const call = async (id: string | null, method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(id && { "x-test-user": id }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: (await res.json()) as any };
};
const img = (r: number, g: number, b: number, w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();

async function upload(v: number, category: string, bytes: Buffer, mime = "image/jpeg") {
  const slot = await call(ids.owner, "POST", `/${L}/photos/uploads`, { version: v, contentType: mime, bytes: bytes.length, category });
  if (slot.status !== 200) return { slot };
  const key = (slot.json.uploadUrl as string).replace("https://r2.test/put/", "");
  objects.set(key, bytes); // browser PUT
  const done = await call(ids.owner, "POST", `/${L}/photos/${slot.json.photoId}/complete`, {});
  return { slot, done, photoId: slot.json.photoId as string, key };
}
let L = "";

try {
  // --- users: completed HAVE_ROOM owner, completed NEED_ROOM seeker, completed other, unfinished user ---
  const mk = (clerkUserId: string, intent: "HAVE_ROOM" | "NEED_ROOM" | null, done: boolean) =>
    db.user.create({ data: { clerkUserId, housingIntent: intent, onboardingCompletedAt: done ? new Date() : null } });
  const owner = await mk(ids.owner, "HAVE_ROOM", true);
  await mk(ids.other, "HAVE_ROOM", true);
  await mk(ids.seeker, "NEED_ROOM", true);
  await mk(ids.fresh, null, false);
  await db.profile.create({ data: { userId: owner.id, displayName: "Asha" } });
  await db.housingPreference.create({
    data: { userId: owner.id, city: "delhi", preferredLocations: ["delhi.saket"], locationsFlexible: false, monthlyRentMinPaise: 1500000, monthlyRentMaxPaise: 1500000, moveInFlexible: true },
  });

  // --- access ---
  assert.equal((await call(null, "GET", "/mine")).status, 401);
  assert.equal((await call(ids.fresh, "POST", "/", {})).json.error.code, "NOT_ELIGIBLE");
  assert.equal((await call(ids.seeker, "POST", "/", {})).status, 403, "only HAVE_ROOM creates");
  const mine0 = (await call(ids.seeker, "GET", "/mine")).json;
  assert.deepEqual([mine0.listing, mine0.canCreate], [null, false]);
  assert.equal((await call(ids.owner, "GET", "/mine")).json.listing, null);
  assert.equal(await db.flatListing.count({ where: { ownerId: owner.id } }), 0, "GET must not create");

  // --- idempotent create + prefill ---
  const [c1, c2] = await Promise.all([call(ids.owner, "POST", "/", {}), call(ids.owner, "POST", "/", {})]);
  assert.equal(c1.json.id, c2.json.id);
  L = c1.json.id;
  let l = c1.json;
  assert.equal(l.status, "DRAFT");
  assert.equal(l.details.localityId, "delhi.saket");
  assert.equal(l.details.monthlyRentPaise, 1500000);
  assert.equal(l.details.availableFlexible, true);
  assert.equal(l.checklist.canPublish, false);

  // --- partial draft saves; invalid values and tampering rejected ---
  const bad = (body: object) => call(ids.owner, "PATCH", `/${L}`, { version: l.version, ...body });
  assert.equal((await bad({ title: "short" })).status, 422);
  assert.equal((await bad({ localityId: "noida.sector-62", cityId: "delhi" })).status, 422);
  assert.equal((await bad({ cityId: "pune" })).status, 422);
  assert.equal((await bad({ bedrooms: 11 })).status, 422);
  assert.equal((await bad({ status: "PUBLISHED" })).status, 422);
  assert.equal((await bad({ availableFrom: "2020-01-01" })).status, 422);
  assert.equal((await call(ids.other, "PATCH", `/${L}`, { version: l.version, title: "Not my listing" })).status, 404);
  l = (await bad({ title: "Sunny room near Saket metro", description: "A bright furnished room in a friendly three-bedroom flat close to the metro.", bedrooms: 3, availablePlaces: 1, roomType: "PRIVATE", furnishing: "FURNISHED", depositPaise: 0, chargesNote: "Included in rent", permissionConfirmed: true })).json;
  assert.equal(l.version, 1);
  assert.equal(l.details.permissionConfirmed, true);
  assert.equal((await call(ids.owner, "PATCH", `/${L.id ?? L}`, {})).status, 422); // missing version
  assert.equal((await call(ids.owner, "PATCH", `/${l.id}`, { version: 0, depositPaise: 5 })).status, 409, "stale version");
  l = (await call(ids.owner, "PATCH", `/${l.id}`, { version: 1, cityId: "gurugram" })).json;
  assert.equal(l.details.localityId, null, "city change clears locality");
  l = (await call(ids.owner, "PATCH", `/${l.id}`, { version: 2, cityId: "delhi", localityId: "delhi.saket" })).json;

  // --- photo slots + sanitising ---
  assert.equal((await call(ids.owner, "POST", `/${L}/photos/uploads`, { version: l.version, contentType: "image/gif", bytes: 10, category: "ROOM" })).status, 422);
  assert.equal((await call(ids.owner, "POST", `/${L}/photos/uploads`, { version: l.version, contentType: "image/jpeg", bytes: 6 * 1024 * 1024, category: "ROOM" })).status, 422);
  assert.equal((await call(ids.seeker, "POST", `/${L}/photos/uploads`, { version: l.version, contentType: "image/jpeg", bytes: 10, category: "ROOM" })).status, 403);

  const spoof = await upload(l.version, "ROOM", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
  assert.equal(spoof.done?.json.error.code, "PHOTO_REJECTED", "non-image bytes rejected");
  assert.equal((await call(ids.owner, "POST", `/${L}/photos/${spoof.photoId}/complete`, {})).status, 422, "failed stays failed");
  const tiny = await upload(l.version, "ROOM", await img(1, 2, 3, 300, 200));
  assert.equal(tiny.done?.json.error.code, "PHOTO_REJECTED", "below minimum size");
  const missing = await call(ids.owner, "POST", `/${L}/photos/uploads`, { version: l.version, contentType: "image/jpeg", bytes: 100, category: "ROOM" });
  assert.equal((await call(ids.owner, "POST", `/${L}/photos/${missing.json.photoId}/complete`, {})).json.error.code, "UPLOAD_MISSING");

  // EXIF/GPS stripped: input has metadata, output must not
  const withExif = await sharp(await img(200, 10, 10)).withExif({ IFD0: { Copyright: "secret-gps-owner" } }).jpeg().toBuffer();
  const p1 = await upload(l.version, "ROOM", withExif);
  assert.equal(p1.done?.status, 200, JSON.stringify(p1.done?.json));
  const finalBytes = objects.get((await db.flatPhoto.findUniqueOrThrow({ where: { id: p1.photoId! } })).finalKey!)!;
  assert.equal(finalBytes.includes("secret-gps-owner"), false);
  assert.equal((await sharp(finalBytes).metadata()).format, "webp");
  assert.equal(objects.has(p1.key!), false, "staging deleted");
  const again = await call(ids.owner, "POST", `/${L}/photos/${p1.photoId}/complete`, {});
  assert.equal(again.status, 200, "complete is idempotent");

  const ver = () => db.flatListing.findUniqueOrThrow({ where: { id: L } }).then((x) => x.version);
  const dup = await upload(await ver(), "ROOM", withExif);
  assert.equal(dup.done?.json.error.code, "PHOTO_REJECTED", "duplicate decoded photo");
  const p2 = await upload(await ver(), "SHARED_SPACE", await img(10, 200, 10));
  const p3 = await upload(await ver(), "OTHER", await img(10, 10, 200));
  assert.equal(p2.done?.status, 200);
  assert.equal(p3.done?.status, 200);

  // --- publish gate: cover missing ---
  const pub = (v: number, who = ids.owner) => call(who, "POST", `/${L}/publish`, { version: v });
  let r = await pub(await ver());
  assert.equal(r.status, 422);
  assert.ok(r.json.error.fields.coverPhotoId, "cover required");
  assert.equal((await db.flatListing.findUniqueOrThrow({ where: { id: L } })).status, "DRAFT");

  // order/cover: exact set, unique ids, own photos only
  const set = (photos: object[], cover: string | null, v: number) => call(ids.owner, "PATCH", `/${L}/photos`, { version: v, photos, coverPhotoId: cover });
  assert.equal((await set([{ id: p1.photoId, category: "ROOM" }], p1.photoId!, await ver())).status, 422, "must list every ready photo");
  assert.equal((await set([{ id: p1.photoId, category: "ROOM" }, { id: p1.photoId, category: "ROOM" }, { id: p2.photoId, category: "SHARED_SPACE" }], null, await ver())).status, 422);
  const ordered = [{ id: p2.photoId, category: "SHARED_SPACE" }, { id: p1.photoId, category: "ROOM" }, { id: p3.photoId, category: "OTHER" }];
  assert.equal((await set(ordered, "00000000-0000-4000-8000-000000000000", await ver())).status, 422, "cover must be a ready photo");
  l = (await set(ordered, p1.photoId!, await ver())).json;
  assert.deepEqual(l.photos.filter((p: any) => p.state === "READY").map((p: any) => p.id), [p2.photoId, p1.photoId, p3.photoId]);
  assert.equal(l.checklist.canPublish, true, JSON.stringify(l.checklist));
  assert.match(l.photos.find((p: any) => p.state === "READY").url, /ttl=60/);

  // --- publish ---
  assert.equal((await pub(l.version - 1)).status, 409);
  assert.equal((await pub(l.version, ids.seeker)).status, 403);
  r = await pub(l.version);
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "PUBLISHED");
  l = r.json;

  // --- viewers ---
  const view = (who: string | null) => call(who, "GET", `/${L}`);
  const seen = await view(ids.seeker);
  assert.equal(seen.status, 200);
  assert.equal(seen.json.owner.displayName, "Asha");
  assert.equal(seen.json.checklist, undefined);
  assert.equal(seen.json.version, undefined);
  assert.equal(JSON.stringify(seen.json).includes("clerk"), false);
  assert.equal((await view(ids.fresh)).status, 403, "viewer must have completed onboarding");
  assert.equal((await view(null)).status, 401);

  // --- editing a published listing pauses it (no stale public snapshot) ---
  l = (await call(ids.owner, "PATCH", `/${L}`, { version: l.version, depositPaise: 500000 })).json;
  assert.equal(l.status, "PAUSED");
  assert.equal((await view(ids.seeker)).status, 404, "paused is hidden");
  assert.equal((await view(ids.other)).status, 404, "other owner can't see it either");
  r = await pub(l.version);
  assert.equal(r.json.status, "PUBLISHED");
  l = r.json;

  // removing a ready photo pauses and breaks the gate (2 left)
  const rm = await call(ids.owner, "DELETE", `/${L}/photos/${p3.photoId}?version=${l.version}`);
  assert.equal(rm.status, 200);
  assert.equal(rm.json.status, "PAUSED");
  assert.equal(rm.json.photos.filter((p: any) => p.state === "READY").length, 2);
  assert.equal(objects.size, 2, "removed photo's bytes deleted");
  assert.equal((await pub(rm.json.version)).status, 422);

  // --- pause / close / reopen; close works with R2 gone; late finalize cannot resurrect ---
  const slot = await call(ids.owner, "POST", `/${L}/photos/uploads`, { version: rm.json.version, contentType: "image/jpeg", bytes: 100, category: "OTHER" });
  objects.set((slot.json.uploadUrl as string).replace("https://r2.test/put/", ""), await img(99, 99, 99));
  const down = { ...storage, exists: async () => { throw new Error("ECONNREFUSED"); } };
  const downApp = express();
  downApp.use("/api/listings", listingsRouter((req) => req.header("x-test-user") ?? null, down));
  const downServer = downApp.listen(0);
  const dbase = `http://localhost:${(downServer.address() as AddressInfo).port}/api/listings`;
  const closeRes = await fetch(`${dbase}/${L}/close`, { method: "POST", headers: { "content-type": "application/json", "x-test-user": ids.owner }, body: JSON.stringify({ version: rm.json.version }) });
  assert.equal(closeRes.status, 200, "close needs only the DB");
  const closed = (await closeRes.json()) as any;
  assert.equal(closed.status, "CLOSED");
  const late = await call(ids.owner, "POST", `/${L}/photos/${slot.json.photoId}/complete`, {});
  assert.equal(late.status, 409);
  assert.equal((await db.flatListing.findUniqueOrThrow({ where: { id: L } })).status, "CLOSED");
  assert.equal((await call(ids.owner, "POST", `/${L}/photos/uploads`, { version: closed.version, contentType: "image/jpeg", bytes: 10, category: "ROOM" })).status, 409);
  assert.equal((await pub(closed.version)).status, 409, "must reopen first");
  const reopened = (await call(ids.owner, "POST", `/${L}/reopen`, { version: closed.version })).json;
  assert.equal(reopened.status, "DRAFT");
  // publish with R2 unreachable never publishes
  const pubDown = await fetch(`${dbase}/${L}/publish`, { method: "POST", headers: { "content-type": "application/json", "x-test-user": ids.owner }, body: JSON.stringify({ version: reopened.version }) });
  assert.equal(pubDown.status, 503);
  assert.equal((await db.flatListing.findUniqueOrThrow({ where: { id: L } })).status, "DRAFT");
  downServer.close();

  // --- cleanup: expired pending, delete-pending and abandoned claims are removed; ready photos kept ---
  const stale = await db.flatPhoto.create({ data: { listingId: L, category: "OTHER", stagingKey: `staging/${L}/old/x`, uploadExpiresAt: new Date(Date.now() - 3 * 3600_000) } });
  objects.set(stale.stagingKey, Buffer.from("x"));
  const ready = await db.flatPhoto.count({ where: { listingId: L, state: "READY" } });
  await runCleanup(storage);
  assert.equal(await db.flatPhoto.count({ where: { id: stale.id } }), 0);
  assert.equal(objects.has(stale.stagingKey), false);
  assert.equal(await db.flatPhoto.count({ where: { listingId: L, state: "DELETE_PENDING" } }), 0, "closed-listing pending upload cleaned");
  assert.equal(await db.flatPhoto.count({ where: { listingId: L, state: "READY" } }), ready, "accepted photos untouched");

  console.log("listing checks passed");
} finally {
  const users = await db.user.findMany({ where: { clerkUserId: { in: Object.values(ids) } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  await db.flatListing.updateMany({ where: { ownerId: { in: uids } }, data: { coverPhotoId: null } });
  await db.flatPhoto.deleteMany({ where: { listing: { ownerId: { in: uids } } } });
  await db.flatListing.deleteMany({ where: { ownerId: { in: uids } } });
  await db.user.deleteMany({ where: { id: { in: uids } } });
  server.close();
  await db.$disconnect();
}
