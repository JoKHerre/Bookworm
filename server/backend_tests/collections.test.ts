import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import type { ReadingStatus } from "../../shared/readingStatus.ts";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { assertTestDatabaseUrl, createTestBookKey, eq } from "./test-utils.ts";

// confirm that test db url is set
assertTestDatabaseUrl();

const [
  { db, pool },
  { collectionBooks, collections, savedBooks, sessions, users },
  { createSession, generateSessionToken },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
]);

const userIds: number[] = [];
let server: ChildProcess;
let baseUrl: string;
const collectionsPath = "/api/collections";

// runs once before all tests
before(async () => {
  // Reserve an available port, then launch the real entry point so route mounts
  // and middleware order are exercised by every endpoint test.
  
  // find an available port by creating a temporary server and listening on port 0
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => {
    reservation.close((error) => (error ? reject(error) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${address.port}`;
  
  // spawn the server process with the reserved port in the environment
  server = spawn(
    process.execPath,
    [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    {
      env: { ...process.env, PORT: String(address.port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout!.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr!.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const deadline = Date.now() + 10_000;
  while (
    !output.includes(`API listening on http://localhost:${address.port}`)
  ) {
    assert.equal(server.exitCode, null, `API exited during startup: ${output}`);
    assert.ok(Date.now() < deadline, `API did not start: ${output}`);
    await delay(20);
  }
});

// runs once after all tests
after(async () => {
  try {
    // stop backend server if it is still running
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  } finally {
    try {
      // delete any temporary users created during tests
      for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    } finally {
      await pool.end();
    }
  }
});

// helper: create a signed-in user and return their ID, session token, and session ID
async function createSignedInUser() {
  const [user] = await db
    .insert(users)
    .values({
      email: `collection-${randomUUID()}@example.test`,
      passwordHash: "test-only-password-hash",
    })
    .returning({ id: users.id });
  assert.ok(user);
  userIds.push(user.id);
  const token = generateSessionToken();
  const session = await createSession(token, user.id);
  return { id: user.id, token, sessionId: session.id };
}

// helper: create a collection owned by specified user and return the collection row
async function createCollection(userId: number, name = "Favorites") {
  const [collection] = await db
    .insert(collections)
    .values({ userId, name })
    .returning();
  assert.ok(collection);
  return collection;
}

// helper: create a saved book for specified user and return the saved book row
async function saveBook(
  userId: number,
  bookKey = createTestBookKey(),
  readingStatus: ReadingStatus = "currently_reading",
) {
  const [book] = await db
    .insert(savedBooks)
    .values({ userId, bookKey, readingStatus })
    .returning();
  assert.ok(book);
  return book;
}

// helper: add a saved book to a collection and return the collection_books row
function addMembership(
  collectionId: number,
  book: Awaited<ReturnType<typeof saveBook>>,
) {
  return db
    .insert(collectionBooks)
    .values({ collectionId, savedBookId: book.id, userId: book.userId });
}

// helper: return all collections, saved books, and collection_books memberships for a user
// used to compare db state before and after a test
async function storedRows(userId: number) {
  const [ownedCollections, books, memberships] = await Promise.all([
    db
      .select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(collections.id),
    db
      .select()
      .from(savedBooks)
      .where(eq(savedBooks.userId, userId))
      .orderBy(savedBooks.id),
    db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, userId))
      .orderBy(collectionBooks.collectionId, collectionBooks.savedBookId),
  ]);
  return { collections: ownedCollections, books, memberships };
}

// helper: return a collection summary object for API responses
function collectionSummary(
  collection: Awaited<ReturnType<typeof createCollection>>,
  bookCount: number,
) {
  return {
    id: collection.id,
    name: collection.name,
    createdAt: collection.createdAt.toISOString(),
    bookCount,
  };
}

// helper: return a saved book object for API responses
function bookResponse(book: Awaited<ReturnType<typeof saveBook>>) {
  return {
    id: book.id,
    bookKey: book.bookKey,
    readingStatus: book.readingStatus,
    createdAt: book.createdAt.toISOString(),
  };
}

