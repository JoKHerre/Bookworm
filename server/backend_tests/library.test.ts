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

// load db connection, schema, session helpers, library router, and drizzle eq helper
const [
  { db, pool },
  { savedBooks, users },
  { createSession, generateSessionToken },
  { loadSession },
  { libraryRouter },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/auth/middleware.ts"),
  import("../src/routes/library.ts"),
]);

// trackers
const createdUserIds = new Set<number>();
let emailCounter = 0;
let server: Server;
let baseUrl: string;

// insert a temporary user with a unique email and a placeholder password hash, then return new user's ID and a session token
async function createSignedInUser() {
  emailCounter += 1;
  const email = `library-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
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

// send a POST request to /api/library
// if session token provided include it in a cookie header, else request is unauthenticated
async function postBook(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `session=${token}`);

  return fetch(`${baseUrl}/api/library`, {
    method: "POST",
    headers,
    body: JSON.stringify(body) ?? "",
  });
}

async function createSavedBook(token: string) {
  const bookKey = createTestBookKey();
  const response = await postBook({ bookKey }, token);
  assert.equal(response.status, 201);
  const savedBook = (await response.json()) as { id: number };
  return { bookKey, id: savedBook.id };
}

// send a DELETE request to /api/library/:id
async function deleteBook(id: number | string, token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `session=${token}`);

  return fetch(`${baseUrl}/api/library/${id}`, {
    method: "DELETE",
    headers,
  });
}

// return all rows in saved_books for a given bookKey
async function rowsForBook(bookKey: string) {
  return db.select().from(savedBooks).where(eq(savedBooks.bookKey, bookKey));
}

// before tests, create an express app with the necessary installations
before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/api/library", libraryRouter);
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Internal server error" });
  });

  // listen on a random port on localhost, and store the server instance and base URL for use in tests
  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });

  // ensure server is listening and has a valid address
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

// after tests, close the server and db connection, and delete any remaining test users
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

// test: unauthenticated request (no login session) should be rejected with 401 and no row created
test("COL-01-T-3 rejects an unauthenticated save", async () => {
  // create book key and send POST request without a session token
  const bookKey = createTestBookKey();
  const response = await postBook({ bookKey });

  // check for 401 status and error msg, and that no rows were created in saved_books with this book key
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not logged in" });
  assert.equal((await rowsForBook(bookKey)).length, 0);
});

// test: save a book for a signed-in user
test("COL-01-T-3 saves a book for the signed-in user", async () => {
  // create signed-in user and book key, and send POST request with book key and user's session token
  const user = await createSignedInUser();
  const bookKey = createTestBookKey();
  const response = await postBook({ bookKey }, user.token);
  const body = (await response.json()) as {
    id: number;
    userId: number;
    bookKey: string;
    createdAt: string;
  };

  // check for 201 status and validate keys and values in response body
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(body).sort(), [
    "bookKey",
    "createdAt",
    "id",
    "userId",
  ]);
  assert.equal(body.id > 0, true);
  assert.equal(body.userId, user.id);
  assert.equal(body.bookKey, bookKey);
  assert.equal(Number.isNaN(Date.parse(body.createdAt)), false);

  // check that one row was created in saved_books with correct user id and book key
  const rows = await rowsForBook(bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.userId, user.id);
});

// test: reject invalid/malformed book keys
test("COL-01-T-3 rejects invalid book keys", async () => {
  // create signed-in user and sample request bodies with invalid book keys (don't follow correct format)
  const user = await createSignedInUser();
  const invalidBodies = [
    {},
    { bookKey: null },
    { bookKey: 123 },
    { bookKey: "/authors/OL123A" },
  ];

  // for each body, send POST request and check for 400 status and error message
  for (const body of invalidBodies) {
    const response = await postBook(body, user.token);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid book key" });
  }
});

// test: do not accept user id supplied by client
test("COL-01-T-3 does not accept a client-supplied user ID", async () => {
  // create two signed in users and a book key
  const signedInUser = await createSignedInUser();
  const otherUser = await createSignedInUser();
  const bookKey = createTestBookKey();

  // send POST request with book key and second user id using first user's session token
  const response = await postBook(
    { bookKey, userId: otherUser.id },
    signedInUser.token,
  );

  // expect 400 status and error msg (treats this extra user id field as an invalid book key)
  // check that no rows were created in saved_books with this book key
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid book key" });
  assert.equal((await rowsForBook(bookKey)).length, 0);
});

// test: reject duplicate book saves for same user
test("COL-01-T-3 rejects a duplicate save", async () => {
  // create user and book key
  const user = await createSignedInUser();
  const bookKey = createTestBookKey();

  // send same request twice
  const firstResponse = await postBook({ bookKey }, user.token); // should pass
  const duplicateResponse = await postBook({ bookKey }, user.token); // should fail

  // assert first succeeded with 201, and second failed with 409 and error msg
  assert.equal(firstResponse.status, 201);
  assert.equal(duplicateResponse.status, 409);
  assert.deepEqual(await duplicateResponse.json(), {
    error: "Book is already in your library",
  });

  // check only one row was added to saved_books for this book key
  assert.equal((await rowsForBook(bookKey)).length, 1);
});

// test: allow different users to save the same book
test("COL-01-T-3 allows different users to save the same book", async () => {
  // create two users and a book key
  const firstUser = await createSignedInUser();
  const secondUser = await createSignedInUser();
  const bookKey = createTestBookKey();

  // send separate requests, same book, different user tokens
  const firstResponse = await postBook({ bookKey }, firstUser.token);
  const secondResponse = await postBook({ bookKey }, secondUser.token);
  const rows = await rowsForBook(bookKey);

  // check that both requests succeeded with 201
  // and check that two rows were created in saved_books with correct user ids
  assert.equal(firstResponse.status, 201);
  assert.equal(secondResponse.status, 201);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.userId).sort(),
    [firstUser.id, secondUser.id].sort(),
  );
});

test("COL-03 removes a saved book from its owner's library", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);
  const response = await deleteBook(savedBook.id, user.token);

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal((await rowsForBook(savedBook.bookKey)).length, 0);
});

test("COL-03 rejects an unauthenticated removal and preserves the row", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);

  const response = await deleteBook(savedBook.id);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not logged in" });
  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.userId, user.id);
});

test("COL-03 does not let a user remove another user's saved book", async () => {
  const requester = await createSignedInUser();
  const owner = await createSignedInUser();
  const savedBook = await createSavedBook(owner.token);

  const response = await deleteBook(savedBook.id, requester.token);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Book not found in your library",
  });
  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.userId, owner.id);
});

test("COL-03 rejects invalid IDs without changing the library", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);

  for (const invalidId of ["abc", "0", "-1", "1.5", "2147483648"]) {
    const response = await deleteBook(invalidId, user.token);
    assert.equal(response.status, 400, `Expected ${invalidId} to be rejected`);
    assert.deepEqual(await response.json(), {
      error: "Invalid saved book ID",
    });
  }

  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, savedBook.id);
});

test("COL-03 returns not found for a missing row and repeated removal", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);

  const firstResponse = await deleteBook(savedBook.id, user.token);
  assert.equal(firstResponse.status, 204);

  const repeatedResponse = await deleteBook(savedBook.id, user.token);
  assert.equal(repeatedResponse.status, 404);
  assert.deepEqual(await repeatedResponse.json(), {
    error: "Book not found in your library",
  });
  assert.equal((await rowsForBook(savedBook.bookKey)).length, 0);
});
