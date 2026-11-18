import { expect, test } from "vitest";
import { filterByTags, libraryTags } from "./tags.ts";

const books = [
  { id: 1, details: { tags: ["fantasy", "magic"] } },
  { id: 2, details: { tags: ["history"] } },
  { id: 3, details: null },
  { id: 4, details: { tags: ["magic", "adventure"] } },
];

test("COL-06-T-3 lists sorted unique library tags", () => {
  expect(libraryTags(books)).toStrictEqual([
    "adventure",
    "fantasy",
    "history",
    "magic",
  ]);
});

test("COL-06-T-3 filters books by one tag", () => {
  expect(filterByTags(books, ["magic"]).map((book) => book.id)).toStrictEqual([
    1, 4,
  ]);
});

test("COL-06-T-4 requires every selected tag", () => {
  expect(
    filterByTags(books, ["fantasy", "magic"]).map((book) => book.id),
  ).toStrictEqual([1]);
});

test("COL-06-T-4 empty selection returns every book", () => {
  expect(filterByTags(books, [])).toStrictEqual(books);
});

test("COL-06-T-4 books without details never match a selection", () => {
  expect(
    filterByTags(books, ["magic"]).some((book) => book.id === 3),
  ).toBeFalsy();
});

test("COL-06-T-4 a combination with no common book returns nothing", () => {
  expect(filterByTags(books, ["history", "magic"])).toStrictEqual([]);
});
