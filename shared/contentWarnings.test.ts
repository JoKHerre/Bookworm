import { expect, expectTypeOf, test } from "vitest";
import {
  CONTENT_WARNINGS,
  contentWarningId,
  contentWarningsResponse,
  shouldExcludeForWarnings,
  type ContentWarningId,
  type ContentWarningsResponse,
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

const warningResult: ContentWarningsResponse = {
  status: "found",
  warnings: ["Self-harm mentioned"],
  categoryIds: ["self-harm"],
  sourceUrl,
};

test("SRC-05-T-2 excludes a book when any selected warning matches", () => {
  expect(shouldExcludeForWarnings(warningResult, ["self-harm"])).toBe(true);
  expect(
    shouldExcludeForWarnings(warningResult, ["pregnancy", "self-harm"]),
  ).toBe(true);
});

test("SRC-05-T-2 keeps books without a selected warning match", () => {
  expect(shouldExcludeForWarnings(warningResult, [])).toBe(false);
  expect(shouldExcludeForWarnings(warningResult, ["pregnancy"])).toBe(false);
  expect(
    shouldExcludeForWarnings({ ...warningResult, categoryIds: [] }, [
      "self-harm",
    ]),
  ).toBe(false);
});

test("SRC-05-T-2 ignores selection order and duplicates", () => {
  expect(
    shouldExcludeForWarnings(warningResult, ["self-harm", "pregnancy"]),
  ).toBe(true);
  expect(
    shouldExcludeForWarnings(warningResult, [
      "pregnancy",
      "self-harm",
      "self-harm",
    ]),
  ).toBe(true);
  expect(
    shouldExcludeForWarnings(warningResult, ["pregnancy", "pregnancy"]),
  ).toBe(false);
});

test.each<ContentWarningsResponse>([
  { status: "not_found", sourceUrl },
  { status: "unavailable", sourceUrl },
  { status: "unavailable", sourceUrl: null },
])("SRC-05-T-2 keeps books with $status warning information", (result) => {
  const original = { ...result };
  expect(shouldExcludeForWarnings(result, ["self-harm"])).toBe(false);
  expect(result).toEqual(original);
});