// helper: make HTTP request
function request(method: string, path: string, token?: string, body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `session=${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

// helper: assert that a response has the expected status and error message
async function assertError(response: Response, status: number, error: string) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
}

// helper: assert that a response has 204 No Content status and an empty body
async function assertNoContent(response: Response) {
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
}

// test functions

// test requests without a valid session
test("COL-05-T-5 requires a valid session for all routes", async () => {
  // create a signed-in user and an expired session user
  const user = await createSignedInUser();
  const expiredUser = await createSignedInUser();
  await db
    .update(sessions)
    .set({ expiresAt: new Date(0) })
    .where(eq(sessions.id, expiredUser.sessionId));
  
  // create a collection with a saved book for the signed-in user
  // to have real data to test unauthorized access against
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  await addMembership(collection.id, book);
  const before = await storedRows(user.id);
  const path = `${collectionsPath}/${collection.id}`;

  // test all routes without a valid session (no token, invalid token, or expired token)
  for (const token of [undefined, "invalid-session", expiredUser.token]) {
    for (const [method, url, body] of [
      ["GET", collectionsPath],
      ["POST", collectionsPath, { name: "New" }],
      ["GET", path],
      ["PATCH", path, { name: "Renamed" }],
      ["DELETE", path],
      ["POST", `${path}/books`, { bookKey: book.bookKey }],
      ["DELETE", `${path}/books/${book.id}`],
    ] as const) {
      await assertError(
        await request(method, url, token, body),
        401,
        "Not logged in",
      );
    }
  }
  
  // confirm that the database state has not changed for either user
  assert.deepEqual(await storedRows(user.id), before);
  assert.deepEqual(await storedRows(expiredUser.id), {
    collections: [],
    books: [],
    memberships: [],
  });
});

// test GET /api/collections returns only the collections owned by the signed-in user
test("COL-05-T-5 lists owned collections and counts", async () => {
  // create three users: 
  // one with two collections (one populated, one empty), 
  // one with one empty collection, and one with no collections
  const user = await createSignedInUser();
  const other = await createSignedInUser();
  const emptyUser = await createSignedInUser();
  const populated = await createCollection(user.id, "Zoo");
  const foreign = await createCollection(other.id);
  const empty = await createCollection(user.id, "Art");
  await addMembership(populated.id, await saveBook(user.id));
  await addMembership(populated.id, await saveBook(user.id));
  
  // test that each user sees only their own collections with the correct book counts
  // using a GET request to the collectionsPath
  for (const [owner, expected] of [
    [user, [collectionSummary(populated, 2), collectionSummary(empty, 0)]],
    [other, [collectionSummary(foreign, 0)]],
    [emptyUser, []],
  ] as const) {
    const response = await request("GET", collectionsPath, owner.token);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { collections: expected });
  }
});

// test GET /api/collections?bookKey=... correctly reports which collections contain a specified bookKey
test("COL-05-T-5 reports membership for a work key", async () => {
  // create a user and save the book of interest
  const user = await createSignedInUser();
  const book = await saveBook(user.id);
  
  // create three collections for the user: one populated with two books, one empty, and one unrelated with one book
  // only populated has the book of interest
  const populated = await createCollection(user.id);
  const empty = await createCollection(user.id, "Empty");
  const unrelated = await createCollection(user.id, "Other Books");
  await addMembership(populated.id, book);
  await addMembership(populated.id, await saveBook(user.id));
  await addMembership(unrelated.id, await saveBook(user.id));
  
  // test target bookKey and non-saved bookKey for the user
  // confirm only populated collection reports containsBook: true, others false
  for (const [bookKey, containsBook] of [
    [book.bookKey, true],
    [createTestBookKey(), false],
  ] as const) {
    const response = await request(
      "GET",
      `${collectionsPath}?${new URLSearchParams({ bookKey })}`,
      user.token,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      collections: [
        { ...collectionSummary(populated, 2), containsBook },
        { ...collectionSummary(empty, 0), containsBook: false },
        { ...collectionSummary(unrelated, 1), containsBook: false },
      ],
    });
  }
});

// test that collection creation trims whitespace from the name and rejects invalid names
test("COL-05-T-5 creates an empty collection with a trimmed name", async () => {
  const user = await createSignedInUser();
  
  // test valid names with added leaded and trailing whitespace
  for (const name of [
    "A",  // minimum accepted length (1 char)
    "x".repeat(100),  // maximum accepted length (100 chars)
    "📚".repeat(100),  // unicode points
    "Summer Reading — 2026!", // punctuation
  ]) {
    const response = await request("POST", collectionsPath, user.token, {
      name: `\t ${name}\n`,  // added whitespace
    });

    // assert successful creation and that collection has trimmed name
    assert.equal(response.status, 201);
    const stored = await storedRows(user.id);
    const collection = stored.collections.find((row) => row.name === name);
    assert.ok(collection && collection.id > 0);
    assert.ok(Number.isFinite(collection.createdAt.getTime()));
    assert.deepEqual(await response.json(), collectionSummary(collection, 0));
    assert.deepEqual(stored.memberships, []);
  }
  assert.equal((await storedRows(user.id)).collections.length, 4);
});

// test that invalid requests are rejected with correct errors
test("COL-05-T-5 rejects invalid names, IDs, and work keys", async () => {
  // create valid user, collection, and saved book
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  const path = `${collectionsPath}/${collection.id}`;
  const before = await storedRows(user.id);
  
  // test invalid collection names for creation and update
  for (const body of [
    undefined,  // no body
    {},  // no name field
    { name: "" },  // empty name string
    { name: null },  // non-string name
    { name: 5 },  // non-string name
    { name: " \t\n" },  // becomes empty after trimming
    { name: "x".repeat(101) },  // too long
    { name: "a\0b" },  // NUL character
  ]) {
    await assertError(
      await request("POST", collectionsPath, user.token, body),
      400,
      "Invalid collection name",
    );
    await assertError(
      await request("PATCH", path, user.token, body),
      400,
      "Invalid collection name",
    );
  }

  // test invalid collection IDs for all routes that take a collection ID
  for (const id of ["0", "-1", "1.5", "1e2", "NaN", "2147483648"]) {
    const invalidPath = `${collectionsPath}/${id}`;
    for (const [method, url, body] of [
      ["GET", invalidPath],
      ["PATCH", invalidPath, { name: "Renamed" }],
      ["DELETE", invalidPath],
      ["POST", `${invalidPath}/books`, { bookKey: book.bookKey }],
      ["DELETE", `${invalidPath}/books/${book.id}`],
    ] as const) {
      await assertError(
        await request(method, url, user.token, body),
        400,
        "Invalid collection ID",
      );
    }

    // use same values to test invalid saved book ID deletion
    await assertError(
      await request("DELETE", `${path}/books/${id}`, user.token),
      400,
      "Invalid saved book ID",
    );
  }

  // test invalid bookKeys for adding book to collection
  for (const body of [
    undefined,
    {},
    { bookKey: null },
    { bookKey: 5 },
    { bookKey: "invalid" },
    { bookKey: book.bookKey, userId: user.id },
  ]) {
    await assertError(
      await request("POST", `${path}/books`, user.token, body),
      400,
      "Invalid book key",
    );
  }

  // test invalid bookKeys for GET request
  for (const query of [
    "bookKey=invalid",
    `bookKey=${book.bookKey}&bookKey=${book.bookKey}`,
    "userId=1",
  ]) {
    await assertError(
      await request("GET", `${collectionsPath}?${query}`, user.token),
      400,
      "Invalid book key",
    );
  }

  // test malformed JSON body for collection creation
  const malformed = await fetch(`${baseUrl}${collectionsPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `session=${user.token}`,
    },
    body: "{",
  });
  await assertError(malformed, 400, "Bad request");

  // confirm that the database state has not changed
  assert.deepEqual(await storedRows(user.id), before);
});

