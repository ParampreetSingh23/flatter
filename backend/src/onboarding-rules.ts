import { z } from "zod";
import { CITIES, CITY_NAMES } from "./cities.js";
import {
  Cleanliness, FoodHabit, GuestFrequency, HousingIntent, Occupation, PetPreference, SleepSchedule, SmokingHabit,
} from "./generated/prisma/client.js";

// ---- dates (all calendar dates, Asia/Kolkata) ----
export const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "Invalid date");

// 18th birthday reached? A 29 Feb birthday counts on 1 Mar in non-leap years (string compare handles it).
export function isAdult(birth: string, today: string) {
  const [y, ...rest] = today.split("-");
  return birth <= `${Number(y) - 18}-${rest.join("-")}`;
}
export function ageOn(birth: string, today: string) {
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  return today.slice(5) < birth.slice(5) ? age - 1 : age;
}

// ---- section shapes (field names = DB column names) ----
const dedupe = <T,>(a: T[]) => [...new Set(a)];
const accepted = <T extends z.ZodType>(item: T) => z.array(item).min(1).transform(dedupe);
const paise = z.int().min(1).max(2147483647);

export const intentShape = { housingIntent: z.enum(HousingIntent) };

export const profileShape = {
  displayName: z.string().trim().min(1).max(80),
  birthDate: dateStr,
  occupation: z.enum(Occupation),
  bio: z.string().trim().max(500).nullish().transform((v) => v || null),
};
export function checkProfile(v: { birthDate: string }, ctx: z.RefinementCtx, today: string) {
  if (v.birthDate > today || v.birthDate < "1900-01-01") {
    ctx.addIssue({ code: "custom", path: ["birthDate"], message: "Enter a valid date of birth" });
  }
}

export const housingShape = {
  city: z.enum(CITY_NAMES),
  preferredLocations: z.array(z.string()).transform(dedupe),
  locationsFlexible: z.boolean(),
  monthlyRentMinPaise: paise,
  monthlyRentMaxPaise: paise,
  moveInDate: dateStr.nullable(),
  moveInFlexible: z.boolean(),
};
export function checkHousing(
  v: { city: string; preferredLocations: string[]; locationsFlexible: boolean; monthlyRentMinPaise: number; monthlyRentMaxPaise: number; moveInDate: string | null; moveInFlexible: boolean },
  intent: HousingIntent | null,
  ctx: z.RefinementCtx,
  today: string,
) {
  const bad = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const n = v.preferredLocations.length;
  if (!intent) bad("housingIntent", "Choose what you're looking for first");
  if (v.preferredLocations.some((l) => !CITIES[v.city]?.includes(l))) bad("preferredLocations", "Choose localities in the selected city");
  if (intent === "HAVE_ROOM") {
    if (v.locationsFlexible || n !== 1) bad("preferredLocations", "Choose your flat's locality");
    if (v.monthlyRentMinPaise !== v.monthlyRentMaxPaise) bad("monthlyRentMaxPaise", "Enter one monthly rent");
  } else if (v.locationsFlexible ? n !== 0 : n < 1 || n > 5) {
    bad("preferredLocations", "Choose 1–5 localities, or anywhere in the city");
  }
  if (v.monthlyRentMinPaise > v.monthlyRentMaxPaise) bad("monthlyRentMaxPaise", "Maximum must be at least the minimum");
  if (v.moveInFlexible ? v.moveInDate !== null : v.moveInDate === null || v.moveInDate < today) {
    bad("moveInDate", v.moveInFlexible ? "Clear the date or untick flexible" : "Choose today or a later date");
  }
}

export const lifestyleShape = {
  sleepSchedule: z.enum(SleepSchedule),
  cleanliness: z.enum(Cleanliness),
  foodHabit: z.enum(FoodHabit),
  smokingHabit: z.enum(SmokingHabit),
  bringingPet: z.boolean(),
  guestFrequency: z.enum(GuestFrequency),
};

export const flatmateShape = {
  acceptedSleepSchedules: accepted(z.enum(SleepSchedule)),
  acceptedCleanlinessLevels: accepted(z.enum(Cleanliness)),
  acceptedFoodHabits: accepted(z.enum(FoodHabit)),
  acceptedSmokingHabits: accepted(z.enum(SmokingHabit)),
  flatmatePetPreference: z.enum(PetPreference),
  acceptedGuestFrequencies: accepted(z.enum(GuestFrequency)),
};

export const withRevision = <S extends z.core.$ZodShape>(shape: S) =>
  z.strictObject({ revision: z.int().min(0), ...shape });

export const STEPS = ["intent", "about", "housing", "lifestyle", "flatmate"] as const;
