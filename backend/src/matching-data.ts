import { createHash } from "node:crypto";
import { db } from "./db.js";
import { Prisma } from "./generated/prisma/client.js";
import { iso } from "./listing-rules.js";
import { evaluate, type Flat, type Person, type Result } from "./matching-score.js";
import { isAdult } from "./onboarding-rules.js";

type Db = Prisma.TransactionClient | typeof db;

// Everything scoring and eligibility need. Photos are loaded separately, only where a flat is shown.
export const fullInclude = { profile: true, housingPreference: true, lifestylePreference: true, flatListing: true } as const;
export type Full = Prisma.UserGetPayload<{ include: typeof fullInclude }>;

export function toPerson(u: Full): Person {
  const h = u.housingPreference, l = u.lifestylePreference;
  const d = (x: Date | null | undefined) => (x ? iso(x) : null);
  return {
    intent: u.housingIntent!, gender: u.profile?.gender ?? null,
    cityId: h?.city ?? null, localityIds: h?.preferredLocations ?? [], localitiesFlexible: h?.locationsFlexible ?? null,
    rentMinPaise: h?.monthlyRentMinPaise ?? null, rentMaxPaise: h?.monthlyRentMaxPaise ?? null,
    moveInEarliest: d(h?.moveInDate), moveInLatest: d(h?.moveInLatestDate), moveInFlexible: h?.moveInFlexible ?? null,
    sleep: l?.sleepSchedule ?? null, accSleep: l?.acceptedSleepSchedules ?? [],
    cleanliness: l?.cleanliness ?? null, accClean: l?.acceptedCleanlinessLevels ?? [],
    food: l?.foodHabit ?? null, accFood: l?.acceptedFoodHabits ?? [],
    smoking: l?.smokingHabit ?? null, accSmoking: l?.acceptedSmokingHabits ?? [],
    guests: l?.guestFrequency ?? null, accGuests: l?.acceptedGuestFrequencies ?? [],
    work: l?.workStudySchedule ?? null, accWork: l?.acceptedWorkStudySchedules ?? [],
    bringingPet: l?.bringingPet ?? null, petPref: l?.flatmatePetPreference ?? null, accGenders: l?.acceptedGenders ?? [],
  };
}

// Only a Published listing with a place and complete availability counts. Actual listing values beat the owner's onboarding estimates.
export function toFlat(u: Full): Flat | null {
  const l = u.flatListing;
  if (!l || l.status !== "PUBLISHED" || !l.cityId || !l.localityId || l.monthlyRentPaise == null || l.availableFlexible == null) return null;
  if ((l.availablePlaces ?? 0) < 1 || (!l.availableFlexible && !l.availableFrom)) return null;
  return { cityId: l.cityId, localityId: l.localityId, rentPaise: l.monthlyRentPaise, availableFrom: l.availableFrom ? iso(l.availableFrom) : "1970-01-01", availableFlexible: l.availableFlexible, availablePlaces: l.availablePlaces! };
}

/** Adult, completed, enrolled, visible, not suspended. Evaluated for both people, before scoring and again on Like. */
export function accountOk(u: Full, today: string): boolean {
  const b = u.profile?.birthDate;
  return !!(u.housingIntent && u.onboardingCompletedAt && u.discoveryEnabled && u.matchingEnabledAt && !u.suspendedAt && b && isAdult(iso(b), today));
}

/** null = not an eligible pair (never explain why). Otherwise the pure evaluation, which may be "incomplete". */
export function pair(a: Full, b: Full, today: string): Result | null {
  if (!accountOk(a, today) || !accountOk(b, today)) return null;
  const owner = [a, b].find((x) => x.housingIntent === "HAVE_ROOM");
  const flat = owner ? toFlat(owner) : undefined;
  if (owner && !flat) return null;
  return evaluate(toPerson(a), toPerson(b), { today, ...(flat && { flat }) });
}

const orFor = (a: string, b: string) => [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }];
/** activeOnly: reads/chat deny only while a block is in force. Otherwise any history keeps the pair out of discovery and Likes. */
export const blockedBetween = async (c: Db, a: string, b: string, activeOnly: boolean) =>
  !!(await c.userBlock.findFirst({ where: { OR: orFor(a, b), ...(activeOnly && { revokedAt: null }) }, select: { id: true } }));

export const canonical = (a: string, b: string) => (a < b ? { low: a, high: b } : { low: b, high: a });

/** One lock key per unordered pair for Like/Pass/Block/Unblock/Unmatch. Released at transaction end. */
export async function pairLock(tx: Prisma.TransactionClient, a: string, b: string) {
  const { low, high } = canonical(a, b);
  // Wrapped so the driver never has to read the lock function's void result.
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${low + ":" + high}, 0))) AS l`;
}

/** Deterministic, daily-rotating order so no fixed UUID range is permanently favoured. */
export const rotate = (ids: string[], viewerId: string, today: string) =>
  ids.map((id) => [createHash("md5").update(id + viewerId + today).digest("hex"), id] as const).sort((x, y) => (x[0] < y[0] ? -1 : 1)).map((x) => x[1]);