// test that one user must have distinct collection names, while different users can use the same name
test("COL-05-T-5 scopes name conflicts to an owner", async () => {
  // create two users
  const user = await createSignedInUser();
  const other = await createSignedInUser();
  
  // give first user two collections
  await createCollection(user.id);
  const second = await createCollection(user.id, "Second");
  const before = await storedRows(user.id);
  
  // test that creating new collection or updating second collection with duplicate name fails
  const body = { name: " favorites " };
  await assertError(
    await request("POST", collectionsPath, user.token, body),
    409,
    "Collection name already exists",
  );
  await assertError(
    await request("PATCH", `${collectionsPath}/${second.id}`, user.token, body),
    409,
    "Collection name already exists",
  );

  // test that other user can create a collection with the same name
  const response = await request("POST", collectionsPath, other.token, {
    name: "Favorites",
  });
  assert.equal(response.status, 201);
  assert.equal((await storedRows(other.id)).collections[0]?.name, "Favorites");

  // assert first user's collections are unchanged by failed requests
  assert.deepEqual(await storedRows(user.id), before);
});

// test that GET /api/collections/:id returns the correct collection summary and list of books
test("COL-05-T-5 opens empty and populated collections", async () => {
  // create a user, one empty collection, 
  // and one populated collection (w two books of different reading statuses)
  const user = await createSignedInUser();
  const empty = await createCollection(user.id, "Empty");
  const populated = await createCollection(user.id);
  const first = await saveBook(user.id, createTestBookKey(), "to_be_read");
  const second = await saveBook(user.id, createTestBookKey(), "finished");

  // create another collection with a different book
  const otherCollection = await createCollection(user.id, "Other Collection");
  const otherBook = await saveBook(user.id);
  
  // (adding books to correct collections)
  await addMembership(otherCollection.id, otherBook);
  await addMembership(populated.id, second);
  await addMembership(populated.id, first);
  
  // check that each collection returns correct summary and list of books
  for (const [collection, books] of [
    [empty, []],
    [populated, [bookResponse(first), bookResponse(second)]],
    [otherCollection, [bookResponse(otherBook)]],
  ] as const) {
    const response = await request(
      "GET",
      `${collectionsPath}/${collection.id}`,
      user.token,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      collection: collectionSummary(collection, books.length),
      books,
    });
  }

  // update reading status of first book and confirm that the collection reflects the change
  await db
    .update(savedBooks)
    .set({ readingStatus: "currently_reading" })
    .where(eq(savedBooks.id, first.id));
  const refreshed = await request(
    "GET",
    `${collectionsPath}/${populated.id}`,
    user.token,
  );
  assert.equal(refreshed.status, 200);
  assert.deepEqual(await refreshed.json(), {
    collection: collectionSummary(populated, 2),
    books: [
      bookResponse({ ...first, readingStatus: "currently_reading" }),
      bookResponse(second),
    ],
  });
});

