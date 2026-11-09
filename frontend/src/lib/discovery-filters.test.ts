import assert from "node:assert/strict";
import { test } from "node:test";
import { detailHref, discoverHref, filtersFromQuery, safeQuery, safeQueryFrom, toQuery } from "./discovery-filters";

const from = (qs: string) => { const q = new URLSearchParams(qs); return safeQuery((k) => q.get(k)); };

test("allowlisted filters round-trip through the URL", () => {
  const qs = toQuery({ localities: ["delhi.saket", "delhi.dwarka"], rentMin: "10000", rentMax: "20000.50", from: "2026-12-01", to: "2027-01-31" });
  assert.equal(qs, "?localities=delhi.saket%2Cdelhi.dwarka&rentMinPaise=1000000&rentMaxPaise=2000050&moveInFrom=2026-12-01&moveInTo=2027-01-31");
  assert.deepEqual(filtersFromQuery(qs), { localities: ["delhi.saket", "delhi.dwarka"], rentMin: "10000", rentMax: "20000.50", from: "2026-12-01", to: "2027-01-31" });
  assert.equal(from(qs), qs);
});

test("unknown, external and malformed values are dropped", () => {
  assert.equal(from("returnTo=https://evil.test&publicId=x&next=/admin"), "");
  assert.equal(from("localities=delhi.saket,<script>,,delhi.saket&rentMinPaise=abc&rentMaxPaise=99999999999&moveInFrom=tomorrow"), "?localities=delhi.saket");
  assert.equal(safeQueryFrom({ moveInTo: ["2027-01-01", "2028-02-02"], returnTo: "//evil" }), "?moveInTo=2027-01-01");
  assert.equal(toQuery({ localities: [], rentMin: "abc", rentMax: "", from: "", to: "" }), "");
});

test("detail and back links carry only the sanitized filter context", () => {
  const qs = from("rentMaxPaise=2000000&returnTo=//evil");
  assert.equal(detailHref("0b6f0000-0000-4000-8000-000000000000", qs), "/dashboard/discover/0b6f0000-0000-4000-8000-000000000000?rentMaxPaise=2000000");
  assert.equal(discoverHref(qs), "/dashboard/discover?rentMaxPaise=2000000");
  assert.equal(discoverHref(), "/dashboard/discover");
  assert.equal(detailHref("a/b"), "/dashboard/discover/a%2Fb");
});
