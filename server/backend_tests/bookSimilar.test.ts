import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, afterEach, before, test } from "node:test";
import express from "express";
import { similarBooksResponse } from "../../shared/books.ts";
import { booksRouter } from "../src/routes/books.ts";
import { getSimilarBooks } from "../src/services/openLibrary.ts";

const originalFetch = globalThis.fetch;
const workKey = "/works/OL1W";
const sourceWork = {
  key: workKey,
  title: "Source Book",
  subjects: ["Fantasy", "Adventure", "Friendship"],
};
let server: Server;
let baseUrl: string;
let upstreamRequests: URL[];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function stubOpenLibrary(
  respond: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  upstreamRequests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://openlibrary.org");
    upstreamRequests.push(url);
    return respond(url, init);
  };
}

function stubBooks(docs: unknown[], work: unknown = sourceWork) {
  stubOpenLibrary((url) => {
    if (url.pathname === `${workKey}.json`) return json(work);
    assert.equal(url.pathname, "/search.json");
    return json({ docs });
  });
}

function get(
  query: string | URLSearchParams = new URLSearchParams({ key: workKey }),
) {
  return originalFetch(`${baseUrl}/api/books/similar?${query}`);
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

// Criteria 1 and 3: the route exposes usable card data in a deterministic order.
test("DIS-02-T-1 returns six ranked unique canonical books", async () => {
  const docs = [
    { key: workKey, title: "Source", subject: sourceWork.subjects },
    { key: "OL2W", title: "Same title", subject: ["Fantasy"] },
    { key: "/works/OL10W", title: " same   TITLE ", subject: ["FANTASY"] },
    {
      key: "/works/OL3W",
      title: "Higher overlap",
      subject: ["Fantasy", "Adventure"],
    },
    { key: "/works/OL4W", title: "Beta", subject: ["Fantasy"] },
    { key: "/works/OL5W", title: "Gamma", subject: ["Fantasy"] },
    { key: "/works/OL6W", title: "Delta", subject: ["Fantasy"] },
    { key: "/works/OL7W", title: "Epsilon", subject: ["Fantasy"] },
    { key: "/works/OL8W", title: "Unrelated", subject: ["Fantasy fiction"] },
  ];

  for (const candidates of [docs, [...docs].reverse()]) {
    stubBooks(candidates);
    const response = await get();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(similarBooksResponse.safeParse(body).success, true);
    assert.deepEqual(body, {
      books: [
        { key: "/works/OL3W", title: "Higher overlap" },
        { key: "/works/OL4W", title: "Beta" },
        { key: "/works/OL6W", title: "Delta" },
        { key: "/works/OL7W", title: "Epsilon" },
        { key: "/works/OL5W", title: "Gamma" },
        { key: "/works/OL10W", title: " same   TITLE " },
      ],
    });
  }
});

// Criterion 2: selection uses source order, including ordinary broad subjects.
test("DIS-02-T-1 selects the first three usable normalized subjects", async () => {
  const boundary = "x".repeat(40);
  stubBooks([], {
    ...sourceWork,
    subjects: [
      " SOURCE   BOOK ",
      "",
      " ",
      "x".repeat(41),
      "nyt:fiction",
      "  FICTION ",
      "fiction",
      " Science   Fiction ",
      boundary,
      "Adventure",
    ],
  });
  assert.deepEqual(await (await get()).json(), { books: [] });
  assert.equal(upstreamRequests.length, 2);
  const params = upstreamRequests[1]!.searchParams;
  assert.equal(
    params.get("q"),
    `subject:("fiction" OR "science fiction" OR "${boundary}")`,
  );
  assert.equal(
    params.get("fields"),
    "key,title,author_name,first_publish_year,cover_i,subject",
  );
  assert.deepEqual([...params.keys()].sort(), ["fields", "q"]);
});

test("DIS-02-T-1 treats punctuation in subjects as literal query text", async () => {
  stubBooks([], { ...sourceWork, subjects: ['Say "hello"', "Paths\\Maps"] });
  await get();
  assert.equal(
    upstreamRequests[1]!.searchParams.get("q"),
    'subject:("say \\"hello\\"" OR "paths\\\\maps")',
  );
});

test("DIS-02-T-1 skips malformed candidates and allows optional display metadata", async () => {
  const book = { key: "/works/OL2W", title: "A book", subject: ["Fantasy"] };
  stubBooks([
    null,
    { ...book, key: "/books/OL2M" },
    { ...book, title: "   " },
    { ...book, subject: "Fantasy" },
    { ...book, subject: [1] },
    { ...book, author_name: "Author" },
    { ...book, first_publish_year: "2000" },
    { ...book, cover_i: "123" },
    { ...book, subject: undefined },
    book,
    {
      key: "OL3W",
      title: "With metadata",
      subject: ["Fantasy"],
      author_name: ["Author"],
      first_publish_year: 2000,
      cover_i: 123,
    },
  ]);
  assert.deepEqual(await (await get()).json(), {
    books: [
      { key: "/works/OL2W", title: "A book" },
      {
        key: "/works/OL3W",
        title: "With metadata",
        author_name: ["Author"],
        first_publish_year: 2000,
        cover_i: 123,
      },
    ],
  });
});

test("DIS-02-T-1 keeps the first qualifying duplicate work", async () => {
  stubBooks([
    { key: "OL2W", title: "Unrelated", subject: ["Cooking"] },
    { key: "/works/OL2W", title: "First qualifying", subject: ["Fantasy"] },
    {
      key: "OL2W",
      title: "Later higher overlap",
      subject: sourceWork.subjects,
    },
  ]);
  assert.deepEqual(await (await get()).json(), {
    books: [{ key: "/works/OL2W", title: "First qualifying" }],
  });
});

test("DIS-02-T-1 counts distinct exact matches across all candidate subjects", async () => {
  const filler = Array.from(
    { length: 20 },
    (_, index) => `Other subject ${index}`,
  );
  stubBooks([
    {
      key: "/works/OL2W",
      title: "A duplicated match",
      subject: ["Fantasy", "fantasy", " FANTASY "],
    },
    {
      key: "/works/OL3W",
      title: "Z two matches",
      subject: [...filler, " ADVENTURE ", "  FriendSHIP "],
    },
    { key: "/works/OL4W", title: "Near match", subject: ["Fantasy fiction"] },
  ]);
  assert.deepEqual(await (await get()).json(), {
    books: [
      { key: "/works/OL3W", title: "Z two matches" },
      { key: "/works/OL2W", title: "A duplicated match" },
    ],
  });
});

// Criterion 4: sparse metadata and empty pools remain successful empty results.
test("DIS-02-T-1 skips candidate search without usable source subjects", async () => {
  for (const subjects of [
    undefined,
    [],
    [" ", "Source Book", "x".repeat(41), "technical:tag"],
  ]) {
    stubBooks([], { ...sourceWork, subjects });
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { books: [] });
    assert.equal(upstreamRequests.length, 1);
  }
});

