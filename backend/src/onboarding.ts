import { clerkClient } from "@clerk/express";
import express, { type ErrorRequestHandler, type Request, type RequestHandler, Router } from "express";
import { z } from "zod";
import { CITIES } from "./cities.js";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import type { HousingIntent } from "./generated/prisma/client.js";
import {
  ageOn, checkHousing, checkProfile, flatmateShape, housingShape, intentShape, isAdult, istToday,
  lifestyleShape, profileShape, STEPS, withRevision,
} from "./onboarding-rules.js";

type Tx = Prisma.TransactionClient;

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}
const conflict = () => new ApiError(409, "REVISION_CONFLICT", "Your answers changed elsewhere. Reload to continue.");

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ---- state: saved draft + derived validity (no stored step/progress) ----
async function loadState(clerkUserId: string) {
  const u = await db.user.findUnique({
    where: { clerkUserId },
    include: { profile: true, housingPreference: true, lifestylePreference: true },
  });
  const today = istToday();
  const { profile: p, housingPreference: h, lifestylePreference: l } = u ?? {};

  const profile = p ? { displayName: p.displayName, birthDate: iso(p.birthDate), occupation: p.occupation, bio: p.bio, avatarUrl: p.avatarUrl } : null;
  const housing = h
    ? { city: h.city, preferredLocations: h.preferredLocations, locationsFlexible: h.locationsFlexible, monthlyRentMinPaise: h.monthlyRentMinPaise, monthlyRentMaxPaise: h.monthlyRentMaxPaise, moveInDate: iso(h.moveInDate), moveInFlexible: h.moveInFlexible }
    : null;
  const lifestyle = l
    ? { sleepSchedule: l.sleepSchedule, cleanliness: l.cleanliness, foodHabit: l.foodHabit, smokingHabit: l.smokingHabit, bringingPet: l.bringingPet, guestFrequency: l.guestFrequency }
    : null;
  const flatmate = l
    ? { acceptedSleepSchedules: l.acceptedSleepSchedules, acceptedCleanlinessLevels: l.acceptedCleanlinessLevels, acceptedFoodHabits: l.acceptedFoodHabits, acceptedSmokingHabits: l.acceptedSmokingHabits, flatmatePetPreference: l.flatmatePetPreference, acceptedGuestFrequencies: l.acceptedGuestFrequencies }
    : null;

  const intent = u?.housingIntent ?? null;
  const stepValidity = {
    intent: intent !== null,
    about:
      !!profile &&
      z.object(profileShape).superRefine((v, c) => checkProfile(v, c, today)).safeParse(profile).success &&
      isAdult(profile.birthDate!, today),
    housing: !!housing && z.strictObject(housingShape).superRefine((v, c) => checkHousing(v, intent, c, today)).safeParse(housing).success,
    lifestyle: !!lifestyle && z.strictObject(lifestyleShape).safeParse(lifestyle).success,
    flatmate: !!flatmate && z.strictObject(flatmateShape).safeParse(flatmate).success,
  };
  const firstInvalid = STEPS.find((s) => !stepValidity[s]);
  return {
    revision: u?.onboardingRevision ?? 0,
    onboardingCompletedAt: u?.onboardingCompletedAt ?? null,
    discoveryEnabled: u?.discoveryEnabled ?? false,
    housingIntent: intent,
    age: profile?.birthDate ? ageOn(profile.birthDate, today) : null, // DOB itself is returned only to its owner for editing
    profile, housing, lifestyle, flatmate,
    stepValidity,
    nextStep: firstInvalid ?? "review",
    cities: Object.entries(CITIES).map(([name, localities]) => ({ name, localities })),
  };
}
const allValid = (s: Awaited<ReturnType<typeof loadState>>) => Object.values(s.stepValidity).every(Boolean);

// ---- concurrency: conditionally bump revision as the FIRST write; this row-locks the parent user ----
async function lock(tx: Tx, clerkUserId: string, revision: number) {
  const { count } = await tx.user.updateMany({
    where: { clerkUserId, onboardingRevision: revision, onboardingCompletedAt: null },
    data: { onboardingRevision: { increment: 1 } },
  });
  if (count === 0) {
    const u = await tx.user.findUnique({ where: { clerkUserId } });
    if (u?.onboardingCompletedAt) throw new ApiError(409, "ONBOARDING_ALREADY_COMPLETE", "Onboarding is already complete.");
    throw conflict();
  }
  return tx.user.findUniqueOrThrow({ where: { clerkUserId } });
}
const save = <T,>(uid: string, revision: number, write: (tx: Tx, userId: string) => Promise<T>) =>
  db.$transaction(async (tx) => write(tx, (await lock(tx, uid, revision)).id));

