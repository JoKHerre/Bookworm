import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { BookDetails } from "../../shared/books.ts";
import { createApp } from "../src/app.ts";
import { clearOpenLibraryCache } from "../src/services/openLibrary.ts";
import { startTestServer } from "./test-utils.ts";

const originalFetch = globalThis.fetch;
let closeServer: () => Promise<void>;
let baseUrl: string;

function redirect(from: string, to: string) {
  return { key: from, type: { key: "/type/redirect" }, location: to };
}

// Serve Open Library work records by path, recording each request.
function stubWorks(works: Record<string, object>) {
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const { pathname } = new URL(String(input));
    requested.push(pathname);
    const work = works[pathname.replace(/\.json$/, "")];
    return work
      ? new Response(JSON.stringify(work))
      : new Response("{}", { status: 404 });
  };
  return requested;
}

function getDetails(key: string) {
  return originalFetch(
    `${baseUrl}/api/books/details?key=${key}&includeAuthors=false`,
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

test("book details follow a merged work to its new key", async () => {
  const requested = stubWorks({
    "/works/OL1W": redirect("/works/OL1W", "/works/OL2W"),
    "/works/OL2W": redirect("/works/OL2W", "/works/OL3W"),
    "/works/OL3W": { key: "/works/OL3W", title: "Dune" },
  });

  const response = await getDetails("/works/OL1W");
  assert.equal(response.status, 200);
  const body = (await response.json()) as BookDetails;
  assert.equal(body.key, "/works/OL3W");
  assert.equal(body.title, "Dune");
  assert.deepEqual(requested, [
    "/works/OL1W.json",
    "/works/OL2W.json",
    "/works/OL3W.json",
  ]);
});

test("book details stop at a redirect loop or a bad location", async () => {
  stubWorks({
    "/works/OL1W": redirect("/works/OL1W", "/works/OL2W"),
    "/works/OL2W": redirect("/works/OL2W", "/works/OL1W"),
    "/works/OL5W": redirect("/works/OL5W", "/authors/OL1A"),
  });

  for (const key of ["/works/OL1W", "/works/OL5W"]) {
    const response = await getDetails(key);
    assert.equal(response.status, 502, key);
    assert.deepEqual(await response.json(), {
      error: "Unable to retrieve book details",
    });
  }
});
