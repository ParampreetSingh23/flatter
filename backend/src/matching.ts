import { type Request, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { ApiError, apiErrorHandler } from "./http.js";
import { cityLabel, iso, localityLabel } from "./listing-rules.js";
import { publishedFlat } from "./listings.js";
import {
  accountOk, blockedBetween, canonical, fullInclude, type Full, pair, pairLock, rotate, toFlat, toPerson,
} from "./matching-data.js";
import { reportEvidence } from "./chat-data.js";
import { chatHub } from "./chat-hub.js";
import { actionBody, blockBody, filtersQuery, idParam, LOCALITY_CITY, PAGE_SIZE, POOL_SIZE, reportBody } from "./matching-rules.js";
import { missingFields, POLICY, type Result } from "./matching-score.js";
import { ageOn, istToday } from "./onboarding-rules.js";
import { base } from "./profiles.js";
import type { Storage } from "./storage.js";

const unavailable = () => new ApiError(404, "UNAVAILABLE", "This person is no longer available.");
const NOT_ENROLLED = () => new ApiError(403, "NOT_ENROLLED", "Turn on matching in your matching preferences first.");
type Ok = Extract<Result, { status: "ok" }>;
const photoInclude = { photos: { where: { state: "READY" as const }, orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] } };

export function matchingRouters(getUserId: (req: Request) => string | null, storage: Storage | null) {
  const uid = (req: Request) => getUserId(req)!;
  // Per verified account (not IP): decisions, reports and blocks cannot be used to sweep the user base.
  const perUser = (limit: number) => rateLimit({
    windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (req) => `u:${getUserId(req) ?? "anon"}`,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests. Slow down." } },
  });

  const me = async (req: Request): Promise<Full> => {
    const u = await db.user.findUnique({ where: { clerkUserId: uid(req) }, include: fullInclude });
    if (!u?.onboardingCompletedAt || !u.profile || !u.housingIntent) throw new ApiError(403, "NOT_ELIGIBLE", "Finish onboarding first.");
    if (u.suspendedAt) throw new ApiError(403, "NOT_ELIGIBLE", "This account can't use matching.");
    return u;
  };
  // Viewer must be enrolled and complete; otherwise the UI sends them to the matching-preferences screen.
  const ready = async (req: Request, today: string) => {
    const u = await me(req);
    if (!u.matchingEnabledAt || !u.discoveryEnabled) throw NOT_ENROLLED();
    const missing = missingFields(toPerson(u), today);
    if (missing.length) throw new ApiError(403, "MATCHING_NOT_READY", "Complete your matching preferences first.", Object.fromEntries(missing.map((m) => [m, "Required"])));
    if (u.housingIntent === "HAVE_ROOM" && !toFlat(u)) throw new ApiError(403, "NO_ELIGIBLE_FLAT", "Publish your flat with at least one available place to meet people.");
    return u;
  };
  const byPublicId = async (publicId: string, include: Prisma.UserInclude = fullInclude) =>
    db.user.findFirst({ where: { profile: { is: { publicId } } }, include: include as typeof fullInclude });

  const byPublicIdOf = async (id: string) => db.user.findUnique({ where: { id }, include: fullInclude });

  const age = (u: Full) => (u.profile?.birthDate ? ageOn(iso(u.profile.birthDate), istToday()) : null);

  // Safe card/detail allowlist. No DOB, IDs, accepted filters, contact data.
  async function card(c: Full, r: Ok) {
    const p = c.profile!, f = toFlat(c), h = c.housingPreference;
    const cover = f && c.flatListing?.coverPhotoId
      ? await db.flatPhoto.findFirst({ where: { id: c.flatListing.coverPhotoId, state: "READY" }, select: { finalKey: true } }) : null;
    return {
      publicId: p.publicId, displayName: p.displayName, avatarUrl: p.avatarUrl, age: age(c), occupation: p.occupation, bio: p.bio, intent: c.housingIntent,
      city: f ? { id: f.cityId, label: cityLabel(f.cityId) } : h?.city ? { id: h.city, label: cityLabel(h.city) } : null,
      ...(f
        ? { flat: { locality: localityLabel(f.localityId), rentPaise: f.rentPaise, availableFrom: f.availableFlexible ? null : f.availableFrom, availableFlexible: f.availableFlexible,
            coverUrl: cover?.finalKey && storage ? await storage.presignGet(cover.finalKey).catch(() => null) : null } }
        : { seeking: {
            localities: h?.locationsFlexible ? [] : (h?.preferredLocations ?? []).map(localityLabel), localitiesFlexible: !!h?.locationsFlexible,
            rentMinPaise: h?.monthlyRentMinPaise, rentMaxPaise: h?.monthlyRentMaxPaise,
            moveInFlexible: !!h?.moveInFlexible, moveInEarliest: h?.moveInDate ? iso(h.moveInDate) : null, moveInLatest: h?.moveInLatestDate ? iso(h.moveInLatestDate) : null } }),
      compatibility: { score: r.display, policy: r.policy },
      // Staleness tokens: the action endpoint refuses to act on changed data.
      versions: { profile: p.version, listing: f ? c.flatListing!.version : null },
    };
  }

  // ---- /api/discovery ----
  const discovery = base(getUserId);
  discovery.get("/", async (req, res) => {
    const today = istToday();
    const v = await ready(req, today);
    const q = filtersQuery.parse(req.query);
    const vf = toFlat(v), vp = toPerson(v);
    const cityId = vf ? vf.cityId : vp.cityId!;
    if (q.localities?.some((l) => LOCALITY_CITY.get(l) !== cityId)) throw new ApiError(422, "VALIDATION_ERROR", "Please check your filters.", { localities: `Choose localities in ${cityLabel(cityId)}` });
    if (q.rentMinPaise && q.rentMaxPaise && q.rentMinPaise > q.rentMaxPaise) throw new ApiError(422, "VALIDATION_ERROR", "Please check your filters.", { rentMaxPaise: "Maximum must be at least the minimum" });
    if (!vf && (q.rentMinPaise ?? vp.rentMinPaise!) < vp.rentMinPaise! || !vf && (q.rentMaxPaise ?? vp.rentMaxPaise!) > vp.rentMaxPaise!) throw new ApiError(422, "VALIDATION_ERROR", "Please check your filters.", { rentMinPaise: "Stay within your saved budget" });
    if (q.moveInFrom && q.moveInTo && q.moveInFrom > q.moveInTo) throw new ApiError(422, "VALIDATION_ERROR", "Please check your filters.", { moveInTo: "End date must be on or after the start" });
    if (!vf && !vp.moveInFlexible && ((q.moveInFrom && q.moveInFrom > vp.moveInLatest!) || (q.moveInTo && q.moveInTo < vp.moveInEarliest!))) {
      throw new ApiError(422, "VALIDATION_ERROR", "Please check your filters.", { moveInFrom: "Stay within your saved move-in window" });
    }

    // 1. SQL prefilter: intent, city, enrollment, exclusions (decided, blocked either way incl. history, ever matched).
    const [acts, blocks, matches] = await Promise.all([
      db.discoveryAction.findMany({ where: { actorId: v.id }, select: { targetId: true } }),
      db.userBlock.findMany({ where: { OR: [{ blockerId: v.id }, { blockedId: v.id }] }, select: { blockerId: true, blockedId: true } }),
      db.match.findMany({ where: { OR: [{ userLowId: v.id }, { userHighId: v.id }] }, select: { userLowId: true, userHighId: true } }),
    ]);
    const out = new Set([v.id, ...acts.map((a) => a.targetId), ...blocks.flatMap((b) => [b.blockerId, b.blockedId]), ...matches.flatMap((m) => [m.userLowId, m.userHighId])]);
    const want = v.housingIntent === "HAVE_ROOM" ? "NEED_ROOM" : v.housingIntent === "NEED_ROOM" ? "HAVE_ROOM" : "TEAM_UP";
    const ids = await db.user.findMany({
      where: {
        id: { notIn: [...out] }, housingIntent: want, onboardingCompletedAt: { not: null }, discoveryEnabled: true, matchingEnabledAt: { not: null }, suspendedAt: null, profile: { isNot: null },
        ...(want === "HAVE_ROOM"
          ? { flatListing: { is: { status: "PUBLISHED", cityId, availablePlaces: { gte: 1 }, monthlyRentPaise: { gte: vp.rentMinPaise!, lte: vp.rentMaxPaise! } } } }
          : { housingPreference: { is: { city: cityId } } }),
      },
      select: { id: true },
    });
    // 2. Bounded, deterministic working pool; ranking is best within it. ponytail: loads ids only; move to SQL ordering if cities grow past ~50k users.
    const pool = rotate(ids.map((i) => i.id), v.id, today).slice(0, POOL_SIZE);
    const cands = await db.user.findMany({ where: { id: { in: pool } }, include: fullInclude });

    const scored: { c: Full; r: Ok }[] = [];
    for (const c of cands) {
      const r = pair(v, c, today);
      if (r?.status !== "ok") continue; // hard failure or incomplete: no candidate, no reason
      const cp = toPerson(c), cf = toFlat(c);
      if (q.localities && !(cf ? q.localities.includes(cf.localityId) : cp.localitiesFlexible || cp.localityIds.some((l) => q.localities!.includes(l)))) continue;
      if (q.rentMinPaise != null || q.rentMaxPaise != null) {
        const lo = q.rentMinPaise ?? 0, hi = q.rentMaxPaise ?? Number.MAX_SAFE_INTEGER;
        if (cf ? cf.rentPaise < lo || cf.rentPaise > hi : cp.rentMaxPaise! < lo || cp.rentMinPaise! > hi) continue;
      }
      if (q.moveInFrom || q.moveInTo) {
        const from = q.moveInFrom ?? "0000-01-01", to = q.moveInTo ?? "9999-12-31";
        if (cf ? !cf.availableFlexible && cf.availableFrom > to : !cp.moveInFlexible && (cp.moveInEarliest! > to || cp.moveInLatest! < from)) continue;
      }
      scored.push({ c, r });
    }
    scored.sort((x, y) => y.r.score - x.r.score || (x.c.profile!.publicId < y.c.profile!.publicId ? -1 : 1));
    const page = scored.slice(0, PAGE_SIZE);
    res.json({
      policy: POLICY, poolSize: pool.length, cards: await Promise.all(page.map((s) => card(s.c, s.r))),
      // Honest empty state: "nobody in the pool" vs "your filters removed everyone".
      empty: page.length === 0 ? (cands.length > 0 && Object.keys(q).length ? "FILTERS" : "EXHAUSTED") : null,
    });
  });

  discovery.get("/:publicId", async (req, res) => {
    const today = istToday();
    const v = await ready(req, today);
    const id = idParam.safeParse(req.params.publicId);
    const c = id.success ? await byPublicId(id.data, { ...fullInclude, flatListing: { include: photoInclude } } as Prisma.UserInclude) : null;
    if (!c || c.id === v.id || (await blockedBetween(db, v.id, c.id, true))) throw unavailable();
    const r = pair(v, c, today);
    if (r?.status !== "ok") throw unavailable();
    const l = c.lifestylePreference!;
    const withPhotos = c as Full & { flatListing: NonNullable<Full["flatListing"]> & { photos: Parameters<typeof publishedFlat>[0]["photos"] } };
    res.json({
      ...(await card(c, r)),
      lifestyle: { sleepSchedule: l.sleepSchedule, cleanliness: l.cleanliness, foodHabit: l.foodHabit, smokingHabit: l.smokingHabit, guestFrequency: l.guestFrequency, bringingPet: l.bringingPet, workStudySchedule: l.workStudySchedule },
      flat: toFlat(c) ? await publishedFlat(withPhotos.flatListing, storage) : null,
    });
  });

  // One directed decision. Pair lock -> terminal-history check -> idempotency -> revalidate -> write -> reciprocal check.
  discovery.post("/actions", perUser(60), async (req, res) => {
    const today = istToday();
    const b = actionBody.parse(req.body);
    const v = await ready(req, today);
    const target = await byPublicId(b.publicId);
    if (!target || target.id === v.id) throw unavailable();
    const result = await db.$transaction(async (tx) => {
      await pairLock(tx, v.id, target.id);
      const { low, high } = canonical(v.id, target.id);
      const [terminal, mine, theirs, match] = await Promise.all([
        blockedBetween(tx, v.id, target.id, false),
        tx.discoveryAction.findUnique({ where: { actorId_targetId: { actorId: v.id, targetId: target.id } } }),
        tx.discoveryAction.findUnique({ where: { actorId_targetId: { actorId: target.id, targetId: v.id } } }),
        tx.match.findUnique({ where: { userLowId_userHighId: { userLowId: low, userHighId: high } } }),
      ]);
      // Dismissing an unavailable card is harmless; interest is never created or revived for a closed pair.
      if (terminal || match?.endedAt) { if (b.kind === "PASS") return { kind: b.kind, matched: false }; throw unavailable(); }
      if (mine) {
        if (mine.kind !== b.kind) throw new ApiError(409, "DECISION_CONFLICT", "You already made a different choice for this person.");
        return { kind: b.kind, matched: !!match && !match.endedAt, ...(match && !match.endedAt && { matchId: match.id }) };
      }
      if (b.kind === "PASS") {
        await tx.discoveryAction.create({ data: { actorId: v.id, targetId: target.id, kind: "PASS" } });
        return { kind: b.kind, matched: false };
      }
      // LIKE: current data for both sides, inside the lock.
      const [vNow, tNow] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: v.id }, include: fullInclude }), tx.user.findUniqueOrThrow({ where: { id: target.id }, include: fullInclude }),
      ]);
      const r = pair(vNow, tNow, today);
      if (r?.status !== "ok") throw unavailable();
      const tf = toFlat(tNow);
      if ((b.profileVersion !== undefined && b.profileVersion !== tNow.profile!.version) || (b.listingVersion !== undefined && b.listingVersion !== (tf ? tNow.flatListing!.version : null))) {
        throw new ApiError(409, "STALE_CANDIDATE", "This profile changed. Refresh to see the latest details.");
      }
      await tx.discoveryAction.create({ data: { actorId: v.id, targetId: target.id, kind: "LIKE" } });
      if (theirs?.kind === "LIKE" && !theirs.invalidatedAt) {
        const m = await tx.match.create({ data: { userLowId: low, userHighId: high, scoreAtMatch: r.display, scorePolicy: r.policy } });
        return { kind: b.kind, matched: true, matchId: m.id };
      }
      return { kind: b.kind, matched: false };
    }, { timeout: 10_000 });
    if (result.matched) chatHub.inbox([v.id, target.id]); // new or existing match: both inboxes reconcile (idempotent)
    res.json(result);
  });
  discovery.use(apiErrorHandler);

  // ---- /api/matches ----
  const matches = base(getUserId);
  matches.get("/", async (req, res) => {
    const u = await me(req);
    const rows = await db.match.findMany({
      where: { endedAt: null, OR: [{ userLowId: u.id }, { userHighId: u.id }] },
      include: { userLow: { include: { profile: true } }, userHigh: { include: { profile: true } } }, orderBy: { createdAt: "desc" },
    });
    const out = [];
    for (const m of rows) {
      const o = m.userLowId === u.id ? m.userHigh : m.userLow;
      if (o.suspendedAt || !o.onboardingCompletedAt || !o.profile || (await blockedBetween(db, u.id, o.id, true))) continue;
      out.push({
        id: m.id, matchedAt: m.createdAt,
        person: { publicId: o.profile.publicId, displayName: o.profile.displayName, avatarUrl: o.profile.avatarUrl, intent: o.housingIntent, age: o.profile.birthDate ? ageOn(iso(o.profile.birthDate), istToday()) : null },
        chat: { available: true }, // real gated routes exist: /api/messages and the Socket.IO events
      });
    }
    res.json({ matches: out });
  });
  matches.post("/:id/unmatch", perUser(30), async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) throw new ApiError(404, "NOT_FOUND", "Match not found.");
    const u = await me(req);
    const m = await db.match.findFirst({ where: { id: id.data, OR: [{ userLowId: u.id }, { userHighId: u.id }] } });
    if (!m) throw new ApiError(404, "NOT_FOUND", "Match not found.");
    const ended = await db.$transaction(async (tx) => {
      await pairLock(tx, m.userLowId, m.userHighId);
      const r = await tx.match.updateMany({ where: { id: m.id, endedAt: null }, data: { endedAt: new Date(), endedById: u.id, endReason: "UNMATCH" } });
      await tx.discoveryAction.updateMany({ where: { OR: [{ actorId: m.userLowId, targetId: m.userHighId }, { actorId: m.userHighId, targetId: m.userLowId }], invalidatedAt: null }, data: { invalidatedAt: new Date() } });
      return r.count > 0;
    });
    if (ended) chatHub.closed(m.id, [m.userLowId, m.userHighId]); // after commit; chat becomes read-only for both
    res.json({ ok: true });
  });
  matches.use(apiErrorHandler);

  // ---- /api/blocks ----
  const blocks = base(getUserId);
  async function block(blockerId: string, targetId: string) {
    const endedMatchId = await db.$transaction(async (tx) => {
      await pairLock(tx, blockerId, targetId);
      await tx.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId: targetId } },
        create: { blockerId, blockedId: targetId }, update: { revokedAt: null },
      });
      const { low, high } = canonical(blockerId, targetId);
      const now = new Date();
      const active = await tx.match.findFirst({ where: { userLowId: low, userHighId: high, endedAt: null }, select: { id: true } });
      await tx.match.updateMany({ where: { userLowId: low, userHighId: high, endedAt: null }, data: { endedAt: now, endedById: blockerId, endReason: "BLOCK" } });
      await tx.discoveryAction.updateMany({ where: { OR: [{ actorId: blockerId, targetId }, { actorId: targetId, targetId: blockerId }], invalidatedAt: null }, data: { invalidatedAt: now } });
      return active?.id ?? null;
    });
    if (endedMatchId) chatHub.closed(endedMatchId, [blockerId, targetId]);
  }
  blocks.get("/", async (req, res) => {
    const u = await me(req);
    const rows = await db.userBlock.findMany({ where: { blockerId: u.id, revokedAt: null }, include: { blocked: { include: { profile: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ blocks: rows.filter((b) => b.blocked.profile).map((b) => ({ publicId: b.blocked.profile!.publicId, displayName: b.blocked.profile!.displayName, avatarUrl: b.blocked.profile!.avatarUrl })) });
  });
  blocks.post("/", perUser(30), async (req, res) => {
    const { publicId } = blockBody.parse(req.body);
    const u = await me(req);
    const t = await byPublicId(publicId);
    if (!t || t.id === u.id) throw unavailable();
    await block(u.id, t.id);
    res.json({ ok: true });
  });
  blocks.delete("/:publicId", perUser(30), async (req, res) => {
    const u = await me(req);
    const id = idParam.safeParse(req.params.publicId);
    const t = id.success ? await byPublicId(id.data) : null;
    if (t) {
      await db.$transaction(async (tx) => {
        await pairLock(tx, u.id, t.id);
        // Revocation only: old Likes, ended matches and chat access are never restored.
        await tx.userBlock.updateMany({ where: { blockerId: u.id, blockedId: t.id, revokedAt: null }, data: { revokedAt: new Date() } });
      });
    }
    res.json({ ok: true }); // idempotent and non-revealing
  });
  blocks.use(apiErrorHandler);

  // ---- /api/reports : intake only; an operator reviews (docs/report-review.md) ----
  const reports = base(getUserId);
  reports.post("/", perUser(10), async (req, res) => {
    const b = reportBody.parse(req.body);
    const u = await me(req);
    let t = b.publicId ? await byPublicId(b.publicId) : null;
    if (!b.publicId && b.matchId) {
      // Reporting from a conversation: the other member is the target, only if the reporter is a member.
      const mm = await db.match.findFirst({ where: { id: b.matchId, OR: [{ userLowId: u.id }, { userHighId: u.id }] } });
      t = mm ? await byPublicIdOf(mm.userLowId === u.id ? mm.userHighId : mm.userLowId) : null;
    }
    // Same acknowledgement whether or not the target exists: no enumeration, no private target state.
    if (t && t.id !== u.id) {
      const { low, high } = canonical(u.id, t.id);
      if (b.matchId && !(await db.match.findFirst({ where: { id: b.matchId, userLowId: low, userHighId: high }, select: { id: true } }))) throw new ApiError(422, "VALIDATION_ERROR", "Please check your report.", { matchId: "Not a match you share" });
      if (b.listingId && t.flatListing?.id !== b.listingId) throw new ApiError(422, "VALIDATION_ERROR", "Please check your report.", { listingId: "Not this person's listing" });
      let messages: Awaited<ReturnType<typeof reportEvidence>> = null;
      if (b.messageIds?.length) {
        if (!b.matchId) throw new ApiError(422, "VALIDATION_ERROR", "Please check your report.", { messageIds: "Choose the conversation first" });
        messages = await reportEvidence(b.matchId, u.id, b.messageIds);
        if (!messages) throw new ApiError(422, "VALIDATION_ERROR", "Please check your report.", { messageIds: "Choose messages from this conversation" });
      }
      await db.userReport.create({
        data: {
          reporterId: u.id, targetId: t.id, reason: b.reason, details: b.details || null, matchId: b.matchId ?? null, listingId: b.listingId ?? null,
          // Bounded public-content snapshot only: no DOB, contact data or photo URLs.
          snapshot: { displayName: t.profile?.displayName ?? null, bio: t.profile?.bio ?? null, listingTitle: b.listingId ? (t.flatListing?.title ?? null) : null, ...(messages && { messages }) },
        },
      });
      if (b.alsoBlock) await block(u.id, t.id);
    }
    res.json({ ok: true });
  });
  reports.use(apiErrorHandler);

  return { discovery, matches, blocks, reports };
}
