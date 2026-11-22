import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import {
  assertTestDatabaseUrl,
  createTestBookKey,
  eq,
  startTestServer,
} from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  { bookRatings, savedBooks, userGenres, users },
  { createSession, generateSessionToken },
  { createApp },
  { clearOpenLibraryCache },
  { recommendationsResponse },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/app.ts"),
  import("../src/services/openLibrary.ts"),
  import("../../shared/books.ts"),
]);

type Genre = typeof userGenres.$inferInsert.genre;

const originalFetch = globalThis.fetch;
const createdUserIds = new Set<number>();
let emailCounter = 0;
let closeServer: () => Promise<void>;
let baseUrl: string;
let upstreamRequests: URL[];

async function createSignedInUser(genres: Genre[] = []) {
  emailCounter += 1;
  const email = `recommendations-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "test-only-password-hash" })
    .returning({ id: users.id });

  assert.ok(user, "Expected PostgreSQL to create a test user");
  createdUserIds.add(user.id);
  if (genres.length > 0) {
    await db
      .insert(userGenres)
      .values(genres.map((genre) => ({ userId: user.id, genre })));
  }

  const token = generateSessionToken();
  await createSession(token, user.id);
  return { id: user.id, token };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// docs per Open Library subject; a Response replaces the whole reply
function stubSubjects(bySubject: Record<string, unknown[] | Response>) {
  upstreamRequests = [];
  clearOpenLibraryCache();
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://openlibrary.org");
    assert.equal(url.pathname, "/search.json");
    upstreamRequests.push(url);
    const subject = /^subject:"(.*)"$/.exec(url.searchParams.get("q") ?? "");
    const reply = bySubject[subject?.[1] ?? ""] ?? [];
    return reply instanceof Response ? reply : json({ docs: reply });
  };
}

// books titled "<genre> 1", "<genre> 2", ... keyed /works/OL<firstId>W onward
function books(genre: string, count: number, firstId: number) {
  return Array.from({ length: count }, (_, i) => ({
    key: `/works/OL${firstId + i}W`,
    title: `${genre} ${i + 1}`,
  }));
}

async function getRecommendations(token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `session=${token}`);
  return originalFetch(`${baseUrl}/api/recommendations`, { headers });
}

async function recommendedTitles(token: string) {
  const response = await getRecommendations(token);
  assert.equal(response.status, 200);
  const body = recommendationsResponse.parse(await response.json());
  return body.books.map(({ title }) => title);
}

before(async () => {
  ({ baseUrl, close: closeServer } = await startTestServer(createApp()));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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

test("DIS-01-T-2 alternates between liked genres", async () => {
  const { token } = await createSignedInUser(["Mystery", "Fantasy"]);
  stubSubjects({
    fantasy: books("Fantasy", 10, 100),
    mystery: books("Mystery", 10, 200),
  });

  const titles = await recommendedTitles(token);
  assert.deepEqual(titles, [
    "Fantasy 1",
    "Mystery 1",
    "Fantasy 2",
    "Mystery 2",
    "Fantasy 3",
    "Mystery 3",
    "Fantasy 4",
    "Mystery 4",
    "Fantasy 5",
    "Mystery 5",
    "Fantasy 6",
    "Mystery 6",
  ]);
});

test("DIS-01-T-2 sends one rated subject search per genre", async () => {
  const { token } = await createSignedInUser(["Non-fiction", "Sci-fi"]);
  stubSubjects({});

  await recommendedTitles(token);
  const queries = upstreamRequests.map((url) => url.searchParams.get("q"));
  assert.deepEqual(queries.sort(), [
    'subject:"nonfiction"',
    'subject:"science fiction"',
  ]);
  for (const url of upstreamRequests) {
    assert.equal(url.searchParams.get("sort"), "rating");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(
      url.searchParams.get("fields"),
      "key,title,author_name,first_publish_year,cover_i",
    );
  }
});

test("DIS-01-T-2 skips duplicates and malformed records", async () => {
  const { token } = await createSignedInUser(["Fantasy", "Horror"]);
  stubSubjects({
    fantasy: [
      { key: "OL1W", title: "Bare Key", cover_i: 7 },
      { key: "/books/OL2M", title: "Edition Key" },
      { key: "/works/OL3W", title: "  " },
      { key: "/works/OL4W", title: "Bad Year", first_publish_year: "1999" },
      { title: "No Key" },
      { key: "/works/OL5W", title: "Shared" },
    ],
    horror: [
      { key: "/works/OL5W", title: "Shared" },
      { key: "/works/OL6W", title: "Horror Only", author_name: ["A. Writer"] },
    ],
  });

  const response = await getRecommendations(token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    books: [
      { key: "/works/OL1W", title: "Bare Key", cover_i: 7 },
      { key: "/works/OL5W", title: "Shared" },
      { key: "/works/OL6W", title: "Horror Only", author_name: ["A. Writer"] },
    ],
  });
});

test("DIS-01-T-2 leaves out saved and rated books", async () => {
  const user = await createSignedInUser(["Poetry"]);
  const [saved, rated, kept] = [
    createTestBookKey(),
    createTestBookKey(),
    createTestBookKey(),
  ];
  await db.insert(savedBooks).values({ userId: user.id, bookKey: saved });
  await db
    .insert(bookRatings)
    .values({ userId: user.id, bookKey: rated, rating: 2 });
  stubSubjects({
    poetry: [
      { key: saved, title: "Saved" },
      { key: rated, title: "Rated" },
      { key: kept, title: "Kept" },
    ],
  });

  assert.deepEqual(await recommendedTitles(user.token), ["Kept"]);
});

test("DIS-01-T-2 returns nothing without liked genres", async () => {
  const { token } = await createSignedInUser();
  stubSubjects({ fantasy: books("Fantasy", 3, 100) });

  const response = await getRecommendations(token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { books: [] });
  assert.equal(upstreamRequests.length, 0);
});

test("DIS-01-T-2 caches genre results", async () => {
  const first = await createSignedInUser(["Fantasy", "Romance"]);
  const second = await createSignedInUser(["Fantasy"]);
  stubSubjects({ fantasy: books("Fantasy", 2, 100) });

  await recommendedTitles(first.token);
  await recommendedTitles(first.token);
  assert.deepEqual(await recommendedTitles(second.token), [
    "Fantasy 1",
    "Fantasy 2",
  ]);
  assert.equal(upstreamRequests.length, 2);
});

test("DIS-01-T-2 skips a failed genre", async () => {
  const { token } = await createSignedInUser(["Fantasy", "Thriller"]);
  stubSubjects({
    fantasy: json({ error: "down" }, 500),
    thriller: [{ key: "/works/OL9W", title: "Still Here" }],
  });

  assert.deepEqual(await recommendedTitles(token), ["Still Here"]);
});

test("DIS-01-T-2 reports when every genre fails", async () => {
  const { token } = await createSignedInUser(["Fantasy", "Thriller"]);
  stubSubjects({
    fantasy: json({ error: "down" }, 500),
    thriller: new Response("not json"),
  });

  const response = await getRecommendations(token);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "Unable to retrieve recommendations",
  });
});

test("DIS-01-T-2 requires login", async () => {
  stubSubjects({});
  const response = await getRecommendations();
  assert.equal(response.status, 401);
  assert.equal(upstreamRequests.length, 0);
});
