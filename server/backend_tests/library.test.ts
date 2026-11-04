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

// send a GET request to /api/library
async function getLibrary(token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `session=${token}`);

  return fetch(`${baseUrl}/api/library`, { headers });
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

// send a PATCH request to update /api/library/:id/reading-status
async function patchReadingStatus(
  id: number | string,
  body: unknown,
  token?: string,
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `session=${token}`);

  return fetch(`${baseUrl}/api/library/${id}/reading-status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body) ?? "",
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

test("COL-02-T-2 includes reading status in the signed-in user's library", async () => {
  const user = await createSignedInUser();
  const otherUser = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);
  const otherUsersBook = await createSavedBook(otherUser.token);

  const updateResponse = await patchReadingStatus(
    savedBook.id,
    { readingStatus: "currently_reading" },
    user.token,
  );
  assert.equal(updateResponse.status, 200);

  const response = await getLibrary(user.token);
  assert.equal(response.status, 200);
  const data = (await response.json()) as {
    books: {
      id: number;
      bookKey: string;
      createdAt: string;
      readingStatus: string;
    }[];
  };

  assert.equal(data.books.length, 1);
  assert.deepEqual(Object.keys(data.books[0] ?? {}).sort(), [
    "bookKey",
    "createdAt",
    "id",
    "readingStatus",
  ]);
  assert.equal(data.books[0]?.id, savedBook.id);
  assert.equal(data.books[0]?.bookKey, savedBook.bookKey);
  assert.equal(data.books[0]?.readingStatus, "currently_reading");
  assert.equal(
    data.books.some((book) => book.id === otherUsersBook.id),
    false,
  );
});

test("COL-02-T-3 updates a saved book's reading status", async () => {
  // create test user and saved book
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);

  // send patch request to update reading status
  const response = await patchReadingStatus(
    savedBook.id,
    { readingStatus: "currently_reading" },
    user.token,
  );
  const body = (await response.json()) as {
    id: number;
    readingStatus: string;
  };

  // check response and db
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    id: savedBook.id,
    readingStatus: "currently_reading",
  });

  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, savedBook.id);
  assert.equal(rows[0]?.userId, user.id);
  assert.equal(rows[0]?.readingStatus, "currently_reading");
});

test("COL-02-T-3 allows changing between all supported statuses", async () => {
  // create test user and saved book + validate initial reading status
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);
  const [initialRow] = await rowsForBook(savedBook.bookKey);
  assert.ok(initialRow);
  assert.equal(initialRow.readingStatus, "to_be_read");

  // iterate through all valid reading statuses and update the saved book's status
  for (const readingStatus of ["to_be_read", "currently_reading", "finished"]) {
    const response = await patchReadingStatus(
      savedBook.id,
      { readingStatus },
      user.token,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: savedBook.id,
      readingStatus,
    });

    const rows = await rowsForBook(savedBook.bookKey);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.readingStatus, readingStatus);
  }

  // try repeating same reading status update; ensure it succeeds and does not create a new row
  const repeatedResponse = await patchReadingStatus(
    savedBook.id,
    { readingStatus: "finished" },
    user.token,
  );
  assert.equal(repeatedResponse.status, 200);
  assert.deepEqual(await repeatedResponse.json(), {
    id: savedBook.id,
    readingStatus: "finished",
  });

  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, initialRow.id);
  assert.equal(rows[0]?.userId, initialRow.userId);
  assert.equal(rows[0]?.bookKey, initialRow.bookKey);
  assert.equal(rows[0]?.createdAt.getTime(), initialRow.createdAt.getTime());
  assert.equal(rows[0]?.readingStatus, "finished");
});

test("COL-02-T-3 rejects an unauthenticated status update", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);

  // send patch request without a session token
  const response = await patchReadingStatus(savedBook.id, {
    readingStatus: "finished",
  });

  // assert failure and that reading status remains unchanged in db
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not logged in" });
  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.readingStatus, "to_be_read");
});

test("COL-02-T-3 rejects invalid saved-book IDs", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);

  // iterate through list of invalid IDs and send patch requests; assert 400 status and error message for each
  for (const invalidId of [
    "abc",
    "0",
    "-1",
    "1.5",
    "2147483648",
    "9007199254740992",
  ]) {
    const response = await patchReadingStatus(
      invalidId,
      { readingStatus: "finished" },
      user.token,
    );
    assert.equal(response.status, 400, `Expected ${invalidId} to be rejected`);
    assert.deepEqual(await response.json(), {
      error: "Invalid saved book ID",
    });
  }

  // ensure book's reading status remains unchanged in db
  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, savedBook.id);
  assert.equal(rows[0]?.readingStatus, "to_be_read");
});

test("COL-02-T-3 rejects invalid reading statuses", async () => {
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);
  const invalidBodies: unknown[] = [
    {},
    { readingStatus: null },
    { readingStatus: 1 },
    { readingStatus: "on_hold" },
    { readingStatus: "finished", unexpected: true },
  ];

  // iterate through list of invalid request bodies and send patch requests; assert 400 status and error message for each
  for (const body of invalidBodies) {
    const response = await patchReadingStatus(savedBook.id, body, user.token);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Invalid reading status",
    });
  }

  // ensure book's reading status remains unchanged in db
  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.readingStatus, "to_be_read");
});

test("COL-02-T-3 does not update another user's saved book", async () => {
  const requester = await createSignedInUser();
  const owner = await createSignedInUser();
  const savedBook = await createSavedBook(owner.token);

  // send patch request to update reading status of another user's saved book
  const response = await patchReadingStatus(
    savedBook.id,
    { readingStatus: "finished" },
    requester.token,
  );

  // assert failure and that reading status remains unchanged in db
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Book not found in your library",
  });
  const rows = await rowsForBook(savedBook.bookKey);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.userId, owner.id);
  assert.equal(rows[0]?.readingStatus, "to_be_read");
});

test("COL-02-T-3 returns not found for a missing saved book", async () => {
  // save book, then delete it
  const user = await createSignedInUser();
  const savedBook = await createSavedBook(user.token);
  const deleteResponse = await deleteBook(savedBook.id, user.token);
  assert.equal(deleteResponse.status, 204);

  // attempt to update reading status of the deleted book
  const response = await patchReadingStatus(
    savedBook.id,
    { readingStatus: "finished" },
    user.token,
  );

  // assert failure and that no rows exist in db for this book key
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Book not found in your library",
  });
  assert.equal((await rowsForBook(savedBook.bookKey)).length, 0);
});