// test that rename attempt only changes collection name and nothing else
test("COL-05-T-5 renames a collection without changing membership", async () => {
  // create a user with two populated collections
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  await addMembership(collection.id, await saveBook(user.id));
  const other = await createCollection(user.id, "Other Collection");
  await addMembership(other.id, await saveBook(user.id));
  await addMembership(other.id, await saveBook(user.id));
  const before = await storedRows(user.id);
  
  // attempt rename of first collection twice
  for (const name of ["Summer Reading", "SUMMER READING"]) {
    const response = await request(
      "PATCH",
      `${collectionsPath}/${collection.id}`,
      user.token,
      { name },
    );
    // confirm that rename was successful
    assert.equal(response.status, 200);
    assert.deepEqual(
      await response.json(),
      collectionSummary({ ...collection, name }, 1),
    );
  }

  // confirm that only name has changed; everything else is the same
  const after = await storedRows(user.id);
  assert.deepEqual(after, {
    ...before,
    collections: [{ ...collection, name: "SUMMER READING" }, other],
  });
});

// test that same book can be saved to different collections
test("COL-05-T-5 adds one saved book to multiple collections", async () => {
  // create user, two collections, and three saved books
  const user = await createSignedInUser();
  const first = await createCollection(user.id);
  const second = await createCollection(user.id, "Second");
  const earlierBook = await saveBook(user.id);
  const book = await saveBook(user.id);
  const laterBook = await saveBook(user.id);
  
  // add book to each collection
  for (const { id } of [first, second]) {
    const response = await request(
      "POST",
      `${collectionsPath}/${id}/books`,
      user.token,
      { bookKey: book.bookKey },
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), bookResponse(book));
  }

  // confirm correct memberships for book, and that other saved books are unaffected
  const stored = await storedRows(user.id);
  assert.deepEqual(stored.books, [earlierBook, book, laterBook]);
  assert.deepEqual(
    stored.memberships.map(({ collectionId, savedBookId }) => [
      collectionId,
      savedBookId,
    ]),
    [
      [first.id, book.id],
      [second.id, book.id],
    ],
  );
});

// test that a book cannot be added to the same collection twice
test("COL-05-T-5 rejects a duplicate membership", async () => {
  // create user, collection, and saved book
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  
  // add book to collection, assert success
  const path = `${collectionsPath}/${collection.id}/books`;
  const body = { bookKey: book.bookKey };
  assert.equal((await request("POST", path, user.token, body)).status, 201);
  const before = await storedRows(user.id);
  
  // assert that attempt to add same book again fails
  await assertError(
    await request("POST", path, user.token, body),
    409,
    "Book is already in this collection",
  );

  // assert that book was only saved to collection once
  assert.equal(before.memberships.length, 1);
  assert.deepEqual(await storedRows(user.id), before);
});

// helper: create a signed-in user, two collections, and a saved book, 
// and add the book to both collections
async function createTwoMemberships() {
  const user = await createSignedInUser();
  const first = await createCollection(user.id);
  const second = await createCollection(user.id, "Second");
  const book = await saveBook(user.id);
  await addMembership(first.id, book);
  await addMembership(second.id, book);
  return { user, first, second, book };
}

