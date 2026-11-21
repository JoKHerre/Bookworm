import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { BookSearchResult } from "../../shared/books.ts";
import { assertTestDatabaseUrl, eq, startTestServer } from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  { users },
  { createSession, generateSessionToken },
  { createApp },
  { clearOpenLibraryCache },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/app.ts"),
  import("../src/services/openLibrary.ts"),
]);

const originalFetch = globalThis.fetch;
const createdUserIds = new Set<number>();
let emailCounter = 0;
let closeServer: () => Promise<void>;
let baseUrl: string;
let token: string;
let upstreamRequests: URL[];

function stubOpenLibrary(respond: (url: URL) => Response | Promise<Response>) {
  upstreamRequests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    upstreamRequests.push(url);
    return respond(url);
  };
}

function docsResponse(docs: BookSearchResult[]) {
  return new Response(JSON.stringify({ numFound: docs.length, docs }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function book(key: string, title: string, authors: string[]): BookSearchResult {
  return { key: `/works/${key}`, title, author_name: authors };
}

function row(title: string, author = "", isbn = "") {
  return { title, author, isbn };
}

// POST /api/books/match, signed in unless signedIn is false
function postMatch(body: unknown, signedIn = true) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signedIn) headers.set("cookie", `session=${token}`);
  return originalFetch(`${baseUrl}/api/books/match`, {
    method: "POST",
    headers,
    body: JSON.stringify(body) ?? "",
  });
}

before(async () => {
  ({ baseUrl, close: closeServer } = await startTestServer(createApp()));

  emailCounter += 1;
  const email = `match-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "test-only-password-hash" })
    .returning({ id: users.id });
  assert.ok(user, "Expected PostgreSQL to create a test user");
  createdUserIds.add(user.id);
  token = generateSessionToken();
  await createSession(token, user.id);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearOpenLibraryCache();
});

after(async () => {
  try {
    await closeServer();
  } finally {
    try {
      for (const userId of createdUserIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
    } finally {
      await pool.end();
    }
  }
});

test("IMP-02-T-2 rejects an unauthenticated match", async () => {
  stubOpenLibrary(() => docsResponse([]));

  const response = await postMatch({ rows: [row("Dune")] }, false);

  assert.equal(response.status, 401);
  assert.equal(upstreamRequests.length, 0);
});

test("IMP-02-T-2 rejects invalid match bodies", async () => {
  stubOpenLibrary(() => docsResponse([]));

  const bodies: unknown[] = [
    [],
    {},
    { rows: [] },
    { rows: Array.from({ length: 26 }, () => row("Dune")) },
    { rows: [{ author: "", isbn: "" }] },
    { rows: [row("   ")] },
    { rows: [row("Dune", "", "1234567890")] },
    { rows: [{ ...row("Dune"), book_key: "/works/OL1W" }] },
    { rows: [row("Dune")], userId: 1 },
  ];
  for (const body of bodies) {
    const response = await postMatch(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), {
      error: "Invalid match request",
    });
  }
  assert.equal(upstreamRequests.length, 0);
});

test("IMP-02-T-2 matches a row by ISBN", async () => {
  const dune = book("OL1W", "Dune", ["Frank Herbert"]);
  stubOpenLibrary(() => docsResponse([dune]));

  const response = await postMatch({
    rows: [row("Some other title", "", "9780441172719")],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    results: [{ status: "matched", book: dune }],
  });
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0]?.searchParams.get("isbn"), "9780441172719");
  assert.equal(upstreamRequests[0]?.searchParams.get("title"), null);
});

test("IMP-02-T-2 falls back to title search", async () => {
  const dune = book("OL1W", "Dune", ["Frank Herbert"]);
  stubOpenLibrary((url) =>
    docsResponse(url.searchParams.has("isbn") ? [] : [dune]),
  );

  const response = await postMatch({
    rows: [row("Dune", "Frank Herbert", "9780441172719")],
  });

  assert.deepEqual(await response.json(), {
    results: [{ status: "matched", book: dune }],
  });
  const search = upstreamRequests[1]?.searchParams;
  assert.equal(search?.get("title"), "Dune");
  assert.equal(search?.get("author"), "Frank Herbert");
  assert.equal(search?.get("limit"), "10");
  assert.equal(
    search?.get("fields"),
    "key,title,author_name,first_publish_year,cover_i",
  );
});

test("IMP-02-T-2 returns ambiguous and missing rows", async () => {
  const austen = book("OL1W", "Emma", ["Jane Austen"]);
  const tennant = book("OL2W", "Emma", ["Emma Tennant"]);
  stubOpenLibrary((url) =>
    docsResponse(
      url.searchParams.get("title") === "Emma"
        ? // an edition key can't be saved, so it is dropped
          [austen, { key: "/books/OL9M", title: "Emma" }, tennant]
        : [],
    ),
  );

  const response = await postMatch({ rows: [row("Emma"), row("Nothing")] });

  assert.deepEqual(await response.json(), {
    results: [
      { status: "ambiguous", candidates: [austen, tennant] },
      { status: "none" },
    ],
  });
  assert.equal(upstreamRequests[0]?.searchParams.has("author"), false);
});

test("IMP-02-T-2 marks only failed rows", async () => {
  const dune = book("OL1W", "Dune", ["Frank Herbert"]);
  stubOpenLibrary((url) =>
    url.searchParams.get("title") === "Broken"
      ? new Response("down", { status: 500 })
      : docsResponse([dune]),
  );

  const response = await postMatch({ rows: [row("Broken"), row("Dune")] });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    results: [{ status: "failed" }, { status: "matched", book: dune }],
  });
});

test("IMP-02-T-2 keeps request order", async () => {
  const titles = ["Slow", "B", "C", "D", "E"];
  stubOpenLibrary(async (url) => {
    const title = url.searchParams.get("title")!;
    if (title === "Slow") await new Promise((r) => setTimeout(r, 50));
    return docsResponse([book(`OL${titles.indexOf(title) + 1}W`, title, [])]);
  });

  const response = await postMatch({ rows: titles.map((t) => row(t)) });
  const { results } = (await response.json()) as {
    results: { book: BookSearchResult }[];
  };

  assert.deepEqual(
    results.map((result) => result.book.title),
    titles,
  );
});
