import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { safeQueryFrom } from "../../lib/discovery-filters";
import type { DiscoveryDetail } from "../../lib/matching-types";
import { BackToDiscover, DiscoveryDetailView } from "./detail-view";

const base: DiscoveryDetail = {
  publicId: "0b6f0000-0000-4000-8000-000000000000", displayName: "Neel", avatarUrl: null, age: 27, occupation: "STUDENT", bio: "Quiet evenings.",
  intent: "NEED_ROOM", city: { id: "delhi", label: "Delhi" }, compatibility: { score: 91, policy: "compatibility-v1" }, versions: { profile: 2, listing: null },
  seeking: { localities: ["Saket"], localitiesFlexible: false, rentMinPaise: 1000000, rentMaxPaise: 2000000, moveInFlexible: true, moveInEarliest: null, moveInLatest: null },
  lifestyle: { sleepSchedule: "NIGHT_OWL", cleanliness: "REGULAR", foodHabit: "VEGETARIAN", smokingHabit: "NON_SMOKER", guestFrequency: "OCCASIONALLY", bringingPet: false, workStudySchedule: "DAYTIME" },
  flat: null,
};
const flat: DiscoveryDetail["flat"] = {
  id: "f1", title: "Sunny room near Saket metro", description: "Bright two bedroom flat.", city: { label: "Delhi" }, locality: { label: "Saket" },
  bedrooms: 2, availablePlaces: 1, roomType: "PRIVATE", furnishing: "FURNISHED", monthlyRentPaise: 1500000, depositPaise: 3000000, chargesNote: "Maintenance extra",
  availableFrom: "2026-12-10", availableFlexible: false, coverPhotoId: "p2",
  photos: [{ id: "p1", category: "ROOM", url: "https://r2.test/a" }, { id: "p2", category: "ROOM", url: null }],
};
const qs = safeQueryFrom({ rentMaxPaise: "2000000", returnTo: "https://evil.test" });

test("seeker details: identity, score, habits and housing wishes; no flat section, no decisions", () => {
  const html = renderToStaticMarkup(<DiscoveryDetailView d={base} qs={qs} footer={<p>safety slot</p>} />);
  for (const t of ["Neel, 27", "91% compatible", "Need a room", "Quiet evenings.", "Night owl", "Daytime", "Looking for", "Saket", "safety slot"]) assert.ok(html.includes(t), t);
  assert.ok(!html.includes("Flat available"));
  assert.ok(!/>(Like|Pass)</.test(html), "Like and Pass stay on the Discover deck");
  assert.ok(!html.includes("aria-expanded") && !html.includes('href="#"'));
});

test("back link is a real link to Discover carrying only sanitized filters", () => {
  const html = renderToStaticMarkup(<BackToDiscover qs={qs} />);
  assert.match(html, /<a [^>]*href="\/dashboard\/discover\?rentMaxPaise=2000000"[^>]*>.*Back to Discover<\/a>/);
  assert.ok(!html.includes("evil"));
  assert.match(renderToStaticMarkup(<BackToDiscover />), /href="\/dashboard\/discover"/);
});

test("flat owner details: Published flat facts, cover photo first, failed image falls back locally", () => {
  const html = renderToStaticMarkup(<DiscoveryDetailView d={{ ...base, intent: "HAVE_ROOM", seeking: undefined, flat }} qs="" />);
  for (const t of ["Flat available", "Sunny room near Saket metro", "₹15,000", "Private room", "Furnished", "Maintenance extra", "Bright two bedroom flat.", "Photo unavailable"]) assert.ok(html.includes(t), t);
  assert.ok(!html.includes("Looking for"));
  assert.ok(html.indexOf("Photo unavailable") < html.indexOf('<img src="https://r2.test/a"'), "cover photo is listed first");
  assert.ok(!/stagingKey|finalKey/.test(html));
});

test("scoped standalone actions no longer use plain underlined text", () => {
  const files = [
    "components/matching/deck.tsx", "components/matching/matches.tsx", "components/matching/viewer-safety.tsx", "components/listing/editor.tsx",
    "components/listing/photos.tsx", "components/dashboard/flat-photo.tsx", "components/dashboard/profile-editor.tsx", "components/onboarding/wizard.tsx",
    "app/(app)/dashboard/page.tsx", "app/(app)/profiles/[publicId]/page.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.ok(!/underline"[^>]*>\s*(Retry|Dismiss|Remove|Fix|Report or block|View details|Hide details|Matching preferences|Back to My Profile|← Dashboard|Edit )/.test(src), f);
  }
});
