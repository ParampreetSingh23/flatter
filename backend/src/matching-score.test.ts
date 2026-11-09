import assert from "node:assert/strict";
import { combine, display, evaluate, type Flat, type Person, WEIGHTS } from "./matching-score.js";

const today = "2026-11-09";
const person = (o: Partial<Person> = {}): Person => ({
  intent: "TEAM_UP", gender: "WOMAN", cityId: "delhi", localityIds: ["delhi.saket"], localitiesFlexible: false,
  rentMinPaise: 1_000_000, rentMaxPaise: 2_000_000, moveInEarliest: "2026-12-01", moveInLatest: "2026-12-31", moveInFlexible: false,
  sleep: "NIGHT_OWL", accSleep: ["NIGHT_OWL", "EARLY_BIRD", "FLEXIBLE"],
  cleanliness: "REGULAR", accClean: ["RELAXED", "REGULAR", "VERY_TIDY"],
  food: "VEGETARIAN", accFood: ["VEGAN", "VEGETARIAN", "EGGETARIAN", "NON_VEGETARIAN"],
  smoking: "NON_SMOKER", accSmoking: ["NON_SMOKER", "OUTDOORS_ONLY"],
  guests: "OCCASIONALLY", accGuests: ["RARELY", "OCCASIONALLY", "FREQUENTLY"],
  work: "DAYTIME", accWork: ["DAYTIME", "EVENING", "NIGHT", "ROTATING", "FLEXIBLE"],
  bringingPet: false, petPref: "NO_PREFERENCE",
  accGenders: ["WOMAN", "MAN", "NON_BINARY", "PREFER_NOT_TO_SAY"], ...o,
});
const flat = (o: Partial<Flat> = {}): Flat => ({ cityId: "delhi", localityId: "delhi.saket", rentPaise: 1_500_000, availableFrom: "2026-12-10", availableFlexible: false, availablePlaces: 1, ...o });
const ok = (r: ReturnType<typeof evaluate>) => { assert.equal(r.status, "ok"); return r as Extract<typeof r, { status: "ok" }>; };
const gate = (r: ReturnType<typeof evaluate>) => (r.status === "excluded" ? r.gate : r.status);

// arithmetic: weights = 100, worked example 82.5 -> 83 (no early rounding)
assert.equal(Object.values(WEIGHTS).reduce((x, y) => x + y), 100);
const ex = combine({ B: 0.8, L: 1, C: 0.5, H: 0.75, S: 1, M: 0.9, F: 0.75, W: 1 });
assert.equal(ex, 82.5);
assert.equal(display(ex), 83);
assert.equal(display(82.4999), 82);

// identical team-up pair: perfect score, symmetric
const a = person(), b = person();
const same = ok(evaluate(a, b, { today }));
assert.equal(same.score, 100);
assert.equal(ok(evaluate(b, a, { today })).score, same.score);

// budget: overlap coefficient (partial overlap) + disjoint excluded + point budget inside
const partial = ok(evaluate(a, person({ rentMinPaise: 1_500_000, rentMaxPaise: 2_500_000 }), { today }));
assert.ok(Math.abs(partial.parts.B - 500_001 / 1_000_001) < 1e-12);
assert.equal(gate(evaluate(a, person({ rentMinPaise: 2_000_001, rentMaxPaise: 3_000_000 }), { today })), "budget");
assert.equal(ok(evaluate(a, person({ rentMinPaise: 1_500_000, rentMaxPaise: 1_500_000 }), { today })).parts.B, 1);

// location: shared city alone earns 0; flexible earns 1
assert.equal(ok(evaluate(a, person({ localityIds: ["delhi.dwarka"] }), { today })).parts.L, 0);
assert.equal(ok(evaluate(a, person({ localitiesFlexible: true, localityIds: [] }), { today })).parts.L, 1);
assert.equal(gate(evaluate(a, person({ cityId: "gurugram" }), { today })), "city");

// move-in: disjoint excluded, half overlap, exact date valid, flexible = 1
assert.equal(gate(evaluate(a, person({ moveInEarliest: "2027-02-01", moveInLatest: "2027-02-10" }), { today })), "moveIn");
assert.equal(ok(evaluate(a, person({ moveInEarliest: "2026-12-16", moveInLatest: "2027-01-15" }), { today })).parts.M, 16 / 31);
assert.equal(ok(evaluate(a, person({ moveInEarliest: "2026-12-05", moveInLatest: "2026-12-05" }), { today })).parts.M, 1);
assert.equal(ok(evaluate(a, person({ moveInFlexible: true, moveInEarliest: null, moveInLatest: null }), { today })).parts.M, 1);
// leap day boundary counts as a calendar day
assert.equal(ok(evaluate(person({ moveInEarliest: "2028-02-28", moveInLatest: "2028-03-01" }), person({ moveInEarliest: "2028-02-28", moveInLatest: "2028-03-01" }), { today })).parts.M, 1);

