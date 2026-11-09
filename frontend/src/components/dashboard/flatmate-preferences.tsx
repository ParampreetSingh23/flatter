import type { ReactNode } from "react";
import { Icon } from "../icons";
import { Card } from "./blocks";
import { DetailRows } from "./detail-rows";
import type { MeData } from "../../lib/dashboard-types";
import { CLEAN, FOOD, FLATMATE_GENDERS, GUESTS, label, PETS, SLEEP, SMOKE, type Opt } from "../../lib/onboarding-types";

function answer(options: Opt[], values: string[] | undefined, anyLabel: string) {
  if (!values?.length) return "Not set";
  if (new Set(values).size === options.length && options.every((option) => values.includes(option.value))) return anyLabel;
  return Array.from(new Set(values)).map((value) => value === "NON_SMOKER" ? "Non-smokers only" : label(options, value)).join(", ");
}

export function FlatmatePreferences({ preferences: f, action, children }: {
  preferences: MeData["flatmate"]; action?: ReactNode; children?: ReactNode;
}) {
  const rows: [string, string][] = [
    ["Sleep schedule", answer(SLEEP, f?.acceptedSleepSchedules, "Any schedule")],
    ["Cleanliness", answer(CLEAN, f?.acceptedCleanlinessLevels, "Any cleanliness level")],
    ["Diet", answer(FOOD, f?.acceptedFoodHabits, "Any diet")],
    ["Smoking", answer(SMOKE, f?.acceptedSmokingHabits, "Any smoking habit")],
    ["Gender", answer(FLATMATE_GENDERS, f?.acceptedGenders, "Any gender")],
    ["Pets", f?.flatmatePetPreference ? label(PETS, f.flatmatePetPreference) : "Not set"],
    ["Guests", answer(GUESTS, f?.acceptedGuestFrequencies, "Any guest frequency")],
  ];

  return (
    <Card title="Your flatmate preferences" id="flat-pref-h" action={action} className="lg:col-span-2">
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><Icon name="lock" className="size-3.5" />Private</span>
        <span>What makes sharing a home work for you.</span>
      </p>
      {children ?? <DetailRows rows={rows} className="lg:grid-cols-2 lg:gap-x-8" />}
    </Card>
  );
}
