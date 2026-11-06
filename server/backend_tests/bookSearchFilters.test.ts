import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import type {
  BookSearchResponse,
  BookSearchResult,
  BooksError,
} from "../../shared/books.ts";
import { booksRouter } from "../src/routes/books.ts";

const resultLimit = 20;
const totalMatches = resultLimit * 2;
const originalFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;
let upstreamRequests: URL[];

function stubOpenLibrary(respond: (url: URL) => Response | Promise<Response>) {
  upstreamRequests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://openlibrary.org");
    assert.equal(url.pathname, "/search.json");
    upstreamRequests.push(url);
    return respond(url);
  };
}

function openLibraryResponse(
  books: BookSearchResult[] = [],
  total = books.length,
) {
  return new Response(JSON.stringify({ docs: books, numFound: total }), {
    headers: { "content-type": "application/json" },
  });
}

function get(query: string | URLSearchParams) {
  return originalFetch(`${baseUrl}/api/books/search?${query}`);
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

// Criterion 1: each existing filter choice narrows the upstream search.

test("SRC-04-T-2 applies every supported genre", async () => {
  const genres = [
    ["Fantasy", "fantasy"],
    ["Sci-fi", "science fiction"],
    ["Mystery", "mystery"],
    ["Romance", "romance"],
    ["Horror", "horror"],
    ["History", "history"],
    ["Thriller", "thriller"],
    ["Adventure", "adventure"],
    ["Biography", "biography"],
    ["Non-fiction", "nonfiction"],
    ["Poetry", "poetry"],
  ] as const;
  const book = { key: "/works/OL1W", title: "Matching book" };
  stubOpenLibrary(() => openLibraryResponse([book]));

  for (const [genre, subject] of genres) {
    const res = await get(new URLSearchParams({ q: "books", genre }));
    assert.equal(res.status, 200, genre);
    assert.deepEqual(await res.json(), { books: [book], total: 1 });
    assert.equal(
      upstreamRequests.at(-1)?.searchParams.get("q"),
      `(books) AND subject:("${subject}")`,
      genre,
    );
  }
  assert.equal(upstreamRequests.length, genres.length);
});

test("SRC-04-T-2 applies every supported language as a restriction", async () => {
  const languages = [
    ["English", "eng"],
    ["Spanish", "spa"],
    ["French", "fre"],
  ] as const;
  stubOpenLibrary(() => openLibraryResponse());

  for (const [language, code] of languages) {
    const res = await get(new URLSearchParams({ q: "books", language }));
    assert.equal(res.status, 200, language);
    assert.equal(
      upstreamRequests.at(-1)?.searchParams.get("q"),
      `(books) AND language:${code}`,
      language,
    );
    assert.equal(upstreamRequests.at(-1)?.searchParams.has("lang"), false);
  }
});

test("SRC-04-T-2 applies every first-publication year range", async () => {
  const years = [
    ["2020-present", `2020 TO ${new Date().getUTCFullYear()}`],
    ["2010-2019", "2010 TO 2019"],
    ["2000-2009", "2000 TO 2009"],
    ["1990-1999", "1990 TO 1999"],
    ["1980-1989", "1980 TO 1989"],
    ["1970-1979", "1970 TO 1979"],
    ["1950-1969", "1950 TO 1969"],
    ["1900-1949", "1900 TO 1949"],
    ["before-1900", "* TO 1899"],
  ] as const;
  stubOpenLibrary(() => openLibraryResponse());

  for (const [year, range] of years) {
    const res = await get(new URLSearchParams({ q: "books", year }));
    assert.equal(res.status, 200, year);
    assert.equal(
      upstreamRequests.at(-1)?.searchParams.get("q"),
      `(books) AND first_publish_year:[${range}]`,
      year,
    );
  }
});

// Criterion 2: OR within genres, AND between different filters and the query.

test("SRC-04-T-2 combines genres with OR and other filters with AND", async () => {
  stubOpenLibrary(() => openLibraryResponse());

  const res = await get(
    "q=harry%20OR%20potter&genre=Fantasy&genre=Sci-fi&language=English&year=1990-1999",
  );

  assert.equal(res.status, 200);
  assert.equal(upstreamRequests.length, 1);
  assert.equal(
    upstreamRequests[0]?.searchParams.get("q"),
    '(harry OR potter) AND subject:("fantasy" OR "science fiction") AND language:eng AND first_publish_year:[1990 TO 1999]',
  );
  assert.equal(
    upstreamRequests[0]?.searchParams.get("limit"),
    String(resultLimit),
  );
});

test("SRC-04-T-2 does not repeat duplicate genre constraints", async () => {
  stubOpenLibrary(() => openLibraryResponse());
  const res = await get("q=books&genre=Fantasy&genre=Fantasy&genre=Mystery");

  assert.equal(res.status, 200);
  assert.equal(
    upstreamRequests[0]?.searchParams.get("q"),
    '(books) AND subject:("fantasy" OR "mystery")',
  );
});

// Criterion 3: preserve the response shape, filtered total, and result limit.

test("SRC-04-T-2 returns at most twenty filtered books with the matching total", async () => {
  const books = Array.from({ length: resultLimit + 1 }, (_, index) => ({
    key: `/works/OL${index}W`,
    title: `Matching book ${index}`,
  }));
  stubOpenLibrary(() => openLibraryResponse(books, totalMatches));

  const res = await get("q=books&genre=Fantasy");
  const body = (await res.json()) as BookSearchResponse;

  assert.equal(res.status, 200);
  assert.deepEqual(body, {
    books: books.slice(0, resultLimit),
    total: totalMatches,
  });
  assert.equal(
    upstreamRequests[0]?.searchParams.get("limit"),
    String(resultLimit),
  );
});

test("SRC-04-T-2 returns an empty result without falling back to unfiltered search", async () => {
  stubOpenLibrary(() => openLibraryResponse());

  const res = await get(
    "q=books&genre=Poetry&language=Spanish&year=before-1900",
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { books: [], total: 0 });
  assert.equal(upstreamRequests.length, 1);
  assert.equal(
    upstreamRequests[0]?.searchParams.get("q"),
    '(books) AND subject:("poetry") AND language:spa AND first_publish_year:[* TO 1899]',
  );
});

// Criterion 4: invalid filters fail locally; upstream failures return 502.

test("SRC-04-T-2 rejects invalid filters without calling Open Library", async () => {
  stubOpenLibrary(() => openLibraryResponse());
  const invalidQueries = [
    "q=books&genre=unsupported",
    "q=books&genre=Fantasy&genre=unsupported",
    "q=books&language=unsupported",
    "q=books&language=English&language=French",
    "q=books&year=2000",
    "q=books&year=2020-1900",
    "q=books&year=2000-2009&year=1990-1999",
    "q=books&genre=Fantasy%29%20OR%20*%3A*",
    "q=books&language=English%20OR%20*%3A*",
    "q=books&year=%5B*%20TO%20*%5D",
    "genre=Fantasy",
    "q=%20%20&genre=Fantasy",
    "q=books&q=other&genre=Fantasy",
  ];

  for (const query of invalidQueries) {
    const res = await get(query);
    const body = (await res.json()) as BooksError;
    assert.equal(res.status, 400, query);
    assert.equal(typeof body.error, "string", query);
    assert.ok(body.error.length > 0, query);
  }
  assert.equal(upstreamRequests.length, 0);
});

test("SRC-04-T-2 returns 502 when Open Library is unavailable", async () => {
  stubOpenLibrary(() => new Response("Unavailable", { status: 503 }));

  const res = await get("q=books&genre=Fantasy");

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), {
    error: "Unable to retrieve books from Open Library",
  });
  assert.equal(upstreamRequests.length, 1);
});

