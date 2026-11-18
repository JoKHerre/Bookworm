import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanIsbn,
  hasIsbnShape,
  hasValidIsbnChecksum,
} from "../../shared/isbn.ts";

test("REF-01-T-2 cleanIsbn keeps digits and an uppercase X", () => {
  assert.equal(cleanIsbn(" 0-306-40615-x "), "030640615X");
  assert.equal(cleanIsbn("978 0 306 40615 7"), "9780306406157");
});

test("REF-01-T-2 hasIsbnShape accepts ISBN-10 and ISBN-13 lengths only", () => {
  assert.ok(hasIsbnShape("030640615X"));
  assert.ok(hasIsbnShape("9780306406157"));
  assert.ok(!hasIsbnShape("12345"));
  assert.ok(!hasIsbnShape("97803064061X7"));
});

test("REF-01-T-2 hasValidIsbnChecksum checks both formats", () => {
  assert.ok(hasValidIsbnChecksum("0306406152"));
  assert.ok(hasValidIsbnChecksum("9780306406157"));
  assert.ok(!hasValidIsbnChecksum("0306406153"));
  assert.ok(!hasValidIsbnChecksum("9780306406158"));
});
