export type Intent = "HAVE_ROOM" | "TEAM_UP" | "NEED_ROOM";
export const STEPS = ["intent", "about", "housing", "lifestyle", "flatmate", "review"] as const;
export type Step = (typeof STEPS)[number];

export interface OnboardingState {
  revision: number;
  onboardingCompletedAt: string | null;
  discoveryEnabled: boolean;
  housingIntent: Intent | null;
  age: number | null;
  profile: { displayName: string | null; birthDate: string | null; gender: string | null; occupation: string | null; bio: string | null; avatarUrl: string | null } | null;
  housing: {
    city: string | null; preferredLocations: string[]; locationsFlexible: boolean | null;
    monthlyRentMinPaise: number | null; monthlyRentMaxPaise: number | null; moveInDate: string | null; moveInFlexible: boolean | null;
  } | null;
  lifestyle: {
    sleepSchedule: string | null; cleanliness: string | null; foodHabit: string | null; smokingHabit: string | null;
    bringingPet: boolean | null; guestFrequency: string | null;
  } | null;
  flatmate: {
    acceptedSleepSchedules: string[]; acceptedCleanlinessLevels: string[]; acceptedFoodHabits: string[];
    acceptedSmokingHabits: string[]; flatmatePetPreference: string | null; acceptedGuestFrequencies: string[]; acceptedGenders: string[];
  } | null;
  stepValidity: Record<Exclude<Step, "review">, boolean>;
  nextStep: Step;
}

export type Opt = { value: string; label: string; desc?: string };
export const SLEEP: Opt[] = [
  { value: "EARLY_BIRD", label: "Early bird" }, { value: "NIGHT_OWL", label: "Night owl" }, { value: "FLEXIBLE", label: "Flexible" },
];
export const CLEAN: Opt[] = [
  { value: "RELAXED", label: "Relaxed", desc: "Shared spaces are tidied when needed." },
  { value: "REGULAR", label: "Regular", desc: "Shared spaces are cleaned on a routine." },
  { value: "VERY_TIDY", label: "Very tidy", desc: "Shared spaces stay spotless." },
];
export const FOOD: Opt[] = [
  { value: "VEGAN", label: "Vegan" }, { value: "VEGETARIAN", label: "Vegetarian" },
  { value: "EGGETARIAN", label: "Eggetarian" }, { value: "NON_VEGETARIAN", label: "Non-vegetarian" },
];
export const SMOKE: Opt[] = [
  { value: "NON_SMOKER", label: "Non-smoker", desc: "Includes cigarettes and vaping." },
  { value: "OUTDOORS_ONLY", label: "Only outdoors" }, { value: "INDOORS", label: "Indoors too" },
];
export const GUESTS: Opt[] = [
  { value: "RARELY", label: "Rarely", desc: "About monthly or less." },
  { value: "OCCASIONALLY", label: "Occasionally", desc: "About weekly." },
  { value: "FREQUENTLY", label: "Frequently", desc: "Several times a week." },
];
export const PETS: Opt[] = [
  { value: "OK_WITH_PETS", label: "Okay with pets" }, { value: "NO_PETS", label: "No pets" }, { value: "NO_PREFERENCE", label: "No preference" },
];
export const GENDERS: Opt[] = [
  { value: "WOMAN", label: "Woman" }, { value: "MAN", label: "Man" },
  { value: "NON_BINARY", label: "Non-binary" }, { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
export const FLATMATE_GENDERS: Opt[] = [
  { value: "WOMAN", label: "Women" }, { value: "MAN", label: "Men" },
  { value: "NON_BINARY", label: "Non-binary people" }, { value: "PREFER_NOT_TO_SAY", label: "People who prefer not to say" },
];
export const OCCUPATIONS: Opt[] = [
  { value: "STUDENT", label: "Student" }, { value: "WORKING_PROFESSIONAL", label: "Working professional" },
  { value: "SELF_EMPLOYED", label: "Self-employed" }, { value: "OTHER", label: "Other" },
];
export const INTENTS: (Opt & { value: Intent })[] = [
  { value: "HAVE_ROOM", label: "I have a flat, need a flatmate", desc: "Find someone to move into your existing place." },
  { value: "TEAM_UP", label: "Find a flat together", desc: "Meet compatible people and rent a new place together." },
  { value: "NEED_ROOM", label: "I need a room", desc: "Discover available rooms in shared apartments." },
];
export const label = (opts: Opt[], v: string | null | undefined) => opts.find((o) => o.value === v)?.label ?? "—";

export const WORK: Opt[] = [
  { value: "DAYTIME", label: "Daytime", desc: "Out or busy during the day, home in the evening." },
  { value: "EVENING", label: "Evening", desc: "Classes or work that run into the evening." },
  { value: "NIGHT", label: "Night", desc: "Work or study overnight." },
  { value: "ROTATING", label: "Rotating shifts", desc: "Hours change from week to week." },
  { value: "FLEXIBLE", label: "Flexible", desc: "No fixed routine." },
];
