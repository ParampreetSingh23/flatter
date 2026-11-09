import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { MeData } from "../../lib/dashboard-types";
import { CLEAN, FOOD, FLATMATE_GENDERS, GUESTS, SLEEP, SMOKE } from "../../lib/onboarding-types";
import { FlatmatePreferences } from "./flatmate-preferences";

const complete: NonNullable<MeData["flatmate"]> = {
  acceptedSleepSchedules: SLEEP.map((o) => o.value),
  acceptedCleanlinessLevels: CLEAN.map((o) => o.value),
  acceptedFoodHabits: FOOD.map((o) => o.value),
  acceptedSmokingHabits: SMOKE.map((o) => o.value),
  acceptedGenders: FLATMATE_GENDERS.map((o) => o.value),
  acceptedGuestFrequencies: GUESTS.map((o) => o.value),
  flatmatePetPreference: "NO_PETS",
};

test("explicitly selecting every option shows a concise answer without changing saved preferences", () => {
  const before = JSON.stringify(complete);
  const html = renderToStaticMarkup(<FlatmatePreferences preferences={complete} />);
  for (const text of ["Your flatmate preferences", "Private", "Any schedule", "Any diet", "Any gender", "No pets"]) assert.ok(html.includes(text), text);
  assert.equal(JSON.stringify(complete), before);
});

test("unanswered preferences never imply any option is accepted", () => {
  for (const preferences of [null, { ...complete, acceptedFoodHabits: [], flatmatePetPreference: null }]) {
    const html = renderToStaticMarkup(<FlatmatePreferences preferences={preferences} />);
    assert.ok(html.includes("Not set"));
    assert.ok(!html.includes("Any diet"));
  }
});

test("specific selections render as plain text; duplicates cannot imply all options", () => {
  const html = renderToStaticMarkup(<FlatmatePreferences preferences={{
    ...complete,
    acceptedFoodHabits: ["VEGAN", "VEGETARIAN"],
    acceptedSleepSchedules: ["EARLY_BIRD", "EARLY_BIRD", "EARLY_BIRD"],
    acceptedSmokingHabits: ["NON_SMOKER"],
  }} />);
  assert.match(html, /<dd[^>]*>Vegan, Vegetarian<\/dd>/);
  assert.ok(!html.includes("rounded-full"));
  assert.ok(!html.includes("<li"));
  assert.ok(html.includes("Non-smokers only"));
  assert.ok(!html.includes("Any diet"));
  assert.ok(!html.includes("Any schedule"));
});

test("editing replaces the summary while keeping the private section heading", () => {
  const html = renderToStaticMarkup(<FlatmatePreferences preferences={complete} action={<button>Edit preferences</button>}><form>Existing preference editor</form></FlatmatePreferences>);
  assert.ok(html.includes("Edit preferences"));
  assert.ok(html.includes("Existing preference editor"));
  assert.ok(html.includes("Private"));
  assert.ok(!html.includes("Any diet"));
});
