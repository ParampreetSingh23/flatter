// compatibility-v1: pure, deterministic pair evaluation. No DB, no network, no clock (caller passes `today`).
// Hard rules run first and produce "excluded" (never a low score). See docs/matching-engine.md sections 3-4.
export const POLICY = "compatibility-v1";
export const WEIGHTS = { B: 20, L: 20, C: 15, H: 15, S: 10, M: 10, F: 5, W: 5 } as const;
// ponytail: 0.75 for "different but mutually accepted" is a product heuristic, not validated; tune with real usage.
const ACCEPTED_DIFFERENT = 0.75;

export type Intent = "HAVE_ROOM" | "TEAM_UP" | "NEED_ROOM";
export type Work = "DAYTIME" | "EVENING" | "NIGHT" | "ROTATING" | "FLEXIBLE";
export type Sleep = "EARLY_BIRD" | "NIGHT_OWL" | "FLEXIBLE";
export type Clean = "RELAXED" | "REGULAR" | "VERY_TIDY";
export type Food = "VEGAN" | "VEGETARIAN" | "EGGETARIAN" | "NON_VEGETARIAN";
export type Smoke = "NON_SMOKER" | "OUTDOORS_ONLY" | "INDOORS";
export type Guests = "RARELY" | "OCCASIONALLY" | "FREQUENTLY";
export type Gender = "WOMAN" | "MAN" | "NON_BINARY" | "PREFER_NOT_TO_SAY";
export type PetPref = "OK_WITH_PETS" | "NO_PETS" | "NO_PREFERENCE";

// Dates are calendar days as "YYYY-MM-DD". Money is integer paise.
export interface Person {
  intent: Intent;
  gender: Gender | null;
  cityId: string | null;
  localityIds: string[];
  localitiesFlexible: boolean | null;
  rentMinPaise: number | null;
  rentMaxPaise: number | null;
  moveInEarliest: string | null;
  moveInLatest: string | null;
  moveInFlexible: boolean | null;
  sleep: Sleep | null; accSleep: Sleep[];
  cleanliness: Clean | null; accClean: Clean[];
  food: Food | null; accFood: Food[];
  smoking: Smoke | null; accSmoking: Smoke[];
  guests: Guests | null; accGuests: Guests[];
  work: Work | null; accWork: Work[];
  bringingPet: boolean | null;
  petPref: PetPref | null;
  accGenders: Gender[];
}

// The owner's real Published listing; overrides the owner's own onboarding estimates.
export interface Flat {
  cityId: string;
  localityId: string;
  rentPaise: number;
  availableFrom: string;
  availableFlexible: boolean;
  availablePlaces: number;
}

export type Parts = Record<keyof typeof WEIGHTS, number>;
export type Result =
  | { status: "ok"; policy: typeof POLICY; score: number; display: number; parts: Parts }
  | { status: "incomplete"; side: "a" | "b"; missing: string[] } // not ready for the full score; never a zero
  | { status: "excluded"; gate: string }; // internal only: never shown to either person

const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
const maxD = (...d: string[]) => d.reduce((x, y) => (day(y) > day(x) ? y : x));
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Weighted total in [0,100], unrounded.
export const combine = (p: Parts) => (Object.keys(WEIGHTS) as (keyof Parts)[]).reduce((t, k) => t + WEIGHTS[k] * clamp01(p[k]), 0);
// Round half up (epsilon guards binary float, e.g. 82.4999999).
export const display = (score: number) => Math.floor(score + 0.5 + 1e-9);

/** Fields required before this person can be scored. Flat owners are scored on the flat, not on their own housing answers. */
export function missingFields(p: Person, today: string): string[] {
  const m: string[] = [];
  const need = (ok: boolean, name: string) => { if (!ok) m.push(name); };
  need(p.gender != null, "gender");
  need(p.sleep != null && p.accSleep.length > 0, "sleep");
  need(p.cleanliness != null && p.accClean.length > 0, "cleanliness");
  need(p.food != null && p.accFood.length > 0, "food");
  need(p.smoking != null && p.accSmoking.length > 0, "smoking");
  need(p.guests != null && p.accGuests.length > 0, "guests");
  need(p.work != null && p.accWork.length > 0, "workSchedule");
  need(p.bringingPet != null && p.petPref != null, "pets");
  need(p.accGenders.length > 0, "acceptedGenders");
  if (p.intent !== "HAVE_ROOM") {
    need(p.cityId != null, "city");
    need(p.rentMinPaise != null && p.rentMaxPaise != null && p.rentMinPaise <= p.rentMaxPaise, "budget");
    need(p.localitiesFlexible != null && (p.localitiesFlexible || p.localityIds.length > 0), "locations");
    const w = p.moveInFlexible === true || (p.moveInFlexible === false && p.moveInEarliest != null && p.moveInLatest != null && day(p.moveInEarliest) <= day(p.moveInLatest) && day(p.moveInLatest) >= day(today));
    need(w, "moveIn");
  }
  return m;
}

const accepts = <T>(list: T[], v: T) => list.includes(v);

