import { clerkClient } from "@clerk/express";
import express, { type Request, Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { ApiError, apiErrorHandler } from "./http.js";
import { cityLabel, iso, localityLabel, missingItems } from "./listing-rules.js";
import { publishedFlat } from "./listings.js";
import { unreadTotal } from "./chat-data.js";
import { blockedBetween, toPerson } from "./matching-data.js";
import { matchingPatch } from "./matching-rules.js";
import { missingFields } from "./matching-score.js";
import { ageOn, checkHousing, flatmateShape, housingShape, istToday, lifestyleShape, profileShape } from "./onboarding-rules.js";
import type { Storage } from "./storage.js";

// Typed availability, shared by the dashboard response and rendering. Unbuilt features are "unavailable", never zero.
export const FEATURES = {
  matches: "available", messages: "available", groups: "unavailable", discovery: "available", roomSearch: "unavailable",
  listingEditor: "available",
} as const;

const notFound = () => new ApiError(404, "NOT_FOUND", "Profile not found.");
const conflict = () => new ApiError(409, "VERSION_CONFLICT", "Your profile changed elsewhere. Reload the saved profile to continue.");
const corrupt = () => new ApiError(500, "PROFILE_INCOMPLETE", "Your saved profile data is incomplete. Please contact support; nothing was changed.");

const flatInclude = { photos: { where: { state: "READY" as const }, orderBy: [{ sortOrder: "asc" as const }] } };

export function base(getUserId: (req: Request) => string | null) {
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
  return r;
}

export function profileRouters(getUserId: (req: Request) => string | null, storage: Storage | null) {
  const uid = (req: Request) => getUserId(req)!;
  // Identity comes only from the verified session. Incomplete onboarding is 403 (the UI resumes onboarding).
  const completedUser = async (req: Request) => {
    const u = await db.user.findUnique({
      where: { clerkUserId: uid(req) },
      include: { profile: true, housingPreference: true, lifestylePreference: true },
    });
    if (!u?.onboardingCompletedAt) throw new ApiError(403, "NOT_ELIGIBLE", "Finish onboarding first.");
    return u;
  };
  type U = Awaited<ReturnType<typeof completedUser>>;
  const need = (u: U) => {
    if (!u.housingIntent || !u.profile) throw corrupt(); // never guess an intent or a missing profile
    return { intent: u.housingIntent, profile: u.profile };
  };

  const housingSummary = (h: U["housingPreference"]) => h && {
    city: h.city ? { id: h.city, label: cityLabel(h.city) } : null,
    localities: h.preferredLocations.map((id) => ({ id, label: localityLabel(id) })),
    locationsFlexible: h.locationsFlexible,
    rentMinPaise: h.monthlyRentMinPaise, rentMaxPaise: h.monthlyRentMaxPaise,
    moveInDate: h.moveInDate ? iso(h.moveInDate) : null, moveInLatestDate: h.moveInLatestDate ? iso(h.moveInLatestDate) : null, moveInFlexible: h.moveInFlexible,
  };

  // Metadata only; at most one cover link is signed, and a signing problem never fails the summary.
  async function listingSummary(ownerId: string, withDetails: boolean) {
    const l = await db.flatListing.findUnique({ where: { ownerId }, include: flatInclude });
    if (!l) return null;
    const missing = missingItems(l, l.photos, istToday());
    const cover = l.status === "PUBLISHED" ? l.photos.find((p) => p.id === l.coverPhotoId) : undefined;
    return {
      id: l.id, status: l.status, title: l.title, monthlyRentPaise: l.monthlyRentPaise,
      locality: localityLabel(l.localityId), city: cityLabel(l.cityId), photoCount: l.photos.length,
      missing, coverUrl: cover?.finalKey && storage ? await storage.presignGet(cover.finalKey).catch(() => null) : null,
      ...(withDetails && l.status === "PUBLISHED" && {
        details: {
          description: l.description, bedrooms: l.bedrooms, availablePlaces: l.availablePlaces, roomType: l.roomType, furnishing: l.furnishing,
          depositPaise: l.depositPaise, chargesNote: l.chargesNote, availableFrom: l.availableFrom ? iso(l.availableFrom) : null, availableFlexible: l.availableFlexible,
        },
      }),
    };
  }

  // ---- GET /api/dashboard ----
  const dashboard = base(getUserId);
  dashboard.get("/", async (req, res) => {
    const u = await completedUser(req);
    const { intent, profile } = need(u);
    let listing = null, listingError = false;
    if (intent === "HAVE_ROOM") {
      try { listing = await listingSummary(u.id, false); } catch { listingError = true; } // isolated: the rest still renders
    }
    res.json({
      intent, features: FEATURES, discoveryEnabled: u.discoveryEnabled,
      matching: { enrolled: !!u.matchingEnabledAt, ready: missingFields(toPerson({ ...u, flatListing: null }), istToday()).length === 0 },
      unreadMessages: await unreadTotal(u.id),
      profile: { displayName: profile.displayName, avatarUrl: profile.avatarUrl, publicId: profile.publicId },
      housing: housingSummary(u.housingPreference), listing, listingError,
    });
  });
  dashboard.use(apiErrorHandler);

  // ---- /api/profile/me ----
  const meDto = async (u: U) => {
    const { intent, profile } = need(u);
    const l = u.lifestylePreference;
    const missing = missingFields(toPerson({ ...u, flatListing: null }), istToday());
    return {
      matching: {
        enrolled: !!u.matchingEnabledAt, ready: missing.length === 0, missing,
        workStudySchedule: l?.workStudySchedule ?? null, acceptedWorkStudySchedules: l?.acceptedWorkStudySchedules ?? [],
      },
      version: profile.version, publicId: profile.publicId, intent, discoveryEnabled: u.discoveryEnabled,
      profile: {
        displayName: profile.displayName, occupation: profile.occupation, gender: profile.gender, bio: profile.bio, avatarUrl: profile.avatarUrl,
        age: profile.birthDate ? ageOn(iso(profile.birthDate), istToday()) : null,
      },
      housing: housingSummary(u.housingPreference),
      lifestyle: l && { sleepSchedule: l.sleepSchedule, cleanliness: l.cleanliness, foodHabit: l.foodHabit, smokingHabit: l.smokingHabit, bringingPet: l.bringingPet, guestFrequency: l.guestFrequency },
      flatmate: l && {
        acceptedSleepSchedules: l.acceptedSleepSchedules, acceptedCleanlinessLevels: l.acceptedCleanlinessLevels, acceptedFoodHabits: l.acceptedFoodHabits,
        acceptedSmokingHabits: l.acceptedSmokingHabits, flatmatePetPreference: l.flatmatePetPreference, acceptedGuestFrequencies: l.acceptedGuestFrequencies, acceptedGenders: l.acceptedGenders,
      },
      ...(intent === "HAVE_ROOM" && await listingSummary(u.id, true).then((listing) => ({ listing, listingError: false }), () => ({ listing: null, listingError: true }))),
    };
  };
  const fresh = (req: Request) => completedUser(req);

  const me = base(getUserId);
  me.get("/me", async (req, res) => void res.json(await meDto(await fresh(req))));

  // Small dedicated PATCH: only these fields; never intent, DOB, completion, preferences or listing data.
  const patchBody = z.strictObject({
    version: z.int().min(0),
    displayName: profileShape.displayName, occupation: profileShape.occupation, gender: profileShape.gender, bio: profileShape.bio,
    photoAction: z.enum(["keep", "use_clerk", "clear"]), discoveryEnabled: z.boolean(),
  }).partial().required({ version: true });
  me.patch("/me", async (req, res) => {
    const u = await completedUser(req);
    need(u);
    const { version, photoAction, discoveryEnabled, ...fields } = patchBody.parse(req.body);
    // Network call outside the DB transaction; the URL always comes from the verified Clerk account.
    let avatar: { avatarUrl: string | null } | Record<string, never> = {};
    if (photoAction === "clear") avatar = { avatarUrl: null };
    if (photoAction === "use_clerk") {
      const cu = await clerkClient.users.getUser(uid(req));
      avatar = { avatarUrl: cu.hasImage ? cu.imageUrl : null };
    }
    await db.$transaction(async (tx) => {
      const lock = await tx.profile.updateMany({ where: { userId: u.id, version }, data: { version: { increment: 1 } } });
      if (lock.count === 0) throw conflict();
      const data = { ...fields, ...avatar } as Prisma.ProfileUncheckedUpdateInput;
      if (Object.keys(data).length) await tx.profile.update({ where: { userId: u.id }, data });
      if (discoveryEnabled !== undefined) await tx.user.update({ where: { id: u.id }, data: { discoveryEnabled } });
    });
    res.json(await meDto(await fresh(req)));
  });
  // Post-onboarding edits of housing / lifestyle / accepted preferences. Same validators as onboarding; the
  // profile version is the optimistic lock. Completion, intent, DOB and the listing are never touched.
  const edit = async (
    req: Request, schemaFor: (u: U) => z.ZodType<{ version: number } & Record<string, unknown>>,
    write: (tx: Prisma.TransactionClient, userId: string, d: Record<string, unknown>) => Promise<unknown>,
  ) => {
    const u = await completedUser(req);
    need(u);
    const { version, ...d } = schemaFor(u).parse(req.body);
    await db.$transaction(async (tx) => {
      const lock = await tx.profile.updateMany({ where: { userId: u.id, version }, data: { version: { increment: 1 } } });
      if (lock.count === 0) throw conflict();
      await write(tx, u.id, d);
    });
    return meDto(await completedUser(req));
  };
  const withVersion = <S extends z.core.$ZodShape>(shape: S) => z.strictObject({ version: z.int().min(0), ...shape });

  me.patch("/me/housing", async (req, res) => {
    res.json(await edit(req, (u) => withVersion(housingShape).superRefine((v, c) => checkHousing(v, u.housingIntent, c, istToday())) as never,
      (tx, userId, d) => {
        // Changing the earliest date invalidates the confirmed window: the person re-confirms it in matching preferences.
        const data = { ...d, moveInDate: d.moveInDate ? new Date(`${d.moveInDate}T00:00:00Z`) : null, moveInLatestDate: null } as Prisma.HousingPreferenceUncheckedUpdateInput;
        return tx.housingPreference.upsert({ where: { userId }, create: { ...data, userId } as Prisma.HousingPreferenceUncheckedCreateInput, update: data });
      }));
  });
  for (const [path, shape] of [["lifestyle", lifestyleShape], ["flatmate", flatmateShape]] as const) {
    me.patch(`/me/${path}`, async (req, res) => {
      res.json(await edit(req, () => withVersion(shape) as never,
        (tx, userId, d) => tx.lifestylePreference.upsert({ where: { userId }, create: { ...d, userId } as Prisma.LifestylePreferenceUncheckedCreateInput, update: d as Prisma.LifestylePreferenceUncheckedUpdateInput })));
    });
  }

  // Matching preferences: new answers + explicit enrollment. Same profile-version lock; never touches onboarding completion.
  me.patch("/me/matching", async (req, res) => {
    const u = await completedUser(req);
    const { intent } = need(u);
    const b = matchingPatch.parse(req.body);
    const today = istToday();
    const owner = intent === "HAVE_ROOM";
    const bad = (fields: Record<string, string>) => new ApiError(422, "VALIDATION_ERROR", "Please check your answers.", fields);
    if (owner && (b.moveInFlexible !== undefined || b.moveInDate || b.moveInLatestDate)) throw bad({ moveInDate: "Your flat's availability sets this" });
    if (!owner) {
      if (b.moveInFlexible === undefined) throw bad({ moveInFlexible: "Choose flexible or a move-in window" });
      if (b.moveInFlexible ? b.moveInDate || b.moveInLatestDate : !b.moveInDate || !b.moveInLatestDate) throw bad({ moveInDate: b.moveInFlexible ? "Clear the dates or untick flexible" : "Enter both dates" });
      if (!b.moveInFlexible && (b.moveInDate! < today || b.moveInLatestDate! < b.moveInDate!)) throw bad({ moveInLatestDate: "Choose dates from today, with the latest on or after the earliest" });
    }
    const merged = toPerson({ ...u, flatListing: null });
    Object.assign(merged, {
      work: b.workStudySchedule, accWork: b.acceptedWorkStudySchedules,
      ...(!owner && { moveInFlexible: b.moveInFlexible, moveInEarliest: b.moveInDate ?? null, moveInLatest: b.moveInLatestDate ?? null }),
    });
    const missing = missingFields(merged, today);
    if (b.enrolled && missing.length) throw bad(Object.fromEntries(missing.map((m) => [m, "Complete this before turning on matching"])));
    await db.$transaction(async (tx) => {
      const lock = await tx.profile.updateMany({ where: { userId: u.id, version: b.version }, data: { version: { increment: 1 } } });
      if (lock.count === 0) throw conflict();
      await tx.lifestylePreference.update({ where: { userId: u.id }, data: { workStudySchedule: b.workStudySchedule, acceptedWorkStudySchedules: b.acceptedWorkStudySchedules } });
      if (!owner) {
        await tx.housingPreference.update({
          where: { userId: u.id },
          data: { moveInFlexible: b.moveInFlexible!, moveInDate: b.moveInDate ? new Date(`${b.moveInDate}T00:00:00Z`) : null, moveInLatestDate: b.moveInLatestDate ? new Date(`${b.moveInLatestDate}T00:00:00Z`) : null },
        });
      }
      await tx.user.update({ where: { id: u.id }, data: b.enrolled ? { matchingEnabledAt: u.matchingEnabledAt ?? new Date(), discoveryEnabled: true } : { matchingEnabledAt: null } });
    });
    res.json(await meDto(await fresh(req)));
  });

  me.use(apiErrorHandler);

  // ---- GET /api/profiles/:publicId : explicit DTOs, visibility matrix ----
  const viewer = base(getUserId);
  viewer.get("/:publicId", async (req, res) => {
    const viewerUser = await completedUser(req);
    const publicId = req.params.publicId as string;
    if (!/^[0-9a-f-]{36}$/i.test(publicId)) throw notFound();
    const p = await db.profile.findUnique({
      where: { publicId },
      include: { user: { include: { housingPreference: true, lifestylePreference: true, flatListing: { include: flatInclude } } } },
    });
    if (!p) throw notFound();
    const t = p.user;
    const isOwner = t.id === viewerUser.id;
    const targetComplete = !!t.onboardingCompletedAt;
    const l = t.flatListing;
    const flatEligible = targetComplete && t.housingIntent === "HAVE_ROOM" && l?.status === "PUBLISHED";
    const discoverable = targetComplete && t.discoveryEnabled;
    if (!isOwner && !discoverable && !flatEligible) throw notFound(); // 404, never reveal private state
    if (!isOwner && (await blockedBetween(db, viewerUser.id, t.id, true))) throw notFound(); // same answer as "doesn't exist"
    const flat = flatEligible && l ? await publishedFlat(l, storage) : null;
    const ownerNote = isOwner && !discoverable && !flatEligible
      ? "Only you can see this. Turn on profile visibility or publish your flat to make it visible to others." : null;
    const minimal = !discoverable && !(isOwner && !flatEligible); // publisher-only view
    res.json({
      ...(ownerNote && { ownerNote }), isOwner,
      profile: { displayName: p.displayName, avatarUrl: p.avatarUrl },
      ...(!minimal && {
        // Only intended fields. No DOB, IDs, accepted preferences, locality arrays or budget.
        profile: {
          displayName: p.displayName, avatarUrl: p.avatarUrl, occupation: p.occupation, bio: p.bio,
          age: p.birthDate ? ageOn(iso(p.birthDate), istToday()) : null,
          ...(p.gender && p.gender !== "PREFER_NOT_TO_SAY" && { gender: p.gender }),
        },
        intent: t.housingIntent,
        city: t.housingPreference?.city ? { id: t.housingPreference.city, label: cityLabel(t.housingPreference.city) } : null,
        lifestyle: t.lifestylePreference && {
          sleepSchedule: t.lifestylePreference.sleepSchedule, cleanliness: t.lifestylePreference.cleanliness, foodHabit: t.lifestylePreference.foodHabit,
          smokingHabit: t.lifestylePreference.smokingHabit, bringingPet: t.lifestylePreference.bringingPet, guestFrequency: t.lifestylePreference.guestFrequency,
        },
      }),
      flat,
    });
  });
  viewer.use(apiErrorHandler);

  return { dashboard, me, viewer };
}
