import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { Server } from "node:http";
import type {
  BookSearchResponse,
  BookSearchResult,
  BooksError,
} from "../../shared/books.ts";
import { booksRouter } from "../src/routes/books.ts";
import { express } from "./test-utils.ts";

const originalFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;
let upstreamRequests: URL[];

function stubOpenLibrary(respond: (url: URL) => Response | Promise<Response>) {
  upstreamRequests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    upstreamRequests.push(url);
    return respond(url);
  };
}

function openLibraryResponse(docs: BookSearchResult[]) {
  return new Response(JSON.stringify({ numFound: docs.length, docs }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function get(path: string) {
  return originalFetch(`${baseUrl}${path}`);
}

before(async () => {
  const app = express();
  app.use("/api/books", booksRouter);

  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// criterion 1

test("SRC-03-T-2 returns no more than five suggestions", async () => {
  const docs: BookSearchResult[] = Array.from({ length: 6 }, (_, index) => ({
    key: `/works/OL${index}W`,
    title: `Book ${index}`,
  }));
  stubOpenLibrary(() => openLibraryResponse(docs));

  const res = await get("/api/books/suggestions?q=harry%20potter");
  const body = (await res.json()) as BookSearchResponse;

  assert.equal(res.status, 200);
  assert.deepEqual(body, { books: docs.slice(0, 5), total: 6 });
  assert.equal(upstreamRequests[0]?.searchParams.get("limit"), "5");
});

// criterion 2

test("SRC-03-T-2 sends a prefix query for a partial final word", async () => {
  stubOpenLibrary(() => openLibraryResponse([]));

  const res = await get("/api/books/suggestions?q=%20harry%20%2B%20pot%20");

  assert.equal(res.status, 200);
  assert.equal(upstreamRequests[0]?.searchParams.get("q"), "harry \\+ pot*");
});

// criterion 3

test("SRC-03-T-2 rejects invalid suggestion queries without calling Open Library", async () => {
  stubOpenLibrary(() => openLibraryResponse([]));

  const invalidPaths = [
    "/api/books/suggestions",
    "/api/books/suggestions?q=",
    "/api/books/suggestions?q=%20%20",
    "/api/books/suggestions?q=ab",
    "/api/books/suggestions?q=from",
    "/api/books/suggestions?q=FROM",
  ];

  for (const path of invalidPaths) {
    const res = await get(path);
    const body = (await res.json()) as BooksError;
    assert.equal(res.status, 400, path);
    assert.equal(typeof body.error, "string", path);
  }

  assert.equal(upstreamRequests.length, 0);
});

test("SRC-03-T-2 allows multiword queries made only of common words", async () => {
  stubOpenLibrary(() => openLibraryResponse([]));

  const res = await get("/api/books/suggestions?q=from%20into");
  const body = (await res.json()) as BookSearchResponse;

  assert.equal(res.status, 200);
  assert.deepEqual(body, { books: [], total: 0 });
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0]?.searchParams.get("q"), "from into*");
});

// criterion 4

test("SRC-03-T-2 returns the standard error when Open Library fails", async () => {
  stubOpenLibrary(
    () =>
      new Response("upstream unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
  );

  const res = await get("/api/books/suggestions?q=harry%20potter");

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), {
    error: "Unable to retrieve book suggestions from Open Library",
  });
  assert.equal(upstreamRequests.length, 1);
});

// criterion 5

test("SRC-03-T-2 keeps submitted search requests at twenty results", async () => {
  stubOpenLibrary(() =>
    openLibraryResponse(
      Array.from({ length: 20 }, (_, index) => ({
        key: `/works/OL${index}W`,
        title: `Book ${index}`,
      })),
    ),
  );

  const res = await get("/api/books/search?q=harry%20potter");
  const body = (await res.json()) as BookSearchResponse | BooksError;

  assert.equal(res.status, 200);
  assert.ok("books" in body);
  assert.equal(body.books.length, 20);
  assert.equal(body.total, 20);
  assert.equal(upstreamRequests[0]?.searchParams.get("limit"), "20");
});
