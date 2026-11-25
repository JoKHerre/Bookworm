import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { ApiError } from "../../shared/api.ts";
import type { BookSearchResponse } from "../../shared/books.ts";
import { createApp } from "../src/app.ts";
import { startTestServer } from "./test-utils.ts";

const originalFetch = globalThis.fetch;
let closeServer: () => Promise<void>;
let baseUrl: string;
let upstreamRequests: URL[];

function stubOpenLibrary() {
  upstreamRequests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    upstreamRequests.push(url);
    const page = url.searchParams.get("page") ?? "1";
    return new Response(
      JSON.stringify({
        docs: [{ key: `/works/OL${page}W`, title: `Page ${page}` }],
        numFound: 45,
      }),
    );
  };
}

function search(query: string) {
  return originalFetch(`${baseUrl}/api/books/search?${query}`);
}

before(async () => {
  ({ baseUrl, close: closeServer } = await startTestServer(createApp()));
});

after(async () => {
  await closeServer();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("search asks Open Library for the requested page", async () => {
  stubOpenLibrary();

  const first = await search("q=dune");
  assert.equal(first.status, 200);
  const third = await search("q=dune&page=3");
  assert.equal(third.status, 200);
  assert.deepEqual((await third.json()) as BookSearchResponse, {
    books: [{ key: "/works/OL3W", title: "Page 3" }],
    total: 45,
    hasMore: false,
    totalIsExact: true,
  });

  assert.deepEqual(
    upstreamRequests.map((url) => [
      url.searchParams.get("page"),
      url.searchParams.get("limit"),
    ]),
    [
      [null, "20"],
      ["3", "20"],
    ],
  );
});

test("search rejects a page out of range without calling Open Library", async () => {
  stubOpenLibrary();

  for (const page of ["0", "-1", "1.5", "abc", "51"]) {
    const response = await search(`q=dune&page=${page}`);
    assert.equal(response.status, 400, page);
    assert.deepEqual((await response.json()) as ApiError, {
      error: "Invalid page",
    });
  }
  assert.equal(upstreamRequests.length, 0);
});

test("SRC-05-T-3 stops continuation at the search page limit", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ docs: [], numFound: 2000 }));
  const last = await search("q=dune&page=50");
  const lastPage = (await last.json()) as BookSearchResponse;
  assert.equal(lastPage.hasMore, false);
  assert.equal(lastPage.total, 2000);
});
