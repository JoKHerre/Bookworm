import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as flush } from "node:timers/promises";
import { after, afterEach, before, test, type TestContext } from "node:test";
import { contentWarningsResponse } from "../../shared/contentWarnings.ts";
import type { BookSearchResponse } from "../../shared/books.ts";
import { createApp } from "../src/app.ts";
import { clearOpenLibraryCache } from "../src/services/openLibrary.ts";
import {
  clearContentWarningsCache,
  lookupContentWarnings,
  filterSearchWarnings,
} from "../src/services/contentWarnings.ts";
import { startTestServer } from "./test-utils.ts";

const source = "https://triggerwarningdatabase.com";
const openLibrary = "https://openlibrary.org";
const coffeePath =
  "/2021/09/16/before-the-coffee-gets-cold-by-toshikazu-kawaguchi/";
const gatsbyPath = "/2021/05/17/the-great-gatsby-by-f-scott-fitzgerald/";
const coffee = fixture("coffee");
const gatsby = fixture("gatsby");
const book = {
  title: "Before the Coffee Gets Cold",
  authors: ["Toshikazu Kawaguchi"],
};
const work = {
  key: "/works/OL1W",
  title: book.title,
  authors: [{ author: { key: "/authors/OL1A" } }],
};
const originalFetch = globalThis.fetch;
let baseUrl: string;
let closeServer: () => Promise<void>;
let upstreamRequests: URL[];

function fixture(name: string) {
  return readFileSync(
    new URL(`./fixtures/${name}.html`, import.meta.url),
    "utf8",
  );
}

function countRequests(origin: string) {
  return upstreamRequests.filter((url) => url.origin === origin).length;
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// Override text() so tests can pause the body read.
function htmlBody(read: () => Promise<string>) {
  return Object.assign(html(""), { text: read });
}

function result(
  title = book.title,
  author = book.authors[0],
  path = coffeePath,
) {
  return `<article class="type-post"><header class="entry-header"><h2 class="entry-title"><a rel="bookmark" href="${path}">${title} by ${author}</a></h2></header></article>`;
}

function search(rows = result(), extra = "") {
  return `<main id="main">${rows}${extra}</main>`;
}

const noResults =
  '<main id="main"><section class="no-results"><h1>Nothing Found</h1></section></main>';

function stubUpstream(
  respond: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  upstreamRequests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    upstreamRequests.push(url);
    return respond(url, init);
  };
}

function stubCoffee(searchHtml = search(), entryHtml = coffee) {
  stubUpstream((url) => {
    assert.equal(url.origin, source);
    if (url.pathname === "/") return html(searchHtml);
    assert.equal(url.pathname, coffeePath);
    return html(entryHtml);
  });
}

function workResponse(url: URL) {
  return json(
    url.pathname.startsWith("/authors/") ? { name: book.authors[0] } : work,
  );
}

function get(query = `key=${work.key}`) {
  return originalFetch(`${baseUrl}/api/books/content-warnings?${query}`);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

// Native AbortSignal timers bypass Node's mocked setTimeout.
function mockTimeouts(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(AbortSignal, "timeout", (delay: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), delay);
    return controller.signal;
  });
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
  clearContentWarningsCache();
});

test("SRC-05-T-1 returns warnings for a merged work", async () => {
  stubUpstream((url) => {
    if (url.origin === openLibrary) {
      if (url.pathname === `${work.key}.json`)
        return json({
          type: { key: "/type/redirect" },
          location: "/works/OL2W",
        });
      if (url.pathname === "/works/OL2W.json")
        return json({ ...work, key: "/works/OL2W" });
      assert.equal(url.pathname, "/authors/OL1A.json");
      return workResponse(url);
    }
    assert.equal(url.origin, source);
    return html(url.pathname === "/" ? search() : coffee);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await get();
    assert.equal(response.status, 200);
    const body = contentWarningsResponse.parse(await response.json());
    assert.equal(body.status, "found");
    assert.equal(body.sourceUrl, `${source}${coffeePath}`);
    assert.ok(body.warnings.includes("Pregnancy"));
    assert.ok(body.categoryIds.includes("pregnancy"));
  }
  assert.equal(countRequests(openLibrary), 3);
  assert.equal(countRequests(source), 2);
});

test("SRC-05-T-1 rejects invalid keys without upstream calls", async () => {
  stubUpstream(() => assert.fail("No upstream request expected"));
  for (const query of ["", "key=OL1W", "key=/works/OL1W&key=/works/OL2W"]) {
    const response = await get(query);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: "Invalid book key" });
  }
  assert.equal(upstreamRequests.length, 0);
});

