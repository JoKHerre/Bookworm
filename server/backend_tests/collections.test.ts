import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ErrorRequestHandler } from "express";
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
  { collectionBooks, collections, savedBooks, sessions, users },
  { createSession, generateSessionToken },
  { loadSession },
  { collectionsRouter },
  { libraryRouter },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/auth/middleware.ts"),
  import("../src/routes/collections.ts"),
  import("../src/routes/library.ts"),
]);

const userIds: number[] = [];
let server: Server;
let baseUrl: string;
const collectionsPath = "/api/collections";

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use(collectionsPath, collectionsRouter);
  app.use("/api/library", libraryRouter);
  const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = typeof error?.status === "number" ? error.status : 500;
    if (status >= 500) console.error(error);
    res
      .status(status)
      .json({ error: status >= 500 ? "Internal server error" : "Bad request" });
  };
  app.use(errorHandler);
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
      for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    } finally {
      await pool.end();
    }
  }
});

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

async function createCollection(userId: number, name = "Favorites") {
  const [collection] = await db
    .insert(collections)
    .values({ userId, name })
    .returning();
  assert.ok(collection);
  return collection;
}

async function saveBook(userId: number, bookKey = createTestBookKey()) {
  const [book] = await db
    .insert(savedBooks)
    .values({ userId, bookKey, readingStatus: "currently_reading" })
    .returning();
  assert.ok(book);
  return book;
}

function addMembership(
  collectionId: number,
  book: Awaited<ReturnType<typeof saveBook>>,
) {
  return db
    .insert(collectionBooks)
    .values({ collectionId, savedBookId: book.id, userId: book.userId });
}

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

function bookResponse(book: Awaited<ReturnType<typeof saveBook>>) {
  return {
    id: book.id,
    bookKey: book.bookKey,
    readingStatus: book.readingStatus,
    createdAt: book.createdAt.toISOString(),
  };
}

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

async function assertError(response: Response, status: number, error: string) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
}

async function assertNoContent(response: Response) {
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
}

test("COL-05-T-5 requires a valid session for all routes", async () => {
  const user = await createSignedInUser();
  const expiredUser = await createSignedInUser();
  await db
    .update(sessions)
    .set({ expiresAt: new Date(0) })
    .where(eq(sessions.id, expiredUser.sessionId));
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  await addMembership(collection.id, book);
  const before = await storedRows(user.id);
  const path = `${collectionsPath}/${collection.id}`;

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
  assert.deepEqual(await storedRows(user.id), before);
  assert.deepEqual(await storedRows(expiredUser.id), {
    collections: [],
    books: [],
    memberships: [],
  });
});

test("COL-05-T-5 lists owned collections and counts", async () => {
  const user = await createSignedInUser();
  const other = await createSignedInUser();
  const emptyUser = await createSignedInUser();
  const populated = await createCollection(user.id, "Zoo");
  const foreign = await createCollection(other.id);
  const empty = await createCollection(user.id, "Art");
  await addMembership(populated.id, await saveBook(user.id));
  await addMembership(populated.id, await saveBook(user.id));
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

test("COL-05-T-5 reports membership for a work key", async () => {
  const user = await createSignedInUser();
  const other = await createSignedInUser();
  const book = await saveBook(user.id);
  const otherBook = await saveBook(other.id, book.bookKey);
  const populated = await createCollection(user.id);
  const empty = await createCollection(user.id, "Empty");
  const foreign = await createCollection(other.id);
  await addMembership(populated.id, book);
  await addMembership(populated.id, await saveBook(user.id));
  await addMembership(foreign.id, otherBook);
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
      ],
    });
  }
});

test("COL-05-T-5 creates an empty collection with a trimmed name", async () => {
  const user = await createSignedInUser();
  const name = "📚".repeat(100);
  const response = await request("POST", collectionsPath, user.token, {
    name: `\t ${name}\n`,
  });
  assert.equal(response.status, 201);
  const stored = await storedRows(user.id);
  assert.equal(stored.collections.length, 1);
  const [collection] = stored.collections;
  assert.ok(collection && collection.id > 0);
  assert.equal(collection.name, name);
  assert.deepEqual(await response.json(), collectionSummary(collection, 0));
  assert.deepEqual(stored.memberships, []);
});