// test that deleting a membership only removes the specified membership
test("COL-05-T-5 removes only the specified membership", async () => {
  // create one book in two collections + add another book to first collection
  const { user, first, book } = await createTwoMemberships();
  const otherBook = await saveBook(user.id);
  await addMembership(first.id, otherBook);
  
  const before = await storedRows(user.id);
  const path = `${collectionsPath}/${first.id}/books/${book.id}`;
  
  // remove book from first collection
  await assertNoContent(await request("DELETE", path, user.token));
  
  // assert that another removal attempt fails
  await assertError(
    await request("DELETE", path, user.token),
    404,
    "Collection membership not found",
  );

  // assert that other memberships are unaffected
  assert.deepEqual(await storedRows(user.id), {
    ...before,
    memberships: before.memberships.filter(
      ({ collectionId, savedBookId }) =>
        collectionId !== first.id || savedBookId !== book.id,
    ),
  });
});

// test that removing a book's collection membership does not delete the saved book itself
test("COL-05-T-5 preserves a saved book after its final membership is removed", async () => {
  // create collection with one membership
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  await addMembership(collection.id, book);

  const before = await storedRows(user.id);
  assert.equal(before.memberships.length, 1);
  
  // remove membership
  await assertNoContent(
    await request(
      "DELETE",
      `${collectionsPath}/${collection.id}/books/${book.id}`,
      user.token,
    ),
  );

  // assert that the saved book and collection still exist, but the membership is gone
  assert.deepEqual(await storedRows(user.id), { ...before, memberships: [] });
  
  // assert collection can still be opened
  const response = await request(
    "GET",
    `${collectionsPath}/${collection.id}`,
    user.token,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    collection: collectionSummary(collection, 0),
    books: [],
  });
});

// test that collection deletion does not delete saved books
test("COL-05-T-5 deletes a collection without deleting saved books", async () => {
  // create two collections with same saved book
  const { user, first, second } = await createTwoMemberships();
  const before = await storedRows(user.id);
  
  // delete first collection
  await assertNoContent(
    await request("DELETE", `${collectionsPath}/${first.id}`, user.token),
  );
  
  // assert that the other collection and saved book still exist, 
  // but the deleted collection and its memberships are gone
  assert.deepEqual(await storedRows(user.id), {
    ...before,
    collections: [second],
    memberships: before.memberships.filter(
      ({ collectionId }) => collectionId !== first.id,
    ),
  });
});

// test that user cannot access collections or memberships that do not belong to them
test("COL-05-T-5 hides missing and foreign resources", async () => {
  // create for our user and a foreign user
  const { user, first, book } = await createTwoMemberships();
  const foreign = await createTwoMemberships();
  
  // snapshot both users' records
  const before = await storedRows(user.id);
  const foreignBefore = await storedRows(foreign.user.id);
  
  // for non-existent collection and the foreign collection
  for (const id of [2_147_483_647, foreign.first.id]) {
    // try opening, renaming, and deleting each collection
    const path = `${collectionsPath}/${id}`;
    for (const method of ["GET", "PATCH", "DELETE"]) {
      await assertError(
        await request(
          method,
          path,
          user.token,
          method === "PATCH" ? { name: "Renamed" } : undefined,
        ),
        404,
        "Collection not found",
      );
    }
    // try adding and removing a book from each collection
    await assertError(
      await request("POST", `${path}/books`, user.token, {
        bookKey: book.bookKey,
      }),
      404,
      "Collection or saved book not found",
    );
    await assertError(
      await request("DELETE", `${path}/books/${foreign.book.id}`, user.token),
      404,
      "Collection membership not found",
    );
  }
  // try adding a non-saved book and a foreign book to user's collection
  for (const bookKey of [createTestBookKey(), foreign.book.bookKey]) {
    await assertError(
      await request(
        "POST",
        `${collectionsPath}/${first.id}/books`,
        user.token,
        { bookKey },
      ),
      404,
      "Collection or saved book not found",
    );
  }
  // try deleting a foreign book from user's collection
  await assertError(
    await request(
      "DELETE",
      `${collectionsPath}/${first.id}/books/${foreign.book.id}`,
      user.token,
    ),
    404,
    "Collection membership not found",
  );

  // verify both users' records are unchanged after the failed attempts
  assert.deepEqual(await storedRows(user.id), before);
  assert.deepEqual(await storedRows(foreign.user.id), foreignBefore);
});