test("DIS-02-T-1 returns empty results without unrelated fallback", async () => {
  for (const docs of [
    [],
    [
      null,
      { key: workKey, title: "Source", subject: ["Fantasy"] },
      { key: "OL2W", title: "Other", subject: ["Cooking"] },
    ],
  ]) {
    stubBooks(docs);
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { books: [] });
    assert.equal(upstreamRequests.length, 2);
  }
});

// Criteria 5-7: input errors, missing sources, and upstream failures stay distinct.
test("DIS-02-T-1 rejects invalid keys without upstream calls", async () => {
  stubBooks([]);
  for (const query of [
    "",
    "key=",
    "key=/books/OL1M",
    "key=OL1W",
    "key=/works/OLxW",
    "key=/works/OL1W&key=/works/OL2W",
    "key=https://example.com",
    "key[other]=/works/OL1W",
  ]) {
    const response = await get(query);
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), { error: "Invalid book key" });
  }
  assert.equal(upstreamRequests.length, 0);
});

test("DIS-02-T-1 distinguishes a missing source work", async () => {
  stubOpenLibrary(() => json(null, 404));
  const response = await get();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Book not found" });
  assert.equal(upstreamRequests.length, 1);
});

test("DIS-02-T-1 reports upstream and malformed-response failures", async () => {
  const failures = [
    () => json(null, 500),
    () => json(null, 429),
    () => {
      throw new TypeError("Network unavailable");
    },
    () => new Response("invalid JSON"),
    () => json({}),
    () => json({ ...sourceWork, subjects: "Fantasy" }),
    () => json({ ...sourceWork, key: "/works/OL999W" }),
    () => json({ ...sourceWork, title: " " }),
  ];
  for (const fail of failures) {
    stubOpenLibrary(fail);
    const response = await get();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "Unable to retrieve similar books",
    });
    assert.equal(upstreamRequests.length, 1);
  }

  for (const fail of [
    () => json(null, 404),
    () => json(null, 503),
    () => {
      throw new TypeError("Search network unavailable");
    },
    () => new Response("invalid JSON"),
    () => json({}),
    () => json({ docs: "invalid" }),
    () => json({ docs: null }),
  ]) {
    stubOpenLibrary((url) =>
      url.pathname === `${workKey}.json` ? json(sourceWork) : fail(),
    );
    const response = await get();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "Unable to retrieve similar books",
    });
    assert.equal(upstreamRequests.length, 2);
  }
});