test("SRC-05-T-1 reports Open Library errors", async () => {
  for (const status of [404, 500]) {
    clearOpenLibraryCache();
    stubUpstream(() => json({}, status));
    const response = await get();
    assert.equal(response.status, status === 404 ? 404 : 502);
    assert.deepEqual(await response.json(), {
      error:
        status === 404
          ? "Book not found"
          : "Unable to retrieve book content warnings",
    });
    assert.equal(countRequests(source), 0);
  }
});

test("SRC-05-T-1 matches title and book author", async () => {
  const rows =
    result("Unrelated title") + result(book.title, "Someone Else") + result();
  stubCoffee(search(rows));
  assert.equal((await lookupContentWarnings(book)).status, "found");
  assert.equal(upstreamRequests.length, 2);
  assert.equal(
    (await lookupContentWarnings({ ...book, authors: ["Different Author"] }))
      .status,
    "not_found",
  );
  assert.equal(
    (await lookupContentWarnings({ ...book, title: "Other Book" })).status,
    "not_found",
  );
});

test("SRC-05-T-1 preserves warning text and maps linked tags", async () => {
  stubUpstream((url) =>
    html(
      url.pathname === "/"
        ? search(result("The Great Gatsby", "F Scott Fitzgerald", gatsbyPath))
        : gatsby,
    ),
  );
  const response = await lookupContentWarnings({
    title: " THE GREAT GATSBY ",
    authors: ["F. Scott Fitzgerald"],
  });
  assert.equal(response.status, "found");
  assert.deepEqual(response.warnings, [
    "Domestic abuse",
    "Emotional, physical & verbal abuse",
    "Suicide",
    "Alcohol consumption",
    "Recreational drug use (smoking)",
    "Car accident",
  ]);
  assert.deepEqual(response.categoryIds, [
    "alcohol-consumption-abuse",
    "car-accident",
    "domestic-abuse-violence",
    "drug-use-abuse",
  ]);
});

test("SRC-05-T-1 ignores unsupported and unrelated tags", async () => {
  stubCoffee(
    search(),
    coffee
      .replace('href="/tag/pregnancy/"', 'href="/tag/unknown-source-tag/"')
      .replace(
        "</main>",
        '<span class="tags-links"><a href="/tag/racism/" rel="tag">Racism</a></span></main>',
      ),
  );
  const response = await lookupContentWarnings(book);
  assert.equal(response.status, "found");
  assert.ok(response.warnings.includes("Pregnancy"));
  assert.ok(!response.categoryIds.includes("pregnancy"));
  assert.ok(!response.categoryIds.includes("racism"));
});

test("SRC-05-T-1 marks incomplete or changed pages unavailable", async () => {
  const cases = [
    ["unreadable search", "<html>Challenge</html>", coffee],
    [
      "unchecked next page",
      search(result("Other Book"), '<a class="next" href="/page/2/">Next</a>'),
      coffee,
    ],
    [
      "wrong entry author",
      search(),
      coffee.replace("Toshikazu Kawaguchi", "Someone Else"),
    ],
    [
      "missing warning heading",
      search(),
      coffee.replace("Trigger & Content Warnings:", "Notes"),
    ],
  ] as const;
  for (const [name, searchHtml, entryHtml] of cases) {
    clearContentWarningsCache();
    stubCoffee(searchHtml, entryHtml);
    const response = await lookupContentWarnings(book);
    assert.equal(response.status, "unavailable", name);
    assert.equal("warnings" in response, false, name);
  }
});

test("SRC-05-T-1 stays on the warning source", async () => {
  stubCoffee(
    search(
      result(book.title, book.authors[0], "https://elsewhere.example/book/"),
    ),
  );
  assert.equal((await lookupContentWarnings(book)).status, "unavailable");
  assert.equal(upstreamRequests.length, 1);
});

test("SRC-05-T-1 leaves source failures uncached", async () => {
  let failing = true;
  stubUpstream((url) => {
    if (url.origin === openLibrary) return workResponse(url);
    if (url.pathname === "/") return html(search());
    return failing ? html("Error", 500) : html(coffee);
  });
  const response = await get();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "unavailable",
    sourceUrl: `${source}/?s=Before+the+Coffee+Gets+Cold`,
  });
  failing = false;
  assert.equal((await lookupContentWarnings(book)).status, "found");
  assert.equal(countRequests(source), 4);
});

for (const [status, page, requestCount] of [
  ["found", search(), 2],
  ["not_found", noResults, 1],
] as const) {
  test(`SRC-05-T-1 caches ${status} results for one hour`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"] });
    stubCoffee(page);
    const [first, second] = await Promise.all([
      lookupContentWarnings(book),
      lookupContentWarnings(book),
    ]);
    assert.equal(first.status, status);
    assert.deepEqual(second, first);
    assert.deepEqual(await lookupContentWarnings(book), first);
    assert.equal(upstreamRequests.length, requestCount);

    t.mock.timers.tick(60 * 60 * 1_000 + 1);
    assert.deepEqual(await lookupContentWarnings(book), first);
    assert.equal(upstreamRequests.length, requestCount * 2);
  });
}

