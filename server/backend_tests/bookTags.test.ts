import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { BookDetails } from "../../shared/books.ts";
import { toTags } from "../../shared/tags.ts";
import { createApp } from "../src/app.ts";
import { startTestServer } from "./test-utils.ts";
import { clearOpenLibraryCache } from "../src/services/openLibrary.ts";

const originalFetch = globalThis.fetch;
const workKey = "/works/OL1W";
let closeServer: () => Promise<void>;
let baseUrl: string;

function stubWork(body: object | null, status = 200) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, `${workKey}.json`);
    return new Response(JSON.stringify(body), { status });
  };
}

function getDetails() {
  return originalFetch(
    `${baseUrl}/api/books/details?key=${workKey}&includeAuthors=false`,
  );
}

before(async () => {
  ({ baseUrl, close: closeServer } = await startTestServer(createApp()));
});

after(async () => {
  await closeServer();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearOpenLibraryCache();
});

test("COL-06-T-1 normalizes subjects into lowercase tags", () => {
  assert.deepEqual(toTags(["  Science   Fiction ", "FANTASY"]), [
    "science fiction",
    "fantasy",
  ]);
});

test("COL-06-T-1 drops unusable subjects and duplicates", () => {
  assert.deepEqual(
    toTags([
      "Fantasy",
      "",
      "   ",
      "nyt:hardcover-fiction=2020-01-01",
      "x".repeat(41),
      "fantasy",
      "FANTASY ",
      "Magic",
    ]),
    ["fantasy", "magic"],
  );
});

test("COL-06-T-1 limits tags to ten", () => {
  const subjects = Array.from({ length: 12 }, (_, i) => `subject ${i}`);
  assert.deepEqual(toTags(subjects), subjects.slice(0, 10));
});

test("COL-06-T-1 returns no tags without subjects", () => {
  assert.deepEqual(toTags(undefined), []);
  assert.deepEqual(toTags([]), []);
});

test("COL-06-T-1 book details include tags from subjects", async () => {
  stubWork({
    key: workKey,
    title: "Dune",
    subjects: ["Science Fiction", "Deserts", "nyt:best-sellers"],
  });

  const response = await getDetails();
  const body = (await response.json()) as BookDetails;

  assert.equal(response.status, 200);
  assert.deepEqual(body.tags, ["science fiction", "deserts"]);
  assert.deepEqual(body.subjects, [
    "Science Fiction",
    "Deserts",
    "nyt:best-sellers",
  ]);
});

test("COL-06-T-1 book details without subjects have empty tags", async () => {
  stubWork({ key: workKey, title: "Dune" });

  const response = await getDetails();
  const body = (await response.json()) as BookDetails;

  assert.equal(response.status, 200);
  assert.deepEqual(body.tags, []);
});

test("COL-06-T-1 book details keep upstream error responses", async () => {
  stubWork(null, 404);
  assert.equal((await getDetails()).status, 404);

  stubWork(null, 500);
  assert.equal((await getDetails()).status, 502);
});
