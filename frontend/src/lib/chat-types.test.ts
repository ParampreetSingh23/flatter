import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CODEPOINTS, normalizeBody } from "./chat-types";

test("trims surrounding whitespace, keeps internal newlines and Unicode", () => {
  const r = normalizeBody("  hi 👋🏽\nनमस्ते  ");
  assert.deepEqual(r, { ok: true, body: "hi 👋🏽\nनमस्ते" });
});

test("blank, NUL, lone surrogate and oversized messages are rejected like the server does", () => {
  for (const bad of ["", " \n\t ", "a\u0000b", "\ud800", "x".repeat(MAX_CODEPOINTS + 1)]) assert.equal(normalizeBody(bad).ok, false, JSON.stringify(bad).slice(0, 12));
  assert.equal(normalizeBody("😀".repeat(MAX_CODEPOINTS)).ok, true, "2000 four-byte characters fit both caps");
  assert.equal(normalizeBody("x".repeat(MAX_CODEPOINTS)).ok, true);
});

test("HTML is just text: nothing is stripped or interpreted", () => {
  assert.deepEqual(normalizeBody("<img src=x onerror=alert(1)>"), { ok: true, body: "<img src=x onerror=alert(1)>" });
});
