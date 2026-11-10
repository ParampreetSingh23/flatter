import "dotenv/config";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { db } from "./db.js";
import { matchingRouters } from "./matching.js";
import { profileRouters } from "./profiles.js";
import type { Storage } from "./storage.js";

const storage: Storage = {
  presignPut: async (k) => `https://r2.test/put/${k}`, presignGet: async (k) => `https://r2.test/get/${k}`,
  read: async () => null, write: async () => {}, exists: async () => true, remove: async () => {},
};
const app = express();
const who = (req: express.Request) => req.header("x-test-user") ?? null;
const m = matchingRouters(who, storage);
const p = profileRouters(who, storage);
app.use("/api/profile", p.me);
app.use("/api/profiles", p.viewer);
app.use("/api/discovery", m.discovery);
app.use("/api/matches", m.matches);
app.use("/api/blocks", m.blocks);
app.use("/api/reports", m.reports);
const server = app.listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
const stamp = Date.now();
const names = ["a", "b", "c", "d", "o", "n", "x", "r1", "r2"] as const;
const ids = Object.fromEntries(names.map((n) => [n, `test_${stamp}_m${n}`])) as Record<(typeof names)[number], string>;

const call = async (id: string | null, method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(id && { "x-test-user": id }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  return { status: res.status, json: (await res.json()) as any };
};
const day = (n: number) => new Date(Date.now() + n * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
const D = (s: string) => new Date(`${s}T00:00:00Z`);

try {
  type Intent = "TEAM_UP" | "NEED_ROOM" | "HAVE_ROOM";
  const mk = async (key: (typeof names)[number], intent: Intent, name: string, o: { enrolled?: boolean; work?: boolean; city?: string } = {}) => {
    const { enrolled = true, work = true, city = "delhi" } = o;
    const u = await db.user.create({ data: { clerkUserId: ids[key], housingIntent: intent, onboardingCompletedAt: new Date(), discoveryEnabled: enrolled, matchingEnabledAt: enrolled ? new Date() : null } });
    await db.profile.create({ data: { userId: u.id, displayName: name, birthDate: D("1999-05-17"), occupation: "STUDENT", gender: "WOMAN", bio: "Hello there, I like quiet evenings." } });
    await db.housingPreference.create({
      data: { userId: u.id, city, preferredLocations: intent === "HAVE_ROOM" ? ["delhi.saket"] : ["delhi.saket", "delhi.dwarka"], locationsFlexible: false,
        monthlyRentMinPaise: intent === "HAVE_ROOM" ? 1500000 : 1000000, monthlyRentMaxPaise: intent === "HAVE_ROOM" ? 1500000 : 2000000,
        ...(intent === "HAVE_ROOM" ? { moveInFlexible: true } : { moveInDate: D(day(7)), moveInLatestDate: D(day(60)), moveInFlexible: false }) },
    });
    await db.lifestylePreference.create({
      data: { userId: u.id, sleepSchedule: "NIGHT_OWL", cleanliness: "REGULAR", foodHabit: "VEGETARIAN", smokingHabit: "NON_SMOKER", bringingPet: false, guestFrequency: "OCCASIONALLY",
        acceptedSleepSchedules: ["NIGHT_OWL", "EARLY_BIRD", "FLEXIBLE"], acceptedCleanlinessLevels: ["RELAXED", "REGULAR", "VERY_TIDY"], acceptedFoodHabits: ["VEGAN", "VEGETARIAN", "EGGETARIAN", "NON_VEGETARIAN"],
        acceptedSmokingHabits: ["NON_SMOKER"], flatmatePetPreference: "NO_PREFERENCE", acceptedGuestFrequencies: ["RARELY", "OCCASIONALLY", "FREQUENTLY"], acceptedGenders: ["WOMAN", "MAN", "NON_BINARY", "PREFER_NOT_TO_SAY"],
        ...(work && { workStudySchedule: "DAYTIME" as const, acceptedWorkStudySchedules: ["DAYTIME", "EVENING", "FLEXIBLE" as const] }) },
    });
    return u;
  };
  const pid = async (k: (typeof names)[number]) => (await db.profile.findFirstOrThrow({ where: { user: { clerkUserId: ids[k] } } })).publicId;
  const uidOf = async (k: (typeof names)[number]) => (await db.user.findUniqueOrThrow({ where: { clerkUserId: ids[k] } })).id;

  const [A, B, C, D2, O] = [await mk("a", "TEAM_UP", "Anu"), await mk("b", "TEAM_UP", "Bina"), await mk("c", "TEAM_UP", "Chi"), await mk("d", "TEAM_UP", "Dev"), await mk("o", "HAVE_ROOM", "Olu")];
  await mk("n", "NEED_ROOM", "Neel");
  await mk("x", "TEAM_UP", "Xan", { enrolled: false });
  await mk("r1", "TEAM_UP", "Rhea", { work: false }); // enrolled but missing the new schedule answer
  const [pa, pb, pc, pd, po, pn] = await Promise.all((["a", "b", "c", "d", "o", "n"] as const).map(pid));
  const cards = async (k: (typeof names)[number], qs = "") => (await call(ids[k], "GET", `/discovery${qs}`)).json;
  const act = (k: (typeof names)[number], publicId: string, kind: "LIKE" | "PASS", extra: object = {}) => call(ids[k], "POST", "/discovery/actions", { publicId, kind, ...extra });

  // --- readiness / enrollment ---
  assert.equal((await call(null, "GET", "/discovery")).status, 401);
  assert.equal((await call(ids.x, "GET", "/discovery")).json.error.code, "NOT_ENROLLED");
  const nr = await call(ids.r1, "GET", "/discovery");
  assert.equal(nr.json.error.code, "MATCHING_NOT_READY");
  assert.ok(nr.json.error.fields.workSchedule);
  // matching-preferences PATCH: validation, version lock, enrollment
  const me1 = (await call(ids.r1, "GET", "/profile/me")).json;
  assert.equal(me1.matching.ready, false);
  const mp = { version: me1.version, workStudySchedule: "DAYTIME", acceptedWorkStudySchedules: ["DAYTIME", "FLEXIBLE"], moveInFlexible: false, moveInDate: day(7), moveInLatestDate: day(60), enrolled: true };
  assert.equal((await call(ids.r1, "PATCH", "/profile/me/matching", { ...mp, acceptedWorkStudySchedules: [] })).status, 422);
  assert.equal((await call(ids.r1, "PATCH", "/profile/me/matching", { ...mp, moveInLatestDate: day(1) })).status, 422, "latest before earliest");
  assert.equal((await call(ids.r1, "PATCH", "/profile/me/matching", { ...mp, moveInFlexible: true })).status, 422, "flexible with dates");
  assert.equal((await call(ids.r1, "PATCH", "/profile/me/matching", { ...mp, onboardingCompletedAt: null })).status, 422, "strict");
  assert.equal((await call(ids.r1, "PATCH", "/profile/me/matching", { ...mp, version: 99 })).json.error.code, "VERSION_CONFLICT");
  const saved = await call(ids.r1, "PATCH", "/profile/me/matching", mp);
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.matching.ready, true);
  assert.equal(saved.json.housing.moveInLatestDate, day(60));
  assert.equal((await call(ids.r1, "PATCH", "/profile/me/matching", mp)).status, 409, "stale tab");
  assert.equal((await db.user.findUniqueOrThrow({ where: { clerkUserId: ids.r1 } })).onboardingCompletedAt != null, true);
  // editing the earliest date through housing clears the confirmed window (re-confirm needed)
  const hv = (await call(ids.r1, "GET", "/profile/me")).json;
  await call(ids.r1, "PATCH", "/profile/me/housing", { version: hv.version, city: "delhi", preferredLocations: ["delhi.saket"], locationsFlexible: false, monthlyRentMinPaise: 1000000, monthlyRentMaxPaise: 2000000, moveInDate: day(9), moveInFlexible: false });
  assert.equal((await call(ids.r1, "GET", "/profile/me")).json.matching.ready, false);

  // --- discovery: eligibility, privacy, ranking ---
  let d = await cards("a");
  assert.equal(d.policy, "compatibility-v1");
  assert.deepEqual(d.cards.map((c: any) => c.publicId).sort(), [pb, pc, pd].sort(), "only enrolled, ready, same-intent, same-city people");
  assert.equal(d.cards[0].compatibility.score, 100);
  const s = JSON.stringify(d);
  for (const leak of ["birthDate", "clerk", "accepted", "stagingKey", "x-test"]) assert.equal(s.includes(leak), false, leak);
  assert.equal(d.cards.some((c: any) => c.publicId === pa), false, "never self");
  assert.equal((await cards("a", "?localities=gurugram.sector-29")).status, undefined);
  assert.equal((await call(ids.a, "GET", "/discovery?localities=gurugram.sector-29")).status, 422);
  assert.equal((await call(ids.a, "GET", "/discovery?rentMinPaise=500&rentMaxPaise=600")).status, 422, "outside saved budget");
  assert.equal((await call(ids.a, "GET", "/discovery?bogus=1")).status, 422);
  assert.equal((await cards("a", "?localities=delhi.dwarka")).cards.length, 3);
  assert.equal((await cards("a", `?moveInFrom=${day(300)}&moveInTo=${day(310)}`)).status, undefined);
  // room pairs
  const n = await cards("n");
  assert.deepEqual(n.cards, [], "owner has no published flat yet");
  await db.flatListing.create({ data: { ownerId: O.id, status: "PUBLISHED", title: "Sunny room near Saket metro", description: "x".repeat(40), cityId: "delhi", localityId: "delhi.saket", bedrooms: 2, availablePlaces: 1, roomType: "PRIVATE", furnishing: "FURNISHED", monthlyRentPaise: 1500000, depositPaise: 3000000, chargesNote: "n", availableFrom: D(day(20)), availableFlexible: false, publishedAt: new Date() } });
  const nn = await cards("n");
  assert.deepEqual(nn.cards.map((c: any) => c.publicId), [po]);
  assert.equal(nn.cards[0].flat.rentPaise, 1500000);
  assert.deepEqual((await cards("o")).cards.map((c: any) => c.publicId), [pn], "owner sees seekers");
  assert.equal((await call(ids.n, "GET", `/discovery/${po}`)).json.flat.title, "Sunny room near Saket metro");
  assert.equal((await call(ids.n, "GET", `/discovery/${pb}`)).status, 404, "detail uses the same eligibility");
  await db.flatListing.update({ where: { ownerId: O.id }, data: { status: "PAUSED" } });
  assert.deepEqual((await cards("n")).cards, [], "paused flat leaves discovery");
  assert.equal((await act("n", po, "LIKE")).status, 404, "Like revalidates the flat");
  assert.equal((await act("n", po, "PASS")).status, 200, "dismissing an unavailable card still works");

  // --- decisions ---
  assert.equal((await call(ids.a, "POST", "/discovery/actions", { publicId: pb, kind: "MAYBE" })).status, 422);
  assert.equal((await act("a", pa, "LIKE")).status, 404, "no self-like");
  assert.equal((await act("a", pb, "LIKE", { profileVersion: 999 })).json.error.code, "STALE_CANDIDATE");
  const like1 = await act("a", pb, "LIKE");
  assert.deepEqual(like1.json, { kind: "LIKE", matched: false });
  assert.deepEqual((await act("a", pb, "LIKE")).json, like1.json, "repeat is idempotent");
  assert.equal((await act("a", pb, "PASS")).json.error.code, "DECISION_CONFLICT");
  assert.equal((await db.match.count({ where: { userLowId: { in: [A.id, B.id] }, userHighId: { in: [A.id, B.id] } } })), 0, "one-way Like is not a match");
  assert.equal((await cards("a")).cards.some((c: any) => c.publicId === pb), false, "decided people leave the feed");
  assert.equal((await call(ids.a, "GET", "/matches")).json.matches.length, 0);
  const mutual = await act("b", pa, "LIKE");
  assert.equal(mutual.json.matched, true);
  assert.deepEqual((await act("b", pa, "LIKE")).json, mutual.json, "idempotent after match");
  const ml = (await call(ids.a, "GET", "/matches")).json.matches;
  assert.equal(ml.length, 1);
  assert.equal(ml[0].person.publicId, pb);
  assert.equal(ml[0].chat.available, true);
  assert.equal(JSON.stringify(ml).includes("birthDate"), false);
  const row = await db.match.findUniqueOrThrow({ where: { id: mutual.json.matchId } });
  assert.ok(row.userLowId < row.userHighId);
  assert.deepEqual([row.scoreAtMatch, row.scorePolicy], [100, "compatibility-v1"]);
  assert.equal((await cards("b")).cards.some((c: any) => c.publicId === pa), false, "matched pair leaves discovery");

  // simultaneous reciprocal Likes -> exactly one match
  const [r1, r2] = await Promise.all([act("c", pd, "LIKE"), act("d", pc, "LIKE")]);
  assert.equal([r1, r2].filter((r) => r.json.matched).length >= 1, true);
  assert.equal(await db.match.count({ where: { userLowId: { in: [C.id, D2.id] }, userHighId: { in: [C.id, D2.id] } } }), 1);

  // --- unmatch ---
  assert.equal((await call(ids.c, "POST", `/matches/${mutual.json.matchId}/unmatch`)).status, 404, "non-member");
  assert.equal((await call(ids.a, "POST", `/matches/${mutual.json.matchId}/unmatch`)).status, 200);
  assert.equal((await call(ids.a, "POST", `/matches/${mutual.json.matchId}/unmatch`)).status, 200, "repeat is harmless");
  assert.equal((await call(ids.b, "GET", "/matches")).json.matches.length, 0);
  assert.equal((await act("a", pb, "LIKE")).status, 404, "an ended pair can't be recreated by a stale Like");
  assert.equal((await cards("a")).cards.some((c: any) => c.publicId === pb), false);
  assert.equal(((await db.match.findUniqueOrThrow({ where: { id: mutual.json.matchId } })).endReason), "UNMATCH");

  // --- block: symmetric, ends match, hides profile, unblock restores nothing ---
  const mm = (await act("c", pd, "LIKE")).json; // c<->d are matched
  assert.equal(mm.matched, true);
  assert.equal((await call(ids.c, "POST", "/blocks", { publicId: "nope" })).status, 422);
  assert.equal((await call(ids.c, "POST", "/blocks", { publicId: pd })).status, 200);
  assert.equal((await call(ids.c, "POST", "/blocks", { publicId: pd })).status, 200, "idempotent");
  assert.equal((await call(ids.d, "GET", "/matches")).json.matches.length, 0, "match ended for both");
  assert.equal((await call(ids.d, "GET", `/profiles/${pc}`)).status, 404, "blocked viewer can't read the profile");
  assert.equal((await call(ids.c, "GET", `/profiles/${pd}`)).status, 404, "blocker can't either");
  assert.equal((await call(ids.d, "GET", `/discovery/${pc}`)).status, 404);
  assert.equal((await cards("d")).cards.some((c: any) => c.publicId === pc), false);
  assert.equal((await act("d", pc, "LIKE")).status, 404);
  assert.equal((await call(ids.c, "GET", "/blocks")).json.blocks.length, 1);
  assert.equal((await call(ids.c, "DELETE", `/blocks/${pd}`)).status, 200);
  assert.equal((await call(ids.c, "GET", "/blocks")).json.blocks.length, 0);
  assert.equal((await call(ids.d, "GET", "/matches")).json.matches.length, 0, "unblock never restores a match");
  assert.equal((await cards("d")).cards.some((c: any) => c.publicId === pc), false, "blocked history keeps them out of discovery");
  assert.equal((await act("d", pc, "LIKE")).status, 404);

  // race: A likes (already) ... block vs reciprocal Like at the same time leaves no active match
  await db.discoveryAction.deleteMany({ where: { actorId: await uidOf("n") } }); // forget the earlier Pass (Undo Pass is P2)
  await db.flatListing.update({ where: { ownerId: O.id }, data: { status: "PUBLISHED" } });
  assert.equal((await act("n", po, "LIKE")).json.matched, false);
  await Promise.all([act("o", pn, "LIKE"), call(ids.n, "POST", "/blocks", { publicId: po })]);
  const raceMatches = await db.match.findMany({ where: { OR: [{ userLowId: O.id }, { userHighId: O.id }] } });
  assert.equal(raceMatches.filter((x) => !x.endedAt).length, 0, "block wins: no active match survives");
  assert.equal((await call(ids.o, "GET", "/matches")).json.matches.length, 0);

  // --- reports ---
  const rep = (k: (typeof names)[number], body: object) => call(ids[k], "POST", "/reports", body);
  assert.equal((await rep("a", { publicId: pb, reason: "SPAM" })).status, 422);
  assert.equal((await rep("a", { publicId: pb, reason: "SCAM", details: "x".repeat(1001) })).status, 422);
  const ok = await rep("a", { publicId: pb, reason: "FAKE_PROFILE", details: "  looks fake  ", matchId: mutual.json.matchId });
  assert.deepEqual(ok.json, { ok: true });
  assert.equal((await rep("a", { publicId: pb, reason: "SCAM", matchId: "11111111-1111-1111-1111-111111111111" })).status, 422, "match must be shared");
  assert.equal((await rep("a", { publicId: pd, reason: "SCAM", listingId: "11111111-1111-1111-1111-111111111111" })).status, 422, "listing must belong to the target");
  const ghost = await rep("a", { publicId: "00000000-0000-4000-8000-000000000000", reason: "SCAM" });
  assert.deepEqual(ghost.json, ok.json, "unknown target gets the same acknowledgement");
  const saved1 = await db.userReport.findFirstOrThrow({ where: { reporterId: A.id, targetId: B.id } });
  assert.equal(saved1.details, "looks fake");
  assert.equal(saved1.status, "OPEN");
  assert.equal(JSON.stringify(saved1.snapshot).includes("birth"), false);
  assert.equal(await db.userReport.count({ where: { reporterId: A.id } }), 1);
  await rep("a", { publicId: pd, reason: "HARASSMENT", alsoBlock: true });
  assert.equal((await call(ids.a, "GET", "/blocks")).json.blocks.length, 1, "report + block option");

  console.log("matching checks passed");
} finally {
  const users = await db.user.findMany({ where: { clerkUserId: { in: Object.values(ids) } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  await db.flatListing.deleteMany({ where: { ownerId: { in: uids } } });
  await db.user.deleteMany({ where: { id: { in: uids } } });
  server.close();
  await db.$disconnect();
}
