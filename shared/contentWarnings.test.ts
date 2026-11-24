import { expect, expectTypeOf, test } from "vitest";
import {
  CONTENT_WARNINGS,
  contentWarningId,
  contentWarningsResponse,
  type ContentWarningId,
} from "./contentWarnings.ts";

const sourceUrl =
  "https://triggerwarningdatabase.com/2023/08/29/thornhedge-by-t-kingfisher/";

test("SRC-05-T-1 shares unique selectable warning IDs", () => {
  expectTypeOf<ContentWarningId>().toEqualTypeOf<
    (typeof CONTENT_WARNINGS)[number]["id"]
  >();
  const ids = CONTENT_WARNINGS.map((warning) => warning.id);
  expect(ids).toEqual([...new Set(ids)]);
  for (const warning of CONTENT_WARNINGS) {
    expect(warning.label.trim(), `Missing label for ${warning.id}`).not.toBe(
      "",
    );
  }
  expect(contentWarningId.safeParse("fantasy").success).toBe(false);
});

test("SRC-05-T-1 validates found warnings and source URLs", () => {
  const found = {
    status: "found",
    warnings: ["Self-harm mentioned", "Child abuse recounted", "Blood & gore"],
    categoryIds: ["self-harm", "child-abuse-neglect", "blood-gore-depiction"],
    sourceUrl,
  };
  expect(contentWarningsResponse.parse(found)).toEqual(found);
  const unmapped = { ...found, categoryIds: [] };
  expect(contentWarningsResponse.parse(unmapped)).toEqual(unmapped);
  for (const change of [
    { warnings: [] },
    { warnings: [123] },
    { categoryIds: ["fantasy"] },
    { sourceUrl: "not-a-url" },
    { sourceUrl: null },
  ]) {
    expect(
      contentWarningsResponse.safeParse({ ...found, ...change }).success,
      JSON.stringify(change),
    ).toBe(false);
  }
});

test("SRC-05-T-1 validates not_found and unavailable responses", () => {
  for (const result of [
    { status: "not_found", sourceUrl },
    { status: "unavailable", sourceUrl },
    { status: "unavailable", sourceUrl: null },
  ]) {
    expect(contentWarningsResponse.parse(result)).toEqual(result);
  }
  for (const invalid of [
    { status: "not_found", sourceUrl: null },
    { status: "unavailable" },
    { status: "ambiguous", sourceUrl },
  ]) {
    expect(
      contentWarningsResponse.safeParse(invalid).success,
      JSON.stringify(invalid),
    ).toBe(false);
  }
});
