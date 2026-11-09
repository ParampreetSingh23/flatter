import { randomUUID } from "node:crypto";
import express, { type Request, type RequestHandler, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { CITY_IDS, LOCALITY_CITY } from "./cities.js";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { ApiError, apiErrorHandler } from "./http.js";
import { blockedBetween } from "./matching-data.js";
import { ImageRejected, MAX_BYTES, sanitizeImage } from "./images.js";
import {
  cityLabel, iso, localityLabel, MAX_PHOTOS, missingItems, patchBody, photosBody, uploadBody, versionBody,
} from "./listing-rules.js";
import { istToday } from "./onboarding-rules.js";
import type { Storage } from "./storage.js";

type Tx = Prisma.TransactionClient;
const PHOTO_LEASE_MS = 2 * 60_000;
const UPLOAD_TTL_MS = 5 * 60_000;

const versionConflict = () => new ApiError(409, "VERSION_CONFLICT", "This listing changed elsewhere. Reload to continue.");
const notFound = () => new ApiError(404, "NOT_FOUND", "Listing not found.");
const notEligible = (m: string) => new ApiError(403, "NOT_ELIGIBLE", m);
const noStorage = () => new ApiError(503, "STORAGE_UNAVAILABLE", "Photo storage is unavailable right now. Please retry.");

const include = {
  photos: { where: { state: { not: "DELETE_PENDING" as const } }, orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
};
type Loaded = Prisma.FlatListingGetPayload<{ include: typeof include }>;

// Parent-first row lock: every listing mutation starts here, so writers serialize per listing.
async function lock(tx: Tx, id: string, ownerId: string, version?: number) {
  const [row] = await tx.$queryRaw<{ version: number; status: string }[]>`
    SELECT "version", "status" FROM "flat_listings" WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  if (!row) throw notFound();
  if (version !== undefined && row.version !== version) throw versionConflict();
  return row;
}
// Public-content change: bump version and take a Published listing offline until re-published.
const bump = (tx: Tx, id: string, status: string, data: Prisma.FlatListingUncheckedUpdateInput = {}) =>
  tx.flatListing.update({ where: { id }, data: { ...data, version: { increment: 1 }, ...(status === "PUBLISHED" && { status: "PAUSED" }) } });

// Explicit allowlist for anyone but the owner. Photo links are short-lived; a signing failure degrades to no URL.
export async function publishedFlat(
  l: Prisma.FlatListingGetPayload<{ include: typeof include }>, storage: Storage | null,
) {
  const ready = l.photos.filter((p) => p.state === "READY" && p.finalKey);
  return {
    id: l.id, title: l.title, description: l.description,
    city: { id: l.cityId, label: cityLabel(l.cityId) }, locality: { id: l.localityId, label: localityLabel(l.localityId) },
    bedrooms: l.bedrooms, availablePlaces: l.availablePlaces, roomType: l.roomType, furnishing: l.furnishing,
    monthlyRentPaise: l.monthlyRentPaise, depositPaise: l.depositPaise, chargesNote: l.chargesNote,
    availableFrom: l.availableFrom ? iso(l.availableFrom) : null, availableFlexible: l.availableFlexible,
    coverPhotoId: l.coverPhotoId, publishedAt: l.publishedAt,
    photos: await Promise.all(ready.map(async (p) => ({
      id: p.id, category: p.category, width: p.width, height: p.height,
      url: storage ? await storage.presignGet(p.finalKey!).catch(() => null) : null,
    }))),
  };
}

export function listingsRouter(getUserId: (req: Request) => string | null, storage: Storage | null) {
  const r = Router();
  r.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  r.use((req, _res, next) => {
    if (!getUserId(req)) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    next();
  });
  r.use(express.json({ limit: "16kb" }));

  const uid = (req: Request) => getUserId(req)!;
  const me = (req: Request) => db.user.findUnique({ where: { clerkUserId: uid(req) } });
  const completed = async (req: Request) => {
    const u = await me(req);
    if (!u?.onboardingCompletedAt) throw notEligible("Finish onboarding first.");
    return u;
  };
  const haveRoom = async (req: Request) => {
    const u = await completed(req);
    if (u.housingIntent !== "HAVE_ROOM") throw notEligible("Flat listings are for people who have a flat and need a flatmate.");
    return u;
  };
  const loadOwned = async (ownerId: string, id: string) => {
    const l = await db.flatListing.findFirst({ where: { id, ownerId }, include });
    if (!l) throw notFound();
    return l;
  };

  async function ownerView(l: Loaded) {
    const ready = l.photos.filter((p) => p.state === "READY");
    const missing = missingItems(l, ready, istToday());
    return {
      id: l.id, status: l.status, version: l.version, publishedAt: l.publishedAt, coverPhotoId: l.coverPhotoId,
      details: {
        title: l.title, description: l.description, cityId: l.cityId, localityId: l.localityId, bedrooms: l.bedrooms,
        availablePlaces: l.availablePlaces, roomType: l.roomType, furnishing: l.furnishing, monthlyRentPaise: l.monthlyRentPaise,
        depositPaise: l.depositPaise, chargesNote: l.chargesNote, availableFrom: l.availableFrom ? iso(l.availableFrom) : null,
        availableFlexible: l.availableFlexible, permissionConfirmed: !!l.permissionConfirmedAt,
      },
      photos: await Promise.all(l.photos.map(async (p) => ({
        id: p.id, state: p.state, category: p.category, sortOrder: p.sortOrder, width: p.width, height: p.height,
        originalName: p.originalName, isCover: p.id === l.coverPhotoId,
        url: p.state === "READY" && p.finalKey && storage ? await storage.presignGet(p.finalKey) : null,
      }))),
      checklist: { canPublish: missing.length === 0, missing },
    };
  }
  const respond = async (ownerId: string, id: string) => ownerView(await loadOwned(ownerId, id));

  r.get("/mine", async (req, res) => {
    const u = await me(req);
    const l = u && (await db.flatListing.findUnique({ where: { ownerId: u.id }, include }));
    res.json({ listing: l ? await ownerView(l) : null, canCreate: !!u?.onboardingCompletedAt && u.housingIntent === "HAVE_ROOM" });
  });

  // Explicit, idempotent create. Prefills only values that map unambiguously from the onboarding housing answer.
  r.post("/", async (req, res) => {
    const u = await haveRoom(req);
    const existing = await db.flatListing.findUnique({ where: { ownerId: u.id }, include });
    if (existing) return void res.json(await ownerView(existing));
    const h = await db.housingPreference.findUnique({ where: { userId: u.id } });
    const cityId = h?.city && CITY_IDS.includes(h.city) ? h.city : null;
    const loc = h?.preferredLocations.length === 1 ? h.preferredLocations[0]! : null;
    const prefill: Prisma.FlatListingUncheckedCreateInput = {
      ownerId: u.id,
      ...(cityId && { cityId }),
      ...(cityId && loc && LOCALITY_CITY.get(loc) === cityId && { localityId: loc }),
      ...(h?.monthlyRentMinPaise && h.monthlyRentMinPaise === h.monthlyRentMaxPaise && { monthlyRentPaise: h.monthlyRentMinPaise }),
      ...(h?.moveInFlexible === true && { availableFlexible: true }),
      ...(h?.moveInFlexible === false && h.moveInDate && iso(h.moveInDate) >= istToday() && { availableFlexible: false, availableFrom: h.moveInDate }),
    };
    try {
      await db.flatListing.create({ data: prefill });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // concurrent create: same row
    }
    res.json(await ownerView(await db.flatListing.findUniqueOrThrow({ where: { ownerId: u.id }, include })));
  });

  r.get("/:id", async (req, res) => {
    const id = req.params.id as string;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const u = await completed(req);
    const own = await db.flatListing.findFirst({ where: { id, ownerId: u.id }, include });
    if (own) return void res.json(await ownerView(own));
    // Other viewers: published only, owner still eligible, explicit allowlist.
    const l = await db.flatListing.findUnique({ where: { id }, include: { ...include, owner: { include: { profile: true } } } });
    if (!l || l.status !== "PUBLISHED" || !l.owner.onboardingCompletedAt || l.owner.housingIntent !== "HAVE_ROOM") throw notFound();
    if (await blockedBetween(db, u.id, l.ownerId, true)) throw notFound();
    res.json({
      ...(await publishedFlat(l, storage)),
      owner: { displayName: l.owner.profile?.displayName ?? null, avatarUrl: l.owner.profile?.avatarUrl ?? null },
    });
  });

  r.patch("/:id", async (req, res) => {
    const u = await completed(req);
    const { version, permissionConfirmed, ...d } = patchBody.parse(req.body);
    const today = istToday();
    if (d.availableFrom && d.availableFrom < today) throw new ApiError(422, "VALIDATION_ERROR", "Please check your answers.", { availableFrom: "Choose today or a later date" });
    await db.$transaction(async (tx) => {
      const { status } = await lock(tx, req.params.id as string, u.id, version);
      const cur = await tx.flatListing.findUniqueOrThrow({ where: { id: req.params.id as string } });
      const data = { ...d } as Prisma.FlatListingUncheckedUpdateInput;
      const city = d.cityId ?? cur.cityId;
      const locality = d.localityId ?? cur.localityId;
      if (d.localityId && city && LOCALITY_CITY.get(d.localityId) !== city) {
        throw new ApiError(422, "VALIDATION_ERROR", "Please check your answers.", { localityId: "Choose a locality in the selected city" });
      }
      if (d.cityId && !d.localityId && locality && LOCALITY_CITY.get(locality) !== d.cityId) data.localityId = null; // city changed: old locality no longer applies
      // Keep date/flexibility consistent when only one side is supplied.
      if (d.availableFlexible === true) data.availableFrom = null;
      if (d.availableFrom && d.availableFlexible === undefined) data.availableFlexible = false;
      if (permissionConfirmed !== undefined) data.permissionConfirmedAt = permissionConfirmed ? (cur.permissionConfirmedAt ?? new Date()) : null;
      if (d.availableFrom !== undefined && d.availableFrom !== null) data.availableFrom = new Date(`${d.availableFrom}T00:00:00Z`);
      await bump(tx, cur.id, status, data);
    });
    res.json(await respond(u.id, req.params.id as string));
  });

  // ---- photos ----
  const uploadLimiter = rateLimit({
    windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many upload requests. Slow down." } },
  });
  r.post("/:id/photos/uploads", uploadLimiter, async (req, res) => {
    const u = await haveRoom(req);
    const b = uploadBody.parse(req.body);
    if (!storage) throw noStorage();
    const id = req.params.id as string;
    const photo = await db.$transaction(async (tx) => {
      const { status } = await lock(tx, id, u.id, b.version);
      if (status === "CLOSED") throw new ApiError(409, "LISTING_CLOSED", "Reopen this listing to add photos.");
      // Pending uploads count toward the limit so parallel requests can't reserve unlimited objects.
      const used = await tx.flatPhoto.count({
        where: { listingId: id, OR: [{ state: { in: ["READY", "PROCESSING"] } }, { state: "PENDING", uploadExpiresAt: { gt: new Date() } }] },
      });
      if (used >= MAX_PHOTOS) throw new ApiError(429, "PHOTO_LIMIT", `A listing can have at most ${MAX_PHOTOS} photos.`);
      const photoId = randomUUID();
      return tx.flatPhoto.create({
        data: {
          id: photoId, listingId: id, category: b.category, originalName: b.filename ?? null,
          stagingKey: `staging/${id}/${photoId}/${randomUUID()}`, uploadExpiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
        },
      });
    });
    res.json({
      photoId: photo.id, uploadUrl: await storage.presignPut(photo.stagingKey, b.contentType),
      headers: { "Content-Type": b.contentType }, expiresInSeconds: UPLOAD_TTL_MS / 1000,
    });
  });

  r.post("/:id/photos/:photoId/complete", async (req, res) => {
    const u = await completed(req);
    if (!storage) throw noStorage();
    const id = req.params.id as string, photoId = req.params.photoId as string;
    const photo = await db.flatPhoto.findFirst({ where: { id: photoId, listingId: id, listing: { ownerId: u.id } }, include: { listing: true } });
    if (!photo) throw notFound();
    if (photo.state === "READY") return void res.json(await respond(u.id, id)); // idempotent retry
    if (photo.state === "FAILED") throw new ApiError(422, "PHOTO_REJECTED", "This upload was rejected. Remove it and upload again.");
    if (photo.state === "DELETE_PENDING") throw new ApiError(409, "PHOTO_REMOVED", "This photo was removed.");
    if (photo.listing.status === "CLOSED") throw new ApiError(409, "LISTING_CLOSED", "This listing is closed.");

    const now = new Date();
    const claim = await db.flatPhoto.updateMany({
      where: { id: photoId, OR: [{ state: "PENDING" }, { state: "PROCESSING", processingLeaseUntil: { lt: now } }] },
      data: { state: "PROCESSING", processingLeaseUntil: new Date(now.getTime() + PHOTO_LEASE_MS) },
    });
    if (claim.count === 0) throw new ApiError(409, "PHOTO_PROCESSING", "This photo is already being processed. Retry in a moment.");

    const finalKey = `flats/${id}/${photoId}/${randomUUID()}`;
    const release = () => db.flatPhoto.updateMany({ where: { id: photoId, state: "PROCESSING" }, data: { state: "PENDING", processingLeaseUntil: null } });
    const reject = async (message: string) => {
      await db.flatPhoto.updateMany({ where: { id: photoId, state: "PROCESSING" }, data: { state: "FAILED", processingLeaseUntil: null } });
      await Promise.all([storage.remove(photo.stagingKey), storage.remove(finalKey)]).catch(() => {}); // cleanup job retries
      return new ApiError(422, "PHOTO_REJECTED", message);
    };
    try {
      // No network or image work inside a DB transaction.
      const raw = await storage.read(photo.stagingKey, MAX_BYTES + 1).catch((e) => {
        if (e instanceof Error && e.message === "TOO_LARGE") throw new ImageRejected("Image must be 5 MB or smaller.");
        throw e;
      });
      if (!raw) {
        await release();
        throw new ApiError(422, "UPLOAD_MISSING", "We didn't receive that file. Please upload it again.");
      }
      const img = await sanitizeImage(raw);
      const claimed = await db.flatPhoto.updateMany({ where: { id: photoId, state: "PROCESSING" }, data: { finalKey } }); // record intent before writing
      if (claimed.count === 0) throw new ApiError(409, "PHOTO_PROCESSING", "This photo is already being processed.");
      await storage.write(finalKey, img.data, img.mime);
      const committed = await db.$transaction(async (tx) => {
        const { status } = await lock(tx, id, u.id);
        if (status === "CLOSED") return false;
        const ok = await tx.flatPhoto.updateMany({
          where: { id: photoId, state: "PROCESSING", finalKey },
          data: { state: "READY", processingLeaseUntil: null, mimeType: img.mime, bytes: img.bytes, width: img.width, height: img.height, contentHash: img.hash },
        });
        if (ok.count === 0) return false;
        const max = await tx.flatPhoto.aggregate({ where: { listingId: id, state: "READY" }, _max: { sortOrder: true } });
        await tx.flatPhoto.update({ where: { id: photoId }, data: { sortOrder: (max._max.sortOrder ?? -1) + 1 } });
        await bump(tx, id, status);
        return true;
      });
      if (!committed) {
        // A concurrent Close/removal wins; discard this result and let cleanup remove the bytes.
        await db.flatPhoto.updateMany({ where: { id: photoId }, data: { state: "DELETE_PENDING", processingLeaseUntil: null } });
        throw new ApiError(409, "LISTING_CLOSED", "This listing changed while the photo was processing. The photo was discarded.");
      }
      await storage.remove(photo.stagingKey).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e instanceof ImageRejected) throw await reject(e.message);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw await reject("This photo is a duplicate of one you already uploaded.");
      await release().catch(() => {}); // outage: leave it retryable
      throw e;
    }
    res.json(await respond(u.id, id));
  });

  r.patch("/:id/photos", async (req, res) => {
    const u = await completed(req);
    const b = photosBody.parse(req.body);
    const id = req.params.id as string;
    await db.$transaction(async (tx) => {
      const { status } = await lock(tx, id, u.id, b.version);
      const ready = await tx.flatPhoto.findMany({ where: { listingId: id, state: "READY" } });
      const ids = b.photos.map((p) => p.id);
      if (new Set(ids).size !== ids.length || ids.length !== ready.length || !ready.every((p) => ids.includes(p.id))) {
        throw new ApiError(422, "VALIDATION_ERROR", "Please check your answers.", { photos: "List each of this listing's ready photos exactly once" });
      }
      if (b.coverPhotoId && !ids.includes(b.coverPhotoId)) throw new ApiError(422, "VALIDATION_ERROR", "Please check your answers.", { coverPhotoId: "Choose one of your ready photos" });
      for (const [i, p] of b.photos.entries()) await tx.flatPhoto.update({ where: { id: p.id }, data: { sortOrder: i, category: p.category } });
      await bump(tx, id, status, { coverPhotoId: b.coverPhotoId });
    });
    res.json(await respond(u.id, id));
  });

  r.delete("/:id/photos/:photoId", async (req, res) => {
    const u = await completed(req);
    const id = req.params.id as string;
    const v = req.query.version === undefined ? undefined : Number(req.query.version);
    const photo = await db.flatPhoto.findFirst({ where: { id: req.params.photoId as string, listingId: id, listing: { ownerId: u.id } } });
    if (!photo) throw notFound();
    if (photo.state !== "DELETE_PENDING") {
      await db.$transaction(async (tx) => {
        const l = await lock(tx, id, u.id, v);
        // Mark intent first (hash cleared so the same image can be re-uploaded), bytes are deleted after commit.
        await tx.flatPhoto.update({ where: { id: photo.id }, data: { state: "DELETE_PENDING", contentHash: null, processingLeaseUntil: null } });
        if (photo.state === "READY") await bump(tx, id, l.status);
      });
    }
    try {
      if (storage) {
        await storage.remove(photo.stagingKey);
        if (photo.finalKey) await storage.remove(photo.finalKey);
        await db.flatPhoto.deleteMany({ where: { id: photo.id } });
      }
    } catch { /* stays DELETE_PENDING; cleanup job retries */ }
    res.json(await respond(u.id, id));
  });

  // ---- lifecycle: explicit transitions only ----
  const transition = (handler: (tx: Tx, l: { id: string; status: string }, ownerId: string) => Promise<void>, pre?: (req: Request) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      const u = await completed(req);
      const { version } = versionBody.parse(req.body);
      const id = req.params.id as string;
      await pre?.(req);
      await db.$transaction(async (tx) => {
        const row = await lock(tx, id, u.id, version);
        await handler(tx, { id, status: row.status }, u.id);
      });
      res.json(await respond(u.id, id));
    };
  const invalid = (msg: string) => new ApiError(409, "INVALID_STATE", msg);

  r.post("/:id/pause", transition(async (tx, l) => {
    if (l.status === "PAUSED") return;
    if (l.status !== "PUBLISHED") throw invalid("Only a published listing can be paused.");
    await tx.flatListing.update({ where: { id: l.id }, data: { status: "PAUSED", version: { increment: 1 } } }); // DB only: works during an R2 outage
  }));

  r.post("/:id/close", transition(async (tx, l) => {
    if (l.status === "CLOSED") return;
    await tx.flatListing.update({ where: { id: l.id }, data: { status: "CLOSED", version: { increment: 1 } } });
    // Cancel outstanding upload finalization; cleanup removes the bytes.
    await tx.flatPhoto.updateMany({ where: { listingId: l.id, state: { in: ["PENDING", "PROCESSING"] } }, data: { state: "DELETE_PENDING", processingLeaseUntil: null } });
  }));

  r.post("/:id/reopen", transition(async (tx, l) => {
    if (l.status === "DRAFT") return;
    if (l.status !== "CLOSED") throw invalid("Only a closed listing can be reopened.");
    await tx.flatListing.update({ where: { id: l.id }, data: { status: "DRAFT", version: { increment: 1 } } });
  }));

  r.post("/:id/publish", async (req, res) => {
    const u = await haveRoom(req);
    const { version } = versionBody.parse(req.body);
    const id = req.params.id as string;
    const l0 = await loadOwned(u.id, id);
    if (l0.version !== version) throw versionConflict();
    if (l0.status === "PUBLISHED") return void res.json(await ownerView(l0));
    if (l0.status === "CLOSED") throw invalid("Reopen this listing before publishing.");
    // Object readiness is checked outside the DB transaction; an unreachable R2 never yields Published.
    if (!storage) throw noStorage();
    const ready0 = l0.photos.filter((p) => p.state === "READY");
    const gone = new Set<string>();
    try {
      for (const p of ready0) if (!(await storage.exists(p.finalKey!))) gone.add(p.id);
    } catch {
      throw noStorage();
    }
    await db.$transaction(async (tx) => {
      await lock(tx, id, u.id, version);
      const l = await tx.flatListing.findUniqueOrThrow({ where: { id }, include });
      const ready = l.photos.filter((p) => p.state === "READY" && !gone.has(p.id));
      const missing = missingItems(l, ready, istToday());
      if (missing.length) {
        throw new ApiError(422, "VALIDATION_ERROR", "This listing isn't ready to publish yet.", Object.fromEntries(missing.map((m) => [m.field, m.message])));
      }
      // Publishing consents to the listing + minimal owner name/avatar only; personal discovery is unchanged.
      await tx.flatListing.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } } });
    });
    res.json(await respond(u.id, id));
  });

  r.use(apiErrorHandler);
  return r;
}