test("SRC-05-T-1 serializes source requests", async () => {
  const body = deferred();
  stubUpstream(() =>
    htmlBody(async () => {
      await body.promise;
      return noResults;
    }),
  );
  const first = lookupContentWarnings(book);
  await flush();
  const second = lookupContentWarnings({
    title: "Other Book",
    authors: ["Other Author"],
  });
  await flush();
  assert.equal(upstreamRequests.length, 1);
  body.resolve();
  assert.equal((await first).status, "not_found");
  assert.equal((await second).status, "not_found");
  assert.equal(upstreamRequests.length, 2);
});

test("SRC-05-T-1 times out source requests after five seconds", async (t) => {
  mockTimeouts(t);
  let upstreamSignal: AbortSignal | undefined;
  stubUpstream((_, init) => {
    assert.ok(init?.signal);
    const signal = init.signal;
    upstreamSignal = signal;
    return htmlBody(() => untilAborted(signal));
  });
  let finished = false;
  const lookup = lookupContentWarnings(book).finally(() => {
    finished = true;
  });
  await flush();
  t.mock.timers.tick(4_999);
  await flush();
  assert.equal(finished, false);
  assert.equal(upstreamSignal?.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(upstreamSignal?.aborted, true);
  assert.equal((await lookup).status, "unavailable");
  assert.equal(upstreamRequests.length, 1);
});

test("SRC-05-T-1 limits queued lookups to twenty seconds", async (t) => {
  mockTimeouts(t);
  stubUpstream((_, init) => {
    assert.ok(init?.signal);
    return untilAborted(init.signal);
  });
  const results = Array.from({ length: 8 }, (_, index) =>
    lookupContentWarnings({ title: `Book ${index}`, authors: ["Author"] }),
  );
  for (let step = 0; step < 4; step++) {
    await flush();
    t.mock.timers.tick(5_000);
    await flush();
  }
  assert.ok(
    (await Promise.all(results)).every(
      (result) => result.status === "unavailable",
    ),
  );
  assert.ok(upstreamRequests.length <= 4);
});

test(
  "SRC-05-T-1 cancels source reads when the client disconnects",
  { timeout: 5_000 },
  async () => {
    const reading = new Promise<AbortSignal>((resolve) => {
      stubUpstream((url, init) => {
        if (url.origin === openLibrary) return workResponse(url);
        assert.ok(init?.signal);
        const signal = init.signal;
        return htmlBody(() => {
          resolve(signal);
          return untilAborted(signal);
        });
      });
    });
    const caller = new AbortController();
    const response = originalFetch(
      `${baseUrl}/api/books/content-warnings?key=${work.key}`,
      { signal: caller.signal },
    );
    const rejected = assert.rejects(response, { name: "AbortError" });
    const signal = await reading;
    const aborted = new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    caller.abort();
    await rejected;
    await aborted;
    assert.equal(countRequests(source), 1);
  },
);

test("SRC-05-T-3 rejects invalid warning exclusions without upstream calls", async () => {
  stubUpstream(() => assert.fail("No upstream call expected"));
  for (const query of [
    "q=books&excludeWarning=Unknown",
    "q=books&excludeWarning=pregnancy&excludeWarning=Unknown",
  ]) {
    const response = await originalFetch(
      `${baseUrl}/api/books/search?${query}`,
    );
    const body = (await response.json()) as { error: string };
    assert.equal(response.status, 400);
    assert.equal(typeof body.error, "string");
  }
  assert.equal(upstreamRequests.length, 0);
});

test("SRC-05-T-3 combines exclusions using cached search metadata", async () => {
  const coffeeBook = {
    key: "/works/OL1W",
    title: book.title,
    author_name: book.authors,
  };
  const gatsbyBook = {
    key: "/works/OL2W",
    title: "The Great Gatsby",
    author_name: ["F Scott Fitzgerald"],
  };
  stubUpstream((url) => {
    if (url.origin === openLibrary) {
      assert.equal(url.pathname, "/search.json");
      assert.equal(
        url.searchParams.get("q"),
        '(books) AND NOT subject:"horror"',
      );
      return json({ docs: [coffeeBook, gatsbyBook], numFound: 45 });
    }
    assert.equal(url.origin, source);
    if (url.pathname === "/") {
      return html(
        url.searchParams.get("s") === book.title
          ? search()
          : search(
              result(gatsbyBook.title, gatsbyBook.author_name[0], gatsbyPath),
            ),
      );
    }
    return html(url.pathname === coffeePath ? coffee : gatsby);
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await originalFetch(
      `${baseUrl}/api/books/search?q=books&excludeGenre=Horror&excludeWarning=self-harm&excludeWarning=pregnancy&excludeWarning=`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      books: [{ ...gatsbyBook, warningStatus: "found" }],
      total: 45,
      hasMore: true,
      totalIsExact: false,
    });
  }
  assert.equal(upstreamRequests[0]?.origin, openLibrary);
  assert.equal(countRequests(openLibrary), 2);
  assert.equal(countRequests(source), 4);
});

test("SRC-05-T-3 keeps missing and unavailable warning information with its status", async () => {
  const books = [
    { key: "/works/OL1W", title: "No Entry", author_name: ["Author"] },
    { key: "/works/OL2W", title: "Source Down", author_name: ["Author"] },
    { key: "/works/OL3W", title: "Unknown Author" },
  ];
  stubUpstream((url) => {
    if (url.origin === openLibrary) {
      assert.equal(url.pathname, "/search.json");
      return json({ docs: books, numFound: books.length });
    }
    assert.equal(url.origin, source);
    return url.searchParams.get("s") === "No Entry"
      ? html(noResults)
      : html("Unavailable", 503);
  });

  const response = await originalFetch(
    `${baseUrl}/api/books/search?q=books&excludeWarning=pregnancy`,
  );
  const body = (await response.json()) as BookSearchResponse;
  assert.equal(response.status, 200);
  assert.deepEqual(
    body.books.map((book) => book.key),
    books.map((book) => book.key),
  );
  assert.deepEqual(
    body.books.map((book) => book.warningStatus),
    ["not_found", "unavailable", "unavailable"],
  );
  assert.equal(body.totalIsExact, false);
  assert.equal(countRequests(openLibrary), 1);
  assert.equal(countRequests(source), 2);
});

test("SRC-05-T-3 preserves upstream continuation on an empty filtered page", async () => {
  stubUpstream((url) => {
    if (url.origin === openLibrary) {
      assert.equal(url.pathname, "/search.json");
      assert.equal(url.searchParams.get("page"), "2");
      return json({
        docs: [
          { key: "/works/OL1W", title: book.title, author_name: book.authors },
        ],
        numFound: 45,
      });
    }
    assert.equal(url.origin, source);
    return html(url.pathname === "/" ? search() : coffee);
  });

  const response = await originalFetch(
    `${baseUrl}/api/books/search?q=books&page=2&excludeWarning=pregnancy`,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    books: [],
    total: 45,
    hasMore: true,
    totalIsExact: false,
  });
  assert.equal(countRequests(openLibrary), 1);
});

