import "dotenv/config";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { db } from "./db.js";
import { profileRouters } from "./profiles.js";
import type { Storage } from "./storage.js";

const storage: Storage = {
  presignPut: async (k) => `https://r2.test/put/${k}`,
  presignGet: async (k) => `https://r2.test/get/${k}?ttl=60`,
  read: async () => null, write: async () => {}, exists: async () => true, remove: async () => {},
};
const app = express();
const who = (req: express.Request) => req.header("x-test-user") ?? null;
const r = profileRouters(who, storage);
app.use("/api/dashboard", r.dashboard);
app.use("/api/profile", r.me);
app.use("/api/profiles", r.viewer);
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
const stamp = Date.now();
const ids = { owner: `test_${stamp}_o`, seeker: `test_${stamp}_s`, team: `test_${stamp}_t`, fresh: `test_${stamp}_f`, broken: `test_${stamp}_b` };

const call = async (id: string | null, method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(id && { "x-test-user": id }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: (await res.json()) as any, headers: res.headers };
};

try {
  const mk = async (clerkUserId: string, intent: "HAVE_ROOM" | "NEED_ROOM" | "TEAM_UP" | null, done: boolean, name: string | null, gender: "WOMAN" | "PREFER_NOT_TO_SAY" = "WOMAN") => {
    const u = await db.user.create({ data: { clerkUserId, housingIntent: intent, onboardingCompletedAt: done ? new Date() : null } });
    if (name) {
      await db.profile.create({ data: { userId: u.id, displayName: name, birthDate: new Date("2000-05-17T00:00:00Z"), occupation: "STUDENT", gender, bio: "Hello there" } });
      await db.housingPreference.create({
        data: { userId: u.id, city: "delhi", preferredLocations: ["delhi.saket", "delhi.dwarka"], locationsFlexible: false, monthlyRentMinPaise: 800000, monthlyRentMaxPaise: 1200000, moveInFlexible: true },
      });
      await db.lifestylePreference.create({
        data: { userId: u.id, sleepSchedule: "NIGHT_OWL", cleanliness: "REGULAR", foodHabit: "VEGETARIAN", smokingHabit: "NON_SMOKER", bringingPet: false, guestFrequency: "RARELY", acceptedSleepSchedules: ["NIGHT_OWL"], acceptedCleanlinessLevels: ["REGULAR"], acceptedFoodHabits: ["VEGAN"], acceptedSmokingHabits: ["NON_SMOKER"], flatmatePetPreference: "NO_PREFERENCE", acceptedGuestFrequencies: ["RARELY"], acceptedGenders: ["WOMAN"] },
      });
    }
    return u;
  };
  const owner = await mk(ids.owner, "HAVE_ROOM", true, "Asha", "PREFER_NOT_TO_SAY");
  const seeker = await mk(ids.seeker, "NEED_ROOM", true, "Ravi");
  await mk(ids.team, "TEAM_UP", true, "Tina");
  await mk(ids.fresh, null, false, null);
  await mk(ids.broken, "NEED_ROOM", true, null); // completed but profile row missing: corrupt (DB already forbids a missing intent)

  const pid = async (id: string) => (await db.profile.findFirstOrThrow({ where: { user: { clerkUserId: id } } })).publicId;
  const [ownerPid, seekerPid] = [await pid(ids.owner), await pid(ids.seeker)];

  // --- dashboard: auth, completion, corrupt data, per-intent, listing states ---
  assert.equal((await call(null, "GET", "/dashboard")).status, 401);
  assert.equal((await call(ids.fresh, "GET", "/dashboard")).json.error.code, "NOT_ELIGIBLE");
  assert.equal((await call(ids.broken, "GET", "/dashboard")).json.error.code, "PROFILE_INCOMPLETE");
  let d = (await call(ids.owner, "GET", "/dashboard")).json;
  assert.equal(d.intent, "HAVE_ROOM");
  assert.equal(d.listing, null);
  assert.equal(d.listingError, false);
  assert.equal(await db.flatListing.count({ where: { ownerId: owner.id } }), 0, "GET must not create a listing");
  assert.equal(d.features.matches, "available");
  assert.equal(d.housing.city.label, "Delhi");
  assert.deepEqual(d.housing.localities.map((l: any) => l.label), ["Saket", "Dwarka"]);
  assert.equal(JSON.stringify(d).includes("clerk"), false);
  d = (await call(ids.team, "GET", "/dashboard")).json;
  assert.equal(d.intent, "TEAM_UP");
  assert.equal(d.listing, null);
  assert.equal((await call(ids.seeker, "GET", "/dashboard")).headers.get("cache-control"), "no-store");

  await db.flatListing.create({ data: { ownerId: owner.id } });
  d = (await call(ids.owner, "GET", "/dashboard")).json;
  assert.equal(d.listing.status, "DRAFT");
  assert.ok(d.listing.missing.length > 0);

  // --- my profile ---
  let me = (await call(ids.owner, "GET", "/profile/me")).json;
  assert.equal(me.version, 0);
  assert.equal(me.profile.age >= 25, true);
  assert.equal(me.profile.birthDate, undefined, "DOB is never returned");
  assert.equal(me.publicId, ownerPid);
  assert.ok(me.flatmate.acceptedGenders);
  assert.equal((await call(ids.seeker, "GET", "/profile/me")).json.listing, undefined, "non-owners have no listing section");
  const patch = (body: object, id = ids.owner) => call(id, "PATCH", "/profile/me", body);
  assert.equal((await patch({ displayName: "New" })).status, 422, "version required");
  for (const bad of [{ displayName: "   " }, { displayName: "x".repeat(81) }, { gender: "ROBOT" }, { occupation: "KING" }, { bio: "x".repeat(501) },
    { housingIntent: "NEED_ROOM" }, { onboardingCompletedAt: null }, { birthDate: "1990-01-01" }, { discoveryEnabled: "yes" }, { ownerId: "x" }, { listing: {} }]) {
    assert.equal((await patch({ version: 0, ...bad })).status, 422, JSON.stringify(bad));
  }
  assert.equal((await patch({ version: 5, displayName: "Stale" })).json.error.code, "VERSION_CONFLICT");
  const before = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  me = (await patch({ version: 0, displayName: "  Asha K ", occupation: "WORKING_PROFESSIONAL", gender: "MAN", bio: "   ", discoveryEnabled: true })).json;
  assert.equal(me.version, 1);
  assert.deepEqual([me.profile.displayName, me.profile.occupation, me.profile.gender, me.profile.bio, me.discoveryEnabled], ["Asha K", "WORKING_PROFESSIONAL", "MAN", null, true]);
  assert.equal((await patch({ version: 0, displayName: "Again" })).status, 409, "stale tab can't overwrite");
  me = (await patch({ version: 1, photoAction: "clear" })).json;
  assert.equal(me.profile.avatarUrl, null);
  const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(after.onboardingCompletedAt?.getTime(), before.onboardingCompletedAt?.getTime(), "completion untouched");
  assert.equal(after.housingIntent, "HAVE_ROOM");
  assert.equal(after.onboardingRevision, before.onboardingRevision);
  assert.equal(await db.housingPreference.count({ where: { userId: owner.id, city: "delhi" } }), 1);
  assert.equal((await db.flatListing.findUniqueOrThrow({ where: { ownerId: owner.id } })).version, 0, "listing untouched");

  // --- editing housing / lifestyle / flatmate preferences after onboarding ---
  const section = (path: string, body: object, id = ids.owner) => call(id, "PATCH", `/profile/me/${path}`, body);
  const v0 = (await call(ids.owner, "GET", "/profile/me")).json.version;
  const have = { city: "delhi", preferredLocations: ["delhi.hauz-khas"], locationsFlexible: false, monthlyRentMinPaise: 2000000, monthlyRentMaxPaise: 2000000, moveInDate: null, moveInFlexible: true };
  assert.equal((await section("housing", have)).status, 422, "version required");
  assert.equal((await section("housing", { ...have, version: v0, preferredLocations: ["delhi.hauz-khas", "delhi.saket"], monthlyRentMaxPaise: 2500000 })).status, 422, "HAVE_ROOM: one locality, one rent");
  assert.equal((await section("housing", { ...have, version: v0, preferredLocations: ["noida.sector-62"] })).status, 422, "locality of another city");
  assert.equal((await section("housing", { ...have, version: v0, city: "Pune" })).status, 422);
  assert.equal((await section("housing", { ...have, version: v0, onboardingCompletedAt: null })).status, 422, "no mass assignment");
  assert.equal((await section("housing", { ...have, version: v0 + 9 })).status, 409);
  let m = (await section("housing", { ...have, version: v0 })).json;
  assert.equal(m.version, v0 + 1);
  assert.deepEqual(m.housing.localities.map((x: any) => x.label), ["Hauz Khas"]);
  assert.equal(m.housing.rentMinPaise, 2000000);
  assert.equal((await section("housing", { ...have, version: v0 })).status, 409, "stale tab");
  const life = { sleepSchedule: "EARLY_BIRD", cleanliness: "VERY_TIDY", foodHabit: "VEGAN", smokingHabit: "NON_SMOKER", bringingPet: true, guestFrequency: "FREQUENTLY" };
  assert.equal((await section("lifestyle", { ...life, version: m.version, cleanliness: "MESSY" })).status, 422);
  assert.equal((await section("lifestyle", { ...life, version: m.version, acceptedFoodHabits: ["VEGAN"] })).status, 422, "accepted lists are a separate section");
  m = (await section("lifestyle", { ...life, version: m.version })).json;
  assert.deepEqual([m.lifestyle.sleepSchedule, m.lifestyle.bringingPet], ["EARLY_BIRD", true]);
  assert.deepEqual(m.flatmate.acceptedGenders, ["WOMAN"], "lifestyle edit keeps accepted preferences");
  const fm = { acceptedSleepSchedules: ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"], acceptedCleanlinessLevels: ["REGULAR"], acceptedFoodHabits: ["VEGAN", "VEGETARIAN"], acceptedSmokingHabits: ["NON_SMOKER"], flatmatePetPreference: "OK_WITH_PETS", acceptedGuestFrequencies: ["RARELY"], acceptedGenders: ["WOMAN", "NON_BINARY"] };
  assert.equal((await section("flatmate", { ...fm, version: m.version, acceptedGenders: [] })).status, 422, "empty = unanswered");
  m = (await section("flatmate", { ...fm, version: m.version })).json;
  assert.deepEqual(m.flatmate.acceptedGenders, ["WOMAN", "NON_BINARY"]);
  assert.equal(m.lifestyle.sleepSchedule, "EARLY_BIRD", "flatmate edit keeps own habits");
  // seeker (range rent, many localities, anywhere) uses the same endpoint
  const seekerV = (await call(ids.seeker, "GET", "/profile/me")).json.version;
  const seekerHousing = { city: "gurugram", preferredLocations: [], locationsFlexible: true, monthlyRentMinPaise: 800000, monthlyRentMaxPaise: 1200000, moveInDate: "2099-01-01", moveInFlexible: false };
  const sk = await section("housing", { ...seekerHousing, version: seekerV }, ids.seeker);
  assert.equal(sk.status, 200, JSON.stringify(sk.json));
  assert.deepEqual([sk.json.housing.locationsFlexible, sk.json.housing.city.label, sk.json.housing.moveInDate], [true, "Gurugram", "2099-01-01"]);
  assert.equal((await section("housing", { ...seekerHousing, version: sk.json.version, moveInDate: "2020-01-01" }, ids.seeker)).status, 422, "past move-in date");
  const afterEdits = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(afterEdits.onboardingCompletedAt?.getTime(), before.onboardingCompletedAt?.getTime(), "completion untouched by preference edits");
  assert.equal(afterEdits.housingIntent, "HAVE_ROOM");
  assert.equal((await db.flatListing.findUniqueOrThrow({ where: { ownerId: owner.id } })).version, 0, "listing untouched");
  assert.equal((await call(null, "PATCH", "/profile/me/housing", {})).status, 401);

  const curV = async () => (await call(ids.owner, "GET", "/profile/me")).json.version as number;

  // --- viewer matrix ---
  const view = (who: string | null, publicId: string) => call(who, "GET", `/profiles/${publicId}`);
  assert.equal((await view(null, ownerPid)).status, 401);
  assert.equal((await view(ids.fresh, ownerPid)).json.error.code, "NOT_ELIGIBLE");
  assert.equal((await view(ids.seeker, "not-a-uuid")).status, 404);
  assert.equal((await view(ids.seeker, "00000000-0000-4000-8000-000000000000")).status, 404);

  // discovery on, draft flat: safe personal profile, no flat, nothing private
  let v = await view(ids.seeker, ownerPid);
  assert.equal(v.status, 200);
  assert.equal(v.json.flat, null, "draft never leaks");
  assert.equal(v.json.profile.occupation, "WORKING_PROFESSIONAL");
  assert.equal(v.json.profile.gender, "MAN");
  const text = JSON.stringify(v.json);
  for (const secret of ["birthDate", "2000-05-17", "clerk", ids.owner, "accepted", "preferredLocations", "localities", "monthlyRent", "rentM", "onboarding", owner.id]) {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal(v.json.city.label, "Delhi");
  assert.equal(v.json.lifestyle.sleepSchedule, "EARLY_BIRD", "viewer sees the edited habit");

  // discovery off, nothing published: hidden from others, visible to owner with a note
  await patch({ version: await curV(), discoveryEnabled: false });
  assert.equal((await view(ids.seeker, ownerPid)).status, 404);
  v = await view(ids.owner, ownerPid);
  assert.equal(v.status, 200);
  assert.ok(v.json.ownerNote);

  // published flat + discovery off: minimal publisher view only
  await db.flatListing.update({
    where: { ownerId: owner.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), title: "Sunny room near Saket metro", cityId: "delhi", localityId: "delhi.saket", monthlyRentPaise: 1500000 },
  });
  v = await view(ids.seeker, ownerPid);
  assert.equal(v.status, 200);
  assert.deepEqual(Object.keys(v.json.profile).sort(), ["avatarUrl", "displayName"]);
  assert.equal(v.json.flat.title, "Sunny room near Saket metro");
  assert.equal(v.json.flat.locality.label, "Saket");
  assert.equal(v.json.lifestyle, undefined);
  assert.equal(v.json.intent, undefined);
  assert.equal(v.json.ownerNote, undefined);

  // dashboard reflects the real state; viewer sees it after discovery on too
  assert.equal((await call(ids.owner, "GET", "/dashboard")).json.listing.status, "PUBLISHED");
  await patch({ version: await curV(), discoveryEnabled: true });
  v = await view(ids.seeker, ownerPid);
  assert.equal(v.json.profile.occupation, "WORKING_PROFESSIONAL");
  assert.equal(v.json.flat.title, "Sunny room near Saket metro");

  // paused/closed flats disappear; owner then hidden again (discovery off)
  await db.flatListing.update({ where: { ownerId: owner.id }, data: { status: "PAUSED" } });
  assert.equal((await view(ids.seeker, ownerPid)).json.flat, null);
  await patch({ version: await curV(), discoveryEnabled: false });
  assert.equal((await view(ids.seeker, ownerPid)).status, 404);
  await db.flatListing.update({ where: { ownerId: owner.id }, data: { status: "CLOSED" } });
  assert.equal((await view(ids.seeker, ownerPid)).status, 404);

  // a published flat only counts for HAVE_ROOM owners that are still complete
  await db.flatListing.update({ where: { ownerId: owner.id }, data: { status: "PUBLISHED" } });
  await db.user.update({ where: { id: owner.id }, data: { onboardingCompletedAt: null } });
  assert.equal((await view(ids.seeker, ownerPid)).status, 404, "ineligible owner");
  await db.user.update({ where: { id: owner.id }, data: { onboardingCompletedAt: new Date() } });

  // seeker views own profile (preview) and cannot read others' private state
  assert.equal((await view(ids.seeker, seekerPid)).status, 200);
  assert.equal((await view(ids.owner, seekerPid)).status, 404, "seeker has discovery off");

  console.log("profile checks passed");
} finally {
  const users = await db.user.findMany({ where: { clerkUserId: { in: Object.values(ids) } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  await db.flatPhoto.deleteMany({ where: { listing: { ownerId: { in: uids } } } });
  await db.flatListing.deleteMany({ where: { ownerId: { in: uids } } });
  await db.user.deleteMany({ where: { id: { in: uids } } });
  server.close();
  await db.$disconnect();
}