test("COL-05-T-5 reflects removal from the personal library", async () => {
  const { user, first, second, book } = await createTwoMemberships();
  await assertNoContent(
    await request("DELETE", `/api/library/${book.id}`, user.token),
  );
  for (const collection of [first, second]) {
    const response = await request(
      "GET",
      `${collectionsPath}/${collection.id}`,
      user.token,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      collection: collectionSummary(collection, 0),
      books: [],
    });
  }
  const response = await request(
    "GET",
    `${collectionsPath}?${new URLSearchParams({ bookKey: book.bookKey })}`,
    user.token,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    collections: [first, second].map((collection) => ({
      ...collectionSummary(collection, 0),
      containsBook: false,
    })),
  });
  const stored = await storedRows(user.id);
  assert.deepEqual(stored.memberships, []);
  assert.deepEqual(stored.books, []);
});

test("COL-05-T-5 handles simultaneous duplicate writes", async () => {
  const user = await createSignedInUser();
  const creates = await Promise.all(
    ["Favorites", "favorites"].map((name) =>
      request("POST", collectionsPath, user.token, { name }),
    ),
  );
  assert.deepEqual(creates.map(({ status }) => status).sort(), [201, 409]);
  await assertError(
    creates.find(({ status }) => status === 409)!,
    409,
    "Collection name already exists",
  );
  const { collections: owned } = await storedRows(user.id);
  assert.equal(owned.length, 1);
  const [collection] = owned;
  assert.ok(collection);
  const book = await saveBook(user.id);
  const adds = await Promise.all(
    [1, 2].map(() =>
      request("POST", `${collectionsPath}/${collection.id}/books`, user.token, {
        bookKey: book.bookKey,
      }),
    ),
  );
  assert.deepEqual(adds.map(({ status }) => status).sort(), [201, 409]);
  await assertError(
    adds.find(({ status }) => status === 409)!,
    409,
    "Book is already in this collection",
  );
  assert.equal((await storedRows(user.id)).memberships.length, 1);
  const second = await createCollection(user.id, "Second");
  const before = await storedRows(user.id);
  const renames = await Promise.all(
    [collection, second].map(({ id }) =>
      request("PATCH", `${collectionsPath}/${id}`, user.token, {
        name: "Shared name",
      }),
    ),
  );
  assert.deepEqual(renames.map(({ status }) => status).sort(), [200, 409]);
  await assertError(
    renames.find(({ status }) => status === 409)!,
    409,
    "Collection name already exists",
  );
  const after = await storedRows(user.id);
  assert.equal(
    after.collections.filter(({ name }) => name === "Shared name").length,
    1,
  );
  const loserIndex = renames.findIndex(({ status }) => status === 409);
  assert.deepEqual(
    after.collections[loserIndex],
    before.collections[loserIndex],
  );
  assert.deepEqual(after.books, before.books);
  assert.deepEqual(after.memberships, before.memberships);
});

test("COL-05-T-5 handles deletion during a membership add", async () => {
  for (const table of ["collections", "saved_books"] as const) {
    const user = await createSignedInUser();
    const collection = await createCollection(user.id);
    const book = await saveBook(user.id);
    const id = table === "collections" ? collection.id : book.id;
    const client = await pool.connect();
    let pendingAdd: Promise<Response> | undefined;
    try {
      await client.query("BEGIN");
      const {
        rows: [backend],
      } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      assert.ok(backend);
      // Plain reads still see the parent. The foreign-key check waits on the lock.
      await client.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [
        id,
      ]);
      pendingAdd = request(
        "POST",
        `${collectionsPath}/${collection.id}/books`,
        user.token,
        { bookKey: book.bookKey },
      );
      const deadline = Date.now() + 5_000;
      while (true) {
        const {
          rows: [activity],
        } = await pool.query<{ waiting: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE 'insert into "collection_books"%'
          ) AS waiting`,
          [backend.pid],
        );
        if (activity?.waiting) break;
        assert.ok(
          Date.now() < deadline,
          "Membership insert did not wait on the parent row",
        );
        await delay(20);
      }
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      await client.query("COMMIT");
      await assertError(
        await pendingAdd,
        404,
        "Collection or saved book not found",
      );
      assert.deepEqual((await storedRows(user.id)).memberships, []);
    } finally {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
        await pendingAdd?.catch(() => undefined);
      }
    }
  }
});