test("SRC-05-T-3 bounds warning work without discarding unfinished books", async (t) => {
  mockTimeouts(t);
  let sourceSignal: AbortSignal | undefined;
  stubUpstream((url, init) => {
    assert.equal(url.origin, source);
    assert.ok(init?.signal);
    const signal = init.signal;
    sourceSignal = signal;
    return htmlBody(() => untilAborted(signal));
  });
  const books = Array.from({ length: 6 }, (_, index) => ({
    key: `/works/OL${index}W`,
    title: `Book ${index}`,
    author_name: ["Author"],
  }));
  const lookup = filterSearchWarnings(
    books,
    ["pregnancy"],
    new AbortController().signal,
  );
  for (let step = 0; step < 4; step++) {
    await flush();
    t.mock.timers.tick(5_000);
    await flush();
  }

  const kept = await lookup;
  assert.deepEqual(
    kept.map((book) => book.key),
    books.map((book) => book.key),
  );
  assert.ok(kept.some((book) => book.warningStatus === "unavailable"));
  assert.ok(kept.some((book) => book.warningStatus === "not_checked"));
  assert.equal(sourceSignal?.aborted, true);
  assert.ok(upstreamRequests.length <= 4);
});

test(
  "SRC-05-T-3 cancels search and warning requests on disconnect",
  { timeout: 5_000 },
  async () => {
    for (const phase of ["search", "warnings"]) {
      const reading = new Promise<AbortSignal>((resolve) => {
        stubUpstream((url, init) => {
          if (phase === "warnings" && url.origin === openLibrary) {
            return json({
              docs: [
                {
                  key: "/works/OL1W",
                  title: book.title,
                  author_name: book.authors,
                },
              ],
              numFound: 1,
            });
          }
          assert.ok(init?.signal);
          resolve(init.signal);
          return untilAborted(init.signal);
        });
      });
      const caller = new AbortController();
      const response = originalFetch(
        `${baseUrl}/api/books/search?q=books&excludeWarning=pregnancy`,
        { signal: caller.signal },
      );
      const rejected = assert.rejects(response, { name: "AbortError" });
      const signal = await reading;
      const aborted = new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      caller.abort();
      await rejected;
      await aborted;
      assert.equal(upstreamRequests.length, phase === "search" ? 1 : 2);
    }
  },
);