// Mutual acceptance of every declared answer. Order of arguments is irrelevant.
function tolerated(a: Person, b: Person): boolean {
  const one = (x: Person, y: Person) =>
    accepts(x.accSleep, y.sleep!) && accepts(x.accClean, y.cleanliness!) && accepts(x.accFood, y.food!) &&
    accepts(x.accSmoking, y.smoking!) && accepts(x.accGuests, y.guests!) && accepts(x.accWork, y.work!) &&
    accepts(x.accGenders, y.gender!) && !(y.bringingPet && x.petPref === "NO_PETS");
  return one(a, b) && one(b, a);
}

const levels = <T extends string>(order: readonly T[], x: T, y: T) => 1 - Math.abs(order.indexOf(x) - order.indexOf(y)) / (order.length - 1);
const same = <T>(x: T, y: T) => (x === y ? 1 : ACCEPTED_DIFFERENT);

/** Window [start,end] in days with start clamped to today. Caller guarantees readiness. */
const win = (p: Person, today: string) => ({ s: maxD(p.moveInEarliest!, today), e: p.moveInLatest! });
const len = (w: { s: string; e: string }) => day(w.e) - day(w.s) + 1;

export function evaluate(a: Person, b: Person, ctx: { today: string; flat?: Flat }): Result {
  const ma = missingFields(a, ctx.today);
  if (ma.length) return { status: "incomplete", side: "a", missing: ma };
  const mb = missingFields(b, ctx.today);
  if (mb.length) return { status: "incomplete", side: "b", missing: mb };

  const room = (a.intent === "HAVE_ROOM" && b.intent === "NEED_ROOM") || (a.intent === "NEED_ROOM" && b.intent === "HAVE_ROOM");
  const team = a.intent === "TEAM_UP" && b.intent === "TEAM_UP";
  if (!room && !team) return { status: "excluded", gate: "intent" };
  if (!tolerated(a, b)) return { status: "excluded", gate: "tolerance" };

  let Bs: number, Ls: number, Ms: number;
  if (team) {
    if (a.cityId !== b.cityId) return { status: "excluded", gate: "city" };
    // Budget: overlap coefficient on inclusive paise intervals.
    const inter = Math.min(a.rentMaxPaise!, b.rentMaxPaise!) - Math.max(a.rentMinPaise!, b.rentMinPaise!) + 1;
    if (inter <= 0) return { status: "excluded", gate: "budget" };
    Bs = inter / Math.min(a.rentMaxPaise! - a.rentMinPaise! + 1, b.rentMaxPaise! - b.rentMinPaise! + 1);
    // Location: flexible = 1; else shared / smaller set. A shared city alone earns nothing.
    if (a.localitiesFlexible || b.localitiesFlexible) Ls = 1;
    else {
      const shared = a.localityIds.filter((l) => b.localityIds.includes(l)).length;
      Ls = shared / Math.min(a.localityIds.length, b.localityIds.length);
    }
    // Move-in: either flexible = 1; else window overlap / smaller window.
    if (a.moveInFlexible || b.moveInFlexible) Ms = 1;
    else {
      const wa = win(a, ctx.today), wb = win(b, ctx.today);
      const s = maxD(wa.s, wb.s), e = day(wa.e) < day(wb.e) ? wa.e : wb.e;
      const inter2 = day(e) - day(s) + 1;
      if (inter2 <= 0) return { status: "excluded", gate: "moveIn" };
      Ms = inter2 / Math.min(len(wa), len(wb));
    }
  } else {
    const seeker = a.intent === "NEED_ROOM" ? a : b;
    const f = ctx.flat;
    if (!f || f.availablePlaces < 1) return { status: "excluded", gate: "flat" };
    if (f.cityId !== seeker.cityId) return { status: "excluded", gate: "city" };
    // Budget: actual rent must sit in the seeker's range; no invented bonus for cheaper.
    if (f.rentPaise < seeker.rentMinPaise! || f.rentPaise > seeker.rentMaxPaise!) return { status: "excluded", gate: "budget" };
    Bs = 1;
    Ls = seeker.localitiesFlexible || seeker.localityIds.includes(f.localityId) ? 1 : 0;
    if (seeker.moveInFlexible || f.availableFlexible) Ms = 1;
    else {
      const w = win(seeker, ctx.today);
      const start = maxD(w.s, f.availableFrom);
      const left = day(w.e) - day(start) + 1;
      if (left <= 0) return { status: "excluded", gate: "moveIn" };
      Ms = left / len(w);
    }
  }

  const H = (same(a.smoking, b.smoking) + levels(["RARELY", "OCCASIONALLY", "FREQUENTLY"], a.guests!, b.guests!) + 1) / 3;
  const parts: Parts = {
    B: Bs, L: Ls, M: Ms, H,
    C: levels(["RELAXED", "REGULAR", "VERY_TIDY"], a.cleanliness!, b.cleanliness!),
    S: a.sleep === "FLEXIBLE" || b.sleep === "FLEXIBLE" ? 1 : same(a.sleep, b.sleep),
    F: same(a.food, b.food),
    W: a.work === "FLEXIBLE" || b.work === "FLEXIBLE" ? 1 : same(a.work, b.work),
  };
  const score = combine(parts);
  return { status: "ok", policy: POLICY, score, display: display(score), parts };
}
