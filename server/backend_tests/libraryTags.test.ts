import assert from "node:assert/strict";
import { test } from "node:test";
import { filterByTag, filterByTags, libraryTags } from "../../shared/tags.ts";

const books = [
  { id: 1, details: { tags: ["fantasy", "magic"] } },
  { id: 2, details: { tags: ["history"] } },
  { id: 3, details: null },
  { id: 4, details: { tags: ["magic", "adventure"] } },
];

test("COL-06-T-3 lists sorted unique library tags", () => {
  assert.deepEqual(libraryTags(books), [
    "adventure",
    "fantasy",
    "history",
    "magic",
  ]);
});

test("COL-06-T-3 filters books by one tag", () => {
  assert.deepEqual(
    filterByTag(books, "magic").map((book) => book.id),
    [1, 4],
  );
});

test("COL-06-T-3 empty tag returns every book", () => {
  assert.deepEqual(filterByTag(books, ""), books);
});

test("COL-06-T-3 books without details never match a tag", () => {
  assert.ok(!filterByTag(books, "history").some((book) => book.id === 3));
});

test("COL-06-T-4 requires every selected tag", () => {
  assert.deepEqual(
    filterByTags(books, ["fantasy", "magic"]).map((book) => book.id),
    [1],
  );
});

test("COL-06-T-4 empty selection returns every book", () => {
  assert.deepEqual(filterByTags(books, []), books);
});

test("COL-06-T-4 books without details never match a selection", () => {
  assert.ok(!filterByTags(books, ["magic"]).some((book) => book.id === 3));
});

test("COL-06-T-4 a combination with no common book returns nothing", () => {
  assert.deepEqual(filterByTags(books, ["history", "magic"]), []);
});
