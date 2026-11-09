import "dotenv/config";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { db } from "./db.js";
import { onboardingRouter } from "./onboarding.js";
import { ageOn, isAdult } from "./onboarding-rules.js";

// pure rules: 18th birthday incl. 29 Feb
assert.equal(isAdult("2008-02-29", "2026-02-28"), false);
assert.equal(isAdult("2008-02-29", "2026-03-01"), true);
assert.equal(isAdult("2008-11-10", "2026-11-09"), false);
assert.equal(isAdult("2008-11-09", "2026-11-09"), true);
assert.equal(ageOn("2000-11-10", "2026-11-09"), 25);

const app = express();
app.use("/api/onboarding", onboardingRouter((req) => req.header("x-test-user") ?? null));
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api/onboarding`;
const ids = [`test_${Date.now()}_a`, `test_${Date.now()}_b`];

const call = async (id: string | null, method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(id && { "x-test-user": id }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: (await res.json()) as any };
};

try {
  const [a, b] = ids as [string, string];
  assert.equal((await call(null, "GET", "")).status, 401);

  let s = (await call(a, "GET", "")).json;
  assert.equal(s.revision, 0);
  assert.equal(s.nextStep, "intent");
  assert.equal((await db.user.count({ where: { clerkUserId: a } })), 0, "GET must not write");

  // simultaneous first save: exactly one wins
  const race = await Promise.all([0, 1].map(() => call(a, "PATCH", "/intent", { revision: 0, housingIntent: "NEED_ROOM" })));
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call(a, "PATCH", "/intent", { revision: 0, housingIntent: "TEAM_UP" })).json.error.code, "REVISION_CONFLICT");
  assert.equal((await call(a, "PATCH", "/intent", { revision: 1, housingIntent: "BOGUS" })).status, 422);

  // other sections need a started draft
  assert.equal((await call(b, "PATCH", "/lifestyle", { revision: 0 })).status, 422);

  // under-18 rejected and not persisted
  const kid = { revision: 1, displayName: "  Kid ", birthDate: "2100-01-01", occupation: "STUDENT", photoAction: "keep" };
  assert.equal((await call(a, "PATCH", "/profile", kid)).status, 422); // future
  const today = new Date().getFullYear();
  assert.equal((await call(a, "PATCH", "/profile", { ...kid, birthDate: `${today - 10}-01-01` })).json.error.code, "AGE_RESTRICTED");
  assert.equal(await db.profile.count(), 0);

  s = (await call(a, "PATCH", "/profile", { ...kid, birthDate: "2000-05-17", bio: "   " })).json;
  assert.equal(s.revision, 2);
  assert.equal(s.profile.displayName, "Kid");
  assert.equal(s.profile.bio, null);
  assert.equal(s.nextStep, "housing");

  // stale revision
  assert.equal((await call(a, "PATCH", "/profile", { ...kid, birthDate: "2000-05-17", revision: 1 })).status, 409);

  // housing: NEED_ROOM
  const housing = {
    revision: 2, city: "Pune", preferredLocations: ["Kothrud", "Kothrud", "Baner"], locationsFlexible: false,
    monthlyRentMinPaise: 800000, monthlyRentMaxPaise: 1200000, moveInDate: null, moveInFlexible: true,
  };
  s = (await call(a, "PATCH", "/housing", housing)).json;
  assert.deepEqual(s.housing.preferredLocations, ["Kothrud", "Baner"]);
  assert.equal((await call(a, "PATCH", "/housing", { ...housing, revision: 3, preferredLocations: ["Gachibowli"] })).status, 422);
  assert.equal((await call(a, "PATCH", "/housing", { ...housing, revision: 3, moveInFlexible: false })).status, 422); // no date
  assert.equal((await call(a, "PATCH", "/housing", { ...housing, revision: 3, monthlyRentMinPaise: 2000000 })).status, 422);
  assert.equal((await call(a, "PATCH", "/housing", { ...housing, revision: 3, rogue: 1 })).status, 422);

  // finish with missing sections fails and keeps revision
  const early = await call(a, "POST", "/complete", { revision: 3, discoveryEnabled: false });
  assert.equal(early.status, 422);
  assert.equal((await call(a, "GET", "")).json.revision, 3);

  const all = ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"];
  s = (await call(a, "PATCH", "/lifestyle", {
    revision: 3, sleepSchedule: "NIGHT_OWL", cleanliness: "REGULAR", foodHabit: "VEGETARIAN",
    smokingHabit: "NON_SMOKER", bringingPet: false, guestFrequency: "RARELY",
  })).json;
  assert.equal(s.stepValidity.flatmate, false, "empty accepted lists = unanswered");
  assert.equal((await call(a, "PATCH", "/flatmate", { revision: 4, acceptedSleepSchedules: [] })).status, 422);
  s = (await call(a, "PATCH", "/flatmate", {
    revision: 4, acceptedSleepSchedules: all, acceptedCleanlinessLevels: ["REGULAR", "VERY_TIDY"],
    acceptedFoodHabits: ["VEGETARIAN", "VEGAN"], acceptedSmokingHabits: ["NON_SMOKER"],
    flatmatePetPreference: "NO_PREFERENCE", acceptedGuestFrequencies: ["RARELY", "OCCASIONALLY"],
  })).json;
  assert.equal(s.nextStep, "review");

  // intent change clears housing
  s = (await call(a, "PATCH", "/intent", { revision: 5, housingIntent: "HAVE_ROOM" })).json;
  assert.equal(s.nextStep, "housing");
  assert.equal(s.housing, null);
  s = (await call(a, "PATCH", "/housing", {
    ...housing, revision: 6, preferredLocations: ["Baner"], monthlyRentMaxPaise: 800000,
  })).json;
  assert.equal(s.nextStep, "review");

  // finish: atomic + idempotent, then locked
  const done = await call(a, "POST", "/complete", { revision: 7, discoveryEnabled: true });
  assert.equal(done.status, 200);
  assert.ok(done.json.onboardingCompletedAt);
  const again = await call(a, "POST", "/complete", { revision: 7, discoveryEnabled: false });
  assert.equal(again.json.onboardingCompletedAt, done.json.onboardingCompletedAt);
  assert.equal(again.json.discoveryEnabled, true);
  assert.equal((await call(a, "PATCH", "/intent", { revision: 8, housingIntent: "TEAM_UP" })).json.error.code, "ONBOARDING_ALREADY_COMPLETE");

  // cross-account isolation
  assert.equal((await call(b, "GET", "")).json.profile, null);
  console.log("onboarding checks passed");
} finally {
  await db.user.deleteMany({ where: { clerkUserId: { in: ids } } });
  server.close();
  await db.$disconnect();
}