// missing / expired answers are "incomplete", never a zero or a guess
const miss = evaluate(a, person({ work: null }), { today });
assert.deepEqual(miss.status === "incomplete" && [miss.side, miss.missing], ["b", ["workSchedule"]]);
assert.equal(evaluate(person({ moveInLatest: "2026-11-01", moveInEarliest: "2026-10-01" }), b, { today }).status, "incomplete");
assert.equal(evaluate(person({ moveInFlexible: null }), b, { today }).status, "incomplete");

// category similarities: cleanliness adjacent .5 / opposite 0; accepted-different .75; flexible 1
const c = ok(evaluate(person({ cleanliness: "RELAXED" }), person({ cleanliness: "VERY_TIDY" }), { today }));
assert.equal(c.parts.C, 0);
assert.equal(ok(evaluate(person({ cleanliness: "RELAXED" }), person({ cleanliness: "REGULAR" }), { today })).parts.C, 0.5);
const d = ok(evaluate(person({ food: "VEGAN" }), person({ food: "NON_VEGETARIAN" }), { today }));
assert.equal(d.parts.F, 0.75);
assert.equal(ok(evaluate(person({ sleep: "FLEXIBLE" }), person({ sleep: "NIGHT_OWL" }), { today })).parts.S, 1);
assert.equal(ok(evaluate(person({ work: "ROTATING" }), person({ work: "DAYTIME" }), { today })).parts.W, 0.75);
// smoking .75 when different but accepted; H = mean(.75, guests 1, pets 1)
assert.equal(ok(evaluate(person({ smoking: "OUTDOORS_ONLY" }), person(), { today })).parts.H, (0.75 + 1 + 1) / 3);

// hard tolerance: one-sided non-acceptance in either direction excludes
const strict = person({ accFood: ["VEGETARIAN"] });
assert.equal(gate(evaluate(strict, person({ food: "NON_VEGETARIAN" }), { today })), "tolerance");
assert.equal(gate(evaluate(person({ food: "NON_VEGETARIAN" }), strict, { today })), "tolerance");
assert.equal(gate(evaluate(person({ accGenders: ["MAN"] }), person({ gender: "PREFER_NOT_TO_SAY" }), { today })), "tolerance");
// pets: bringing a pet vs NO_PETS excluded; NO_PREFERENCE accepts; owning no pet never required
assert.equal(gate(evaluate(person({ petPref: "NO_PETS" }), person({ bringingPet: true }), { today })), "tolerance");
assert.equal(ok(evaluate(person({ petPref: "OK_WITH_PETS" }), person({ bringingPet: true }), { today })).status, "ok");

// intents: same-intent room pairs excluded, team-up never mixes with room intents
assert.equal(gate(evaluate(person({ intent: "HAVE_ROOM" }), person({ intent: "HAVE_ROOM" }), { today, flat: flat() })), "intent");
assert.equal(gate(evaluate(person({ intent: "NEED_ROOM" }), person({ intent: "NEED_ROOM" }), { today })), "intent");
assert.equal(gate(evaluate(person(), person({ intent: "NEED_ROOM" }), { today })), "intent");

// room pairs use the actual flat; owner's own budget/location answers are irrelevant
const owner = person({ intent: "HAVE_ROOM", cityId: null, rentMinPaise: null, rentMaxPaise: null, localitiesFlexible: null, moveInFlexible: null, moveInEarliest: null, moveInLatest: null });
const seeker = person({ intent: "NEED_ROOM" });
const r = ok(evaluate(owner, seeker, { today, flat: flat() }));
assert.equal(r.parts.B, 1);
assert.equal(r.parts.L, 1);
assert.equal(r.parts.M, 22 / 31); // seeker window Dec 1-31; flat free from Dec 10 -> 22 of 31 days
assert.equal(ok(evaluate(seeker, owner, { today, flat: flat() })).score, r.score);
assert.equal(ok(evaluate(owner, seeker, { today, flat: flat({ availableFrom: "2026-11-20" }) })).parts.M, 1); // available before window
assert.equal(gate(evaluate(owner, seeker, { today, flat: flat({ availableFrom: "2027-01-01" }) })), "moveIn");
assert.equal(ok(evaluate(owner, seeker, { today, flat: flat({ availableFrom: "2027-01-01", availableFlexible: true }) })).parts.M, 1);
assert.equal(gate(evaluate(owner, seeker, { today, flat: flat({ rentPaise: 2_000_001 }) })), "budget");
assert.equal(evaluate(owner, seeker, { today, flat: flat({ rentPaise: 1_000_000 }) }).status, "ok"); // range is inclusive
assert.equal(ok(evaluate(owner, seeker, { today, flat: flat({ localityId: "delhi.dwarka" }) })).parts.L, 0);
assert.equal(gate(evaluate(owner, seeker, { today, flat: flat({ availablePlaces: 0 }) })), "flat");
assert.equal(gate(evaluate(owner, seeker, { today })), "flat");
assert.equal(gate(evaluate(owner, seeker, { today, flat: flat({ cityId: "gurugram" }) })), "city");

console.log("matching-score tests passed");