// ---- router ----
export function onboardingRouter(getUserId: (req: Request) => string | null) {
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
  const intentOf = async (id: string): Promise<HousingIntent | null> => {
    const u = await db.user.findUnique({ where: { clerkUserId: id } });
    if (!u) throw new ApiError(422, "VALIDATION_ERROR", "Choose what you're looking for first.", { housingIntent: "Required" });
    return u.housingIntent;
  };
  const route = (fn: (req: Request) => Promise<unknown>): RequestHandler => async (req, res) => {
    await fn(req);
    res.json(await loadState(uid(req)));
  };

  r.get("/", route(async () => {}));

  r.patch("/intent", route(async (req) => {
    const b = withRevision(intentShape).parse(req.body);
    await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { clerkUserId: uid(req) } });
      if (!existing) {
        if (b.revision !== 0) throw conflict();
        try {
          await tx.user.create({ data: { clerkUserId: uid(req), housingIntent: b.housingIntent, onboardingRevision: 1 } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict(); // lost the first-save race
          throw e;
        }
        return;
      }
      const u = await lock(tx, uid(req), b.revision);
      if (u.housingIntent !== b.housingIntent) {
        await tx.user.update({ where: { id: u.id }, data: { housingIntent: b.housingIntent } });
        await tx.housingPreference.deleteMany({ where: { userId: u.id } }); // intent-specific: user re-confirms housing
      }
    });
  }));

  r.patch("/profile", route(async (req) => {
    const today = istToday();
    const { revision, photoAction, ...d } = withRevision({ ...profileShape, photoAction: z.enum(["keep", "use_clerk", "clear"]) })
      .superRefine((v, c) => checkProfile(v, c, today)).parse(req.body);
    if (!isAdult(d.birthDate, today)) throw new ApiError(403, "AGE_RESTRICTED", "Flatter is for adults aged 18 and over.");
    await intentOf(uid(req));
    // Network call stays outside the DB transaction; URL always comes from the verified Clerk account.
    let avatar: { avatarUrl: string | null } | Record<string, never> = {};
    if (photoAction === "clear") avatar = { avatarUrl: null };
    if (photoAction === "use_clerk") {
      const cu = await clerkClient.users.getUser(uid(req));
      avatar = { avatarUrl: cu.hasImage ? cu.imageUrl : null };
    }
    const data = { ...d, birthDate: new Date(`${d.birthDate}T00:00:00Z`), ...avatar };
    await save(uid(req), revision, (tx, userId) =>
      tx.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
  }));

  r.patch("/housing", route(async (req) => {
    const intent = await intentOf(uid(req));
    const today = istToday();
    const { revision, ...d } = withRevision(housingShape).superRefine((v, c) => checkHousing(v, intent, c, today)).parse(req.body);
    const data = { ...d, moveInDate: d.moveInDate ? new Date(`${d.moveInDate}T00:00:00Z`) : null };
    await save(uid(req), revision, (tx, userId) =>
      tx.housingPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
  }));

  const lifestyleSection = (shape: z.core.$ZodShape) => route(async (req) => {
    const { revision, ...d } = withRevision(shape).parse(req.body) as { revision: number } & Record<string, never>;
    await intentOf(uid(req));
    await save(uid(req), revision, (tx, userId) =>
      tx.lifestylePreference.upsert({ where: { userId }, create: { userId, ...d }, update: d }));
  });
  r.patch("/lifestyle", lifestyleSection(lifestyleShape));
  r.patch("/flatmate", lifestyleSection(flatmateShape));

  r.post("/complete", route(async (req) => {
    const b = withRevision({ discoveryEnabled: z.boolean() }).parse(req.body);
    const current = await db.user.findUnique({ where: { clerkUserId: uid(req) } });
    if (current?.onboardingCompletedAt) return; // retried Finish: return existing result untouched
    await save(uid(req), b.revision, async (tx, userId) => {
      // Revalidate everything persisted, inside the lock. Rolls back (and un-bumps revision) on failure.
      const state = await loadState(uid(req));
      if (!allValid(state)) {
        throw new ApiError(422, "VALIDATION_ERROR", "Some sections need attention.",
          Object.fromEntries(Object.entries(state.stepValidity).filter(([, ok]) => !ok).map(([s]) => [s, "Incomplete or out of date"])));
      }
      await tx.user.update({ where: { id: userId }, data: { onboardingCompletedAt: new Date(), discoveryEnabled: b.discoveryEnabled } });
    });
  }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const send = (status: number, code: string, message: string, fields?: Record<string, string>) =>
      res.status(status).json({ error: { code, message, ...(fields && { fields }) } });
    if (err instanceof ApiError) return send(err.status, err.code, err.message, err.fields);
    if (err instanceof z.ZodError) {
      return send(422, "VALIDATION_ERROR", "Please check your answers.",
        Object.fromEntries(err.issues.map((i) => [i.path.join(".") || "_", i.message])));
    }
    if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) return send(err.status, "BAD_REQUEST", "Invalid request body.");
    console.error(err);
    const dbDown = err instanceof Prisma.PrismaClientInitializationError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && /^P(1|2024)/.test(err.code)) ||
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|Connection terminated/.test(String(err?.message ?? err?.cause?.message));
    return dbDown ? send(503, "TEMPORARILY_UNAVAILABLE", "Service temporarily unavailable. Please retry.") : send(500, "INTERNAL", "Something went wrong.");
  };
  r.use(onError);
  return r;
}
