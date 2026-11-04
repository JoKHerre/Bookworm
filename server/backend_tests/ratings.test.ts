import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import {
  assertTestDatabaseUrl,
  cookieParser,
  createTestBookKey,
  eq,
  express,
} from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  { bookRatings, users },
  { createSession, generateSessionToken },
  { loadSession },
  { ratingsRouter },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/auth/middleware.ts"),
  import("../src/routes/ratings.ts"),
]);

// trackers
const createdUserIds = new Set<number>();
let emailCounter = 0;
let server: Server;
let baseUrl: string;

// insert a temporary user and session, then return the user's ID and session token
async function createSignedInUser() {
  emailCounter += 1;
  const email = `ratings-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "test-only-password-hash" })
    .returning({ id: users.id });

  assert.ok(user, "Expected PostgreSQL to create a test user");
  createdUserIds.add(user.id);

  const token = generateSessionToken();
  await createSession(token, user.id);
  return { id: user.id, token };
}

// send a PUT request to /api/ratings; include a session cookie if a token is provided
async function putRating(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `session=${token}`);

  return fetch(`${baseUrl}/api/ratings`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body) ?? "",
  });
}

// send a GET request to /api/ratings; include a session cookie if a token is provided
async function getRatings(token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `session=${token}`);
  return fetch(`${baseUrl}/api/ratings`, { headers });
}

// return all rating rows for a given bookKey
async function rowsForBook(bookKey: string) {
  return db.select().from(bookRatings).where(eq(bookRatings.bookKey, bookKey));
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/api/ratings", ratingsRouter);
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Internal server error" });
  });

  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
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

test("COL-04-T-3 rejects an unauthenticated rating", async () => {
  const bookKey = createTestBookKey();
  const response = await putRating({ bookKey, rating: 4 });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not logged in" });
  assert.equal((await rowsForBook(bookKey)).length, 0);
});

test("COL-04-T-3 saves a new rating for the signed-in user", async () => {
  const user = await createSignedInUser();
  const bookKey = createTestBookKey();
  const response = await putRating({ bookKey, rating: 4 }, user.token);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { bookKey, rating: 4 });

  const rows = await rowsForBook(bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.userId, user.id);
  assert.equal(rows[0]?.rating, 4);
});

test("COL-04-T-3 updates an existing rating without a duplicate row", async () => {
  const user = await createSignedInUser();
  const bookKey = createTestBookKey();

  await putRating({ bookKey, rating: 2 }, user.token);
  const [original] = await rowsForBook(bookKey);

  const response = await putRating({ bookKey, rating: 5 }, user.token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { bookKey, rating: 5 });

  const rows = await rowsForBook(bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, original?.id);
  assert.equal(rows[0]?.rating, 5);
  assert.deepEqual(rows[0]?.createdAt, original?.createdAt);
  assert.ok(rows[0]!.updatedAt >= original!.updatedAt);
});

test("COL-04-T-3 rejects invalid ratings", async () => {
  const user = await createSignedInUser();
  const bookKey = createTestBookKey();

  for (const rating of [0, 6, -1, 2.5, "4", null, undefined]) {
    const response = await putRating({ bookKey, rating }, user.token);
    assert.equal(response.status, 400, `rating ${String(rating)}`);
    assert.deepEqual(await response.json(), { error: "Invalid rating" });
  }
  assert.equal((await rowsForBook(bookKey)).length, 0);
});

test("COL-04-T-3 rejects invalid book keys and extra fields", async () => {
  const user = await createSignedInUser();
  const other = await createSignedInUser();
  const bookKey = createTestBookKey();

  for (const body of [
    { rating: 3 },
    { bookKey: null, rating: 3 },
    { bookKey: "not-a-key", rating: 3 },
    { bookKey, rating: 3, userId: other.id },
  ]) {
    const response = await putRating(body, user.token);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid rating" });
  }
  assert.equal((await rowsForBook(bookKey)).length, 0);
});

test("COL-04-T-3 keeps ratings separate for different users", async () => {
  const first = await createSignedInUser();
  const second = await createSignedInUser();
  const bookKey = createTestBookKey();

  assert.equal(
    (await putRating({ bookKey, rating: 1 }, first.token)).status,
    200,
  );
  assert.equal(
    (await putRating({ bookKey, rating: 5 }, second.token)).status,
    200,
  );

  const rows = await rowsForBook(bookKey);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.userId === first.id)?.rating, 1);
  assert.equal(rows.find((row) => row.userId === second.id)?.rating, 5);
});

test("COL-04-T-4 rejects an unauthenticated ratings list", async () => {
  const response = await getRatings();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not logged in" });
});

test("COL-04-T-4 lists only the signed-in user's ratings", async () => {
  const first = await createSignedInUser();
  const second = await createSignedInUser();
  const emptyUser = await createSignedInUser();
  const firstBook = createTestBookKey();
  const secondBook = createTestBookKey();

  await putRating({ bookKey: firstBook, rating: 3 }, first.token);
  await putRating({ bookKey: secondBook, rating: 5 }, first.token);
  await putRating({ bookKey: firstBook, rating: 1 }, second.token);

  const response = await getRatings(first.token);
  assert.equal(response.status, 200);
  const { ratings } = (await response.json()) as {
    ratings: { bookKey: string; rating: number }[];
  };
  assert.deepEqual(
    ratings.sort((a, b) => a.rating - b.rating),
    [
      { bookKey: firstBook, rating: 3 },
      { bookKey: secondBook, rating: 5 },
    ],
  );

  const emptyResponse = await getRatings(emptyUser.token);
  assert.deepEqual(await emptyResponse.json(), { ratings: [] });
});

test("COL-04-T-4 lists an updated rating once with its latest value", async () => {
  const user = await createSignedInUser();
  const bookKey = createTestBookKey();

  await putRating({ bookKey, rating: 2 }, user.token);
  await putRating({ bookKey, rating: 4 }, user.token);

  const response = await getRatings(user.token);
  assert.deepEqual(await response.json(), {
    ratings: [{ bookKey, rating: 4 }],
  });
});