test("SRC-04-T-2 returns 502 when the Open Library request throws", async () => {
  stubOpenLibrary(() => {
    throw new TypeError("Network unavailable");
  });

  const res = await get("q=books&language=French");

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), {
    error: "Unable to retrieve books from Open Library",
  });
  assert.equal(upstreamRequests.length, 1);
});

test("SRC-04-T-2 returns 502 for an invalid Open Library response", async () => {
  stubOpenLibrary(() => new Response(JSON.stringify({ docs: "invalid" })));

  const res = await get("q=books&year=2000-2009");

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), {
    error: "Unable to retrieve books from Open Library",
  });
  assert.equal(upstreamRequests.length, 1);
});

// Criterion 5: omitted/default filters retain the original search behavior.

test("SRC-04-T-2 preserves unfiltered search and treats empty filters as defaults", async () => {
  const book = {
    key: "/works/OL2W",
    title: "Unfiltered book",
    author_name: ["Author"],
    first_publish_year: 1999,
    cover_i: 123,
  };
  stubOpenLibrary(() => openLibraryResponse([book], totalMatches));

  for (const query of [
    "q=%20books%20",
    "q=books&genre=&language=&year=",
    "q=books&genre=&genre=&language=&year=",
  ]) {
    const res = await get(query);
    assert.equal(res.status, 200, query);
    assert.deepEqual(await res.json(), { books: [book], total: totalMatches });
    const params = upstreamRequests.at(-1)?.searchParams;
    assert.ok(params);

    assert.equal(params.get("q"), "books");
    assert.equal(
      params.get("fields"),
      "key,title,author_name,first_publish_year,cover_i",
    );
    assert.equal(params.get("limit"), String(resultLimit));
    assert.equal([...params].length, 3);
  }
});

test("SRC-04-T-2 ignores empty filters when another filter is active", async () => {
  stubOpenLibrary(() => openLibraryResponse());

  const res = await get("q=books&genre=&genre=Fantasy&language=&year=");

  assert.equal(res.status, 200);
  assert.equal(
    upstreamRequests[0]?.searchParams.get("q"),
    '(books) AND subject:("fantasy")',
  );
});
