import { expect, test } from "vitest";
import { cleanIsbn, hasIsbnShape, hasValidIsbnChecksum } from "./isbn.ts";

test("REF-01-T-2 cleanIsbn keeps digits and an uppercase X", () => {
  expect(cleanIsbn(" 0-306-40615-x ")).toBe("030640615X");
  expect(cleanIsbn("978 0 306 40615 7")).toBe("9780306406157");
});

test("REF-01-T-2 hasIsbnShape accepts ISBN-10 and ISBN-13 lengths only", () => {
  expect(hasIsbnShape("030640615X")).toBe(true);
  expect(hasIsbnShape("9780306406157")).toBe(true);
  expect(hasIsbnShape("12345")).toBe(false);
  expect(hasIsbnShape("97803064061X7")).toBe(false);
});

test("REF-01-T-2 hasValidIsbnChecksum checks both formats", () => {
  expect(hasValidIsbnChecksum("0306406152")).toBe(true);
  expect(hasValidIsbnChecksum("9780306406157")).toBe(true);
  expect(hasValidIsbnChecksum("0306406153")).toBe(false);
  expect(hasValidIsbnChecksum("9780306406158")).toBe(false);
});