// Criterion 8: no candidate detail, author, edition, or availability fan-out.
test("DIS-02-T-1 makes only a source request and one candidate search", async () => {
  const docs = Array.from({ length: 100 }, (_, index) => ({
    key: `OL${index + 2}W`,
    title: `Book ${index}`,
    subject: ["Fantasy"],
  }));
  stubBooks(docs);
  assert.equal((await get()).status, 200);
  assert.deepEqual(
    upstreamRequests.map((url) => url.pathname),
    [`${workKey}.json`, "/search.json"],
  );
});

test("DIS-02-T-1 applies one deadline through candidate body reads", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const candidateReading = new Promise<AbortSignal>((resolve) => {
    stubOpenLibrary((url, init) => {
      assert.ok(init?.signal);
      const signal = init.signal;
      if (url.pathname === `${workKey}.json`) {
        return Object.assign(new Response(), {
          json: async () => {
            t.mock.timers.tick(4000);
            return sourceWork;
          },
        });
      }
      t.mock.timers.tick(4000);
      return Object.assign(new Response(), {
        json: () => {
          resolve(signal);
          return untilAborted(signal);
        },
      });
    });
  });

  const outcome = getSimilarBooks(workKey);
  const rejected = assert.rejects(outcome, {
    name: "Error",
    message: "Similar books lookup timed out",
  });
  const candidateSignal = await candidateReading;
  t.mock.timers.tick(1999);
  assert.equal(candidateSignal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(candidateSignal.aborted, true);
  await rejected;
  assert.equal(upstreamRequests.length, 2);
});

test("DIS-02-T-1 returns 502 when the overall deadline expires", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = new Promise<void>((resolve) => {
    stubOpenLibrary((_url, init) => {
      assert.ok(init?.signal);
      resolve();
      return untilAborted(init.signal);
    });
  });
  const response = get();
  await started;
  t.mock.timers.tick(10000);
  const result = await response;
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), {
    error: "Unable to retrieve similar books",
  });
  assert.equal(upstreamRequests.length, 1);
});

// Criterion 9: cancellation stops work while a fetch or body read is pending.
test("DIS-02-T-1 cancels active fetches and does not start the search", async () => {
  const caller = new AbortController();
  let upstreamSignal: AbortSignal | undefined;
  stubOpenLibrary((_url, init) => {
    assert.ok(init?.signal);
    upstreamSignal = init.signal;
    return untilAborted(init.signal);
  });
  const result = getSimilarBooks(workKey, caller.signal);
  assert.equal(upstreamRequests.length, 1);
  caller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(upstreamSignal?.aborted, true);
  assert.equal(upstreamRequests.length, 1);
});

test(
  "DIS-02-T-1 aborts source body reads when the client disconnects",
  { timeout: 5000 },
  async () => {
    const caller = new AbortController();
    const reading = new Promise<AbortSignal>((resolve) => {
      stubOpenLibrary((_url, init) => {
        assert.ok(init?.signal);
        const signal = init.signal;
        return Object.assign(new Response(), {
          json: () => {
            resolve(signal);
            return untilAborted(signal);
          },
        });
      });
    });

    const response = originalFetch(
      `${baseUrl}/api/books/similar?key=${workKey}`,
      { signal: caller.signal },
    );
    const rejected = assert.rejects(response, { name: "AbortError" });
    const signal = await reading;
    const aborted = new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
    caller.abort();
    await rejected;
    await aborted;
    assert.equal(upstreamRequests.length, 1);
  },
);