test("COL-05-T-5 rejects invalid names, IDs, and work keys", async () => {
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  const path = `${collectionsPath}/${collection.id}`;
  const before = await storedRows(user.id);
  for (const body of [
    {},
    { name: null },
    { name: 5 },
    { name: " \t\n" },
    { name: "x".repeat(101) },
    { name: "a\0b" },
    { name: "Valid", userId: user.id },
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
  for (const id of ["0", "-1", "1.5", "1e2", "NaN", "2147483648"]) {
    await assertError(
      await request("GET", `${collectionsPath}/${id}`, user.token),
      400,
      "Invalid collection ID",
    );
    await assertError(
      await request("DELETE", `${path}/books/${id}`, user.token),
      400,
      "Invalid saved book ID",
    );
  }
  for (const body of [
    {},
    { bookKey: null },
    { bookKey: "invalid" },
    { bookKey: book.bookKey, userId: user.id },
  ]) {
    await assertError(
      await request("POST", `${path}/books`, user.token, body),
      400,
      "Invalid book key",
    );
  }
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
  const malformed = await fetch(`${baseUrl}${collectionsPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `session=${user.token}`,
    },
    body: "{",
  });
  await assertError(malformed, 400, "Bad request");
  assert.deepEqual(await storedRows(user.id), before);
});

test("COL-05-T-5 scopes name conflicts to an owner", async () => {
  const user = await createSignedInUser();
  const other = await createSignedInUser();
  await createCollection(user.id);
  const second = await createCollection(user.id, "Second");
  const before = await storedRows(user.id);
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
  const response = await request("POST", collectionsPath, other.token, {
    name: "Favorites",
  });
  assert.equal(response.status, 201);
  assert.equal((await storedRows(other.id)).collections[0]?.name, "Favorites");
  assert.deepEqual(await storedRows(user.id), before);
});

test("COL-05-T-5 opens empty and populated collections", async () => {
  const user = await createSignedInUser();
  const empty = await createCollection(user.id, "Empty");
  const populated = await createCollection(user.id);
  const first = await saveBook(user.id);
  const second = await saveBook(user.id);
  await saveBook(user.id);
  await addMembership(populated.id, second);
  await addMembership(populated.id, first);
  for (const [collection, books] of [
    [empty, []],
    [populated, [bookResponse(first), bookResponse(second)]],
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
});

test("COL-05-T-5 renames a collection without changing membership", async () => {
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  await addMembership(collection.id, await saveBook(user.id));
  const before = await storedRows(user.id);
  for (const name of ["Summer Reading", "SUMMER READING"]) {
    const response = await request(
      "PATCH",
      `${collectionsPath}/${collection.id}`,
      user.token,
      { name },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      await response.json(),
      collectionSummary({ ...collection, name }, 1),
    );
  }
  const after = await storedRows(user.id);
  assert.deepEqual(after, {
    ...before,
    collections: [{ ...collection, name: "SUMMER READING" }],
  });
});

test("COL-05-T-5 adds one saved book to multiple collections", async () => {
  const user = await createSignedInUser();
  const first = await createCollection(user.id);
  const second = await createCollection(user.id, "Second");
  const book = await saveBook(user.id);
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
  const stored = await storedRows(user.id);
  assert.deepEqual(stored.books, [book]);
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

test("COL-05-T-5 rejects a duplicate membership", async () => {
  const user = await createSignedInUser();
  const collection = await createCollection(user.id);
  const book = await saveBook(user.id);
  const path = `${collectionsPath}/${collection.id}/books`;
  const body = { bookKey: book.bookKey };
  assert.equal((await request("POST", path, user.token, body)).status, 201);
  const before = await storedRows(user.id);
  await assertError(
    await request("POST", path, user.token, body),
    409,
    "Book is already in this collection",
  );
  assert.equal(before.memberships.length, 1);
  assert.deepEqual(await storedRows(user.id), before);
});

async function createTwoMemberships() {
  const user = await createSignedInUser();
  const first = await createCollection(user.id);
  const second = await createCollection(user.id, "Second");
  const book = await saveBook(user.id);
  await addMembership(first.id, book);
  await addMembership(second.id, book);
  return { user, first, second, book };
}

test("COL-05-T-5 removes only the specified membership", async () => {
  const { user, first, book } = await createTwoMemberships();
  const before = await storedRows(user.id);
  const path = `${collectionsPath}/${first.id}/books/${book.id}`;
  await assertNoContent(await request("DELETE", path, user.token));
  await assertError(
    await request("DELETE", path, user.token),
    404,
    "Collection membership not found",
  );
  assert.deepEqual(await storedRows(user.id), {
    ...before,
    memberships: before.memberships.filter(
      ({ collectionId }) => collectionId !== first.id,
    ),
  });
});

test("COL-05-T-5 deletes a collection without deleting saved books", async () => {
  const { user, first, second } = await createTwoMemberships();
  const before = await storedRows(user.id);
  await assertNoContent(
    await request("DELETE", `${collectionsPath}/${first.id}`, user.token),
  );
  assert.deepEqual(await storedRows(user.id), {
    ...before,
    collections: [second],
    memberships: before.memberships.filter(
      ({ collectionId }) => collectionId !== first.id,
    ),
  });
});

test("COL-05-T-5 hides missing and foreign resources", async () => {
  const { user, first, book } = await createTwoMemberships();
  const foreign = await createTwoMemberships();
  const before = await storedRows(user.id);
  const foreignBefore = await storedRows(foreign.user.id);
  for (const id of [2_147_483_647, foreign.first.id]) {
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
  await assertError(
    await request(
      "DELETE",
      `${collectionsPath}/${first.id}/books/${foreign.book.id}`,
      user.token,
    ),
    404,
    "Collection membership not found",
  );
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
