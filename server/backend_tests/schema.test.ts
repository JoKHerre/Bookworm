import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { and } from "drizzle-orm";
import type { BookNote } from "../src/db/schema.ts";
import { assertTestDatabaseUrl, createTestBookKey, eq } from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  {
    bookRatings,
    bookNotes,
    savedBooks,
    users,
    sessions,
    collections,
    collectionBooks,
    userGenres,
  },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
]);

const createdUserIds = new Set<number>();
let emailCounter = 0;

// insert a user with a unique email and a placeholder password hash
async function createTestUser() {
  emailCounter += 1;
  const email = `schema-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "test-only-password-hash" })
    .returning({ id: users.id });

  assert.ok(user, "Expected PostgreSQL to create a test user");
  createdUserIds.add(user.id);
  return user;
}

// deleting users cascades to their rows
after(async () => {
  try {
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
  } finally {
    await pool.end();
  }
});

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;

  if ("code" in error && error.code === code) return true;

  return "cause" in error && hasPostgresErrorCode(error.cause, code);
}

test("COL-01-T-4 creates the saved-books table", async () => {
  const result = await pool.query<{
    column_name: string;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
  }>(
    `SELECT column_name, is_nullable, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'saved_books'`,
  );

  const columns = new Map(
    result.rows.map((column) => [column.column_name, column]),
  );

  assert.deepEqual([...columns.keys()].sort(), [
    "book_key",
    "created_at",
    "id",
    "reading_status",
    "user_id",
  ]);

  assert.equal(columns.get("id")?.is_nullable, "NO");
  assert.equal(columns.get("id")?.is_identity, "YES");
  assert.equal(columns.get("user_id")?.is_nullable, "NO");
  assert.equal(columns.get("book_key")?.is_nullable, "NO");
  assert.equal(columns.get("reading_status")?.is_nullable, "NO");
  assert.match(
    columns.get("reading_status")?.column_default ?? "",
    /to_be_read/,
  );
  assert.equal(columns.get("created_at")?.is_nullable, "NO");
  assert.ok(columns.get("created_at")?.column_default);

  const statuses = await pool.query<{ enumlabel: string }>(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'reading_status'
     ORDER BY e.enumsortorder`,
  );
  assert.deepEqual(
    statuses.rows.map(({ enumlabel }) => enumlabel),
    ["to_be_read", "currently_reading", "finished"],
  );

  const indexes = await pool.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'saved_books'`,
  );
  assert.ok(
    indexes.rows.some(
      ({ indexdef }) =>
        indexdef.includes("UNIQUE") &&
        indexdef.includes("user_id") &&
        indexdef.includes("book_key"),
    ),
    "Expected a unique index on (user_id, book_key)",
  );
});

// COL-02 reading status tests
test("COL-02-T-1 defaults saved books to to_be_read", async () => {
  const user = await createTestUser();
  const bookKey = createTestBookKey();

  const result = await pool.query<{ reading_status: string }>(
    `INSERT INTO saved_books (user_id, book_key)
     VALUES ($1, $2)
     RETURNING reading_status`,
    [user.id, bookKey],
  );

  assert.equal(result.rows[0]?.reading_status, "to_be_read");
});

test("COL-02-T-1 accepts each supported reading status", async () => {
  const user = await createTestUser();
  const statuses = ["to_be_read", "currently_reading", "finished"];

  for (const status of statuses) {
    const result = await pool.query<{ reading_status: string }>(
      `INSERT INTO saved_books (user_id, book_key, reading_status)
       VALUES ($1, $2, $3)
       RETURNING reading_status`,
      [user.id, createTestBookKey(), status],
    );
    assert.equal(result.rows[0]?.reading_status, status);
  }
});

test("COL-02-T-1 rejects unsupported and null reading statuses", async () => {
  const user = await createTestUser();

  await assert.rejects(
    pool.query(
      `INSERT INTO saved_books (user_id, book_key, reading_status)
       VALUES ($1, $2, $3)`,
      [user.id, createTestBookKey(), "on_hold"],
    ),
    (error) => hasPostgresErrorCode(error, "22P02"),
  );

  await assert.rejects(
    pool.query(
      `INSERT INTO saved_books (user_id, book_key, reading_status)
       VALUES ($1, $2, NULL)`,
      [user.id, createTestBookKey()],
    ),
    (error) => hasPostgresErrorCode(error, "23502"),
  );
});

test("COL-01-T-4 requires an existing user", async () => {
  // foreign key violation (23503)
  await assert.rejects(
    pool.query("INSERT INTO saved_books (user_id, book_key) VALUES ($1, $2)", [
      -1,
      createTestBookKey(),
    ]),
    (error) => hasPostgresErrorCode(error, "23503"),
  );
});

test("COL-01-T-4 requires a user ID and book key", async () => {
  const user = await createTestUser();

  // missing user_id: not-null violation (23502)
  await assert.rejects(
    pool.query("INSERT INTO saved_books (book_key) VALUES ($1)", [
      createTestBookKey(),
    ]),
    (error) => hasPostgresErrorCode(error, "23502"),
  );

  // missing book_key
  await assert.rejects(
    pool.query("INSERT INTO saved_books (user_id) VALUES ($1)", [user.id]),
    (error) => hasPostgresErrorCode(error, "23502"),
  );
});

test("COL-01-T-4 cascades when a user is deleted", async () => {
  const user = await createTestUser();
  const bookKey = createTestBookKey();

  await db.insert(savedBooks).values({ userId: user.id, bookKey });
  await db.delete(users).where(eq(users.id, user.id));
  createdUserIds.delete(user.id);

  const remainingRows = await db
    .select()
    .from(savedBooks)
    .where(eq(savedBooks.userId, user.id));
  assert.equal(remainingRows.length, 0);
});

test("COL-01-T-4 rejects a duplicate for one user", async () => {
  const user = await createTestUser();
  const book = { userId: user.id, bookKey: createTestBookKey() };

  await db.insert(savedBooks).values(book);

  // unique violation (23505)
  await assert.rejects(db.insert(savedBooks).values(book), (error) =>
    hasPostgresErrorCode(error, "23505"),
  );
});

test("COL-01-T-4 allows the same book for different users", async () => {
  const firstUser = await createTestUser();
  const secondUser = await createTestUser();
  const bookKey = createTestBookKey();

  await db.insert(savedBooks).values([
    { userId: firstUser.id, bookKey },
    { userId: secondUser.id, bookKey },
  ]);

  const rows = await db
    .select()
    .from(savedBooks)
    .where(eq(savedBooks.bookKey, bookKey));
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.userId).sort(),
    [firstUser.id, secondUser.id].sort(),
  );
});

// COL-04 book rating tests
test("COL-04-T-1 creates the book-ratings table", async () => {
  const result = await pool.query<{
    column_name: string;
    is_nullable: string;
  }>(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'book_ratings'`,
  );
  const columns = new Map(result.rows.map((c) => [c.column_name, c]));

  assert.deepEqual([...columns.keys()].sort(), [
    "book_key",
    "created_at",
    "id",
    "rating",
    "updated_at",
    "user_id",
  ]);
  for (const name of columns.keys()) {
    assert.equal(columns.get(name)?.is_nullable, "NO");
  }
});

test("COL-04-T-1 accepts ratings from 1 to 5", async () => {
  const user = await createTestUser();

  for (const rating of [1, 2, 3, 4, 5]) {
    const [row] = await db
      .insert(bookRatings)
      .values({ userId: user.id, bookKey: createTestBookKey(), rating })
      .returning();
    assert.equal(row?.rating, rating);
  }
});

test("COL-04-T-1 rejects out-of-range and null ratings", async () => {
  const user = await createTestUser();

  // 0 and 6 violate the check constraint (23514)
  for (const rating of [0, 6, -1]) {
    await assert.rejects(
      db
        .insert(bookRatings)
        .values({ userId: user.id, bookKey: createTestBookKey(), rating }),
      (error) => hasPostgresErrorCode(error, "23514"),
    );
  }

  // NULL violates not-null (23502)
  await assert.rejects(
    pool.query(
      `INSERT INTO book_ratings (user_id, book_key, rating) VALUES ($1, $2, NULL)`,
      [user.id, createTestBookKey()],
    ),
    (error) => hasPostgresErrorCode(error, "23502"),
  );
});

test("COL-04-T-1 allows one rating per user per book", async () => {
  const firstUser = await createTestUser();
  const secondUser = await createTestUser();
  const bookKey = createTestBookKey();

  await db
    .insert(bookRatings)
    .values({ userId: firstUser.id, bookKey, rating: 4 });

  // duplicate (user_id, book_key) is rejected (23505)
  await assert.rejects(
    db.insert(bookRatings).values({ userId: firstUser.id, bookKey, rating: 2 }),
    (error) => hasPostgresErrorCode(error, "23505"),
  );

  // a different user may rate the same book
  await db
    .insert(bookRatings)
    .values({ userId: secondUser.id, bookKey, rating: 5 });
});

test("COL-04-T-1 cascades ratings when a user is deleted", async () => {
  const user = await createTestUser();
  await db
    .insert(bookRatings)
    .values({ userId: user.id, bookKey: createTestBookKey(), rating: 3 });

  await db.delete(users).where(eq(users.id, user.id));
  createdUserIds.delete(user.id);

  const rows = await db
    .select()
    .from(bookRatings)
    .where(eq(bookRatings.userId, user.id));
  assert.equal(rows.length, 0);
});

// constants and helper functions for COL-05-T-1 collection tests
const NOT_NULL_VIOLATION = "23502";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

function getMembershipsForUser(userId: number) {
  return db
    .select()
    .from(collectionBooks)
    .where(eq(collectionBooks.userId, userId))
    .orderBy(collectionBooks.collectionId, collectionBooks.savedBookId);
}

function getCollectionsForUser(userId: number) {
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.id);
}

function getSavedBooksForUser(userId: number) {
  return db
    .select()
    .from(savedBooks)
    .where(eq(savedBooks.userId, userId))
    .orderBy(savedBooks.id);
}

// create a fixture with two collections, two books, and three memberships, all owned by the same user.
async function createCollectionFixture() {
  const user = await createTestUser();
  const [firstBook, secondBook] = await db
    .insert(savedBooks)
    .values([
      { userId: user.id, bookKey: createTestBookKey() },
      { userId: user.id, bookKey: createTestBookKey() },
    ])
    .returning();
  const [firstCollection, secondCollection] = await db
    .insert(collections)
    .values([
      { userId: user.id, name: "Favorites" },
      { userId: user.id, name: "Summer Reading" },
    ])
    .returning();
  assert.ok(firstBook && secondBook && firstCollection && secondCollection);

  // first book in both collections, second book in first collection only
  const [
    firstBookInFirstCollection,
    secondBookInFirstCollection,
    firstBookInSecondCollection,
  ] = await db
    .insert(collectionBooks)
    .values([
      {
        userId: user.id,
        collectionId: firstCollection.id,
        savedBookId: firstBook.id,
      },
      {
        userId: user.id,
        collectionId: firstCollection.id,
        savedBookId: secondBook.id,
      },
      {
        userId: user.id,
        collectionId: secondCollection.id,
        savedBookId: firstBook.id,
      },
    ])
    .returning();
  assert.ok(
    firstBookInFirstCollection &&
      secondBookInFirstCollection &&
      firstBookInSecondCollection,
  );
  return {
    user,
    firstBook,
    secondBook,
    firstCollection,
    secondCollection,
    firstBookInFirstCollection,
    secondBookInFirstCollection,
    firstBookInSecondCollection,
    memberships: [
      firstBookInFirstCollection,
      secondBookInFirstCollection,
      firstBookInSecondCollection,
    ],
  };
}

test("COL-05-T-1 creates collection and membership tables", async () => {
  for (const [table, expectedColumns] of [
    ["collections", ["created_at", "id", "name", "user_id"]],
    [
      "collection_books",
      ["collection_id", "created_at", "saved_book_id", "user_id"],
    ],
  ] as const) {
    const { rows } = await pool.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
      is_identity: string;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, column_default, is_identity, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    assert.deepEqual(
      rows.map((row) => row.column_name).sort(),
      expectedColumns,
    );
    for (const row of rows) {
      assert.equal(row.is_nullable, "NO");
      if (row.column_name === "created_at") {
        assert.equal(row.data_type, "timestamp with time zone");
        assert.match(row.column_default ?? "", /now\(\)/);
      } else if (row.column_name === "name") {
        assert.equal(row.data_type, "text");
      } else {
        assert.equal(row.data_type, "integer");
      }
    }
    if (table === "collections") {
      assert.equal(
        rows.find((row) => row.column_name === "id")?.is_identity,
        "YES",
      );
    }
  }
  const { rows: constraints } = await pool.query<{
    table_name: string;
    definition: string;
  }>(
    `SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint WHERE conrelid IN ('collections'::regclass, 'collection_books'::regclass)`,
  );
  const collectionConstraints = constraints
    .filter((row) => row.table_name === "collections")
    .map((row) => row.definition);
  const membershipConstraints = constraints
    .filter((row) => row.table_name === "collection_books")
    .map((row) => row.definition);
  assert.ok(collectionConstraints.includes("PRIMARY KEY (id)"));
  assert.ok(
    collectionConstraints.includes(
      "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
    ),
  );
  assert.ok(
    collectionConstraints.some(
      (definition) =>
        definition.startsWith("CHECK") &&
        definition.includes("char_length") &&
        definition.includes("[:space:]"),
    ),
  );
  assert.ok(
    membershipConstraints.includes(
      "PRIMARY KEY (collection_id, saved_book_id)",
    ),
  );
  assert.ok(
    membershipConstraints.includes(
      "FOREIGN KEY (collection_id, user_id) REFERENCES collections(id, user_id) ON DELETE CASCADE",
    ),
  );
  assert.ok(
    membershipConstraints.includes(
      "FOREIGN KEY (saved_book_id, user_id) REFERENCES saved_books(id, user_id) ON DELETE CASCADE",
    ),
  );
  const { rows: indexes } = await pool.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
     AND tablename IN ('collections', 'collection_books', 'saved_books')`,
  );
  for (const pattern of [
    /UNIQUE INDEX .* ON public.collections .*\(id, user_id\)/,
    /UNIQUE INDEX .* ON public.collections .*\(user_id, lower\(name\)\)/,
    /UNIQUE INDEX .* ON public.saved_books .*\(id, user_id\)/,
    /INDEX .* ON public.collection_books .*\(user_id, saved_book_id\)/,
  ])
    assert.ok(
      indexes.some((row) => pattern.test(row.indexdef)),
      String(pattern),
    );
});

test("COL-05-T-1 creates an empty collection with defaults", async () => {
  const user = await createTestUser();
  const [collection] = await db
    .insert(collections)
    .values({ userId: user.id, name: "Favorites" })
    .returning();
  assert.ok(collection);
  assert.ok(collection.id > 0);
  assert.equal(collection.name, "Favorites");
  assert.equal(collection.userId, user.id);
  assert.ok(Number.isFinite(collection.createdAt.getTime()));
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.collectionId, collection.id)),
    [],
  );
});

test("COL-05-T-1 accepts valid collection names at the length boundaries", async () => {
  const user = await createTestUser();
  for (const name of [
    "A",
    "x".repeat(100),
    "猫".repeat(100),
    "Summer Reading — 2026!",
    "Shruti's favorites",
  ]) {
    const [row] = await db
      .insert(collections)
      .values({ userId: user.id, name })
      .returning();
    assert.equal(row?.name, name);
  }
});

test("COL-05-T-1 rejects invalid collection names on insert and update", async () => {
  const user = await createTestUser();
  const [collection] = await db
    .insert(collections)
    .values({ userId: user.id, name: "Valid" })
    .returning();
  assert.ok(collection);
  await assert.rejects(
    pool.query("INSERT INTO collections (user_id) VALUES ($1)", [user.id]),
    (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
  );
  // DEFAULT represents an omitted replacement value in an UPDATE.
  await assert.rejects(
    pool.query("UPDATE collections SET name = DEFAULT WHERE id = $1", [
      collection.id,
    ]),
    (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
  );
  for (const name of [
    null,
    "",
    " ",
    "\t",
    "\n",
    " \t\n",
    " Favorites",
    "Favorites ",
    "\tFavorites",
    "Favorites\n",
    "x".repeat(101),
  ]) {
    const code = name === null ? NOT_NULL_VIOLATION : CHECK_VIOLATION;
    await assert.rejects(
      pool.query("INSERT INTO collections (user_id, name) VALUES ($1, $2)", [
        user.id,
        name,
      ]),
      (error) => hasPostgresErrorCode(error, code),
    );
    await assert.rejects(
      pool.query("UPDATE collections SET name = $1 WHERE id = $2", [
        name,
        collection.id,
      ]),
      (error) => hasPostgresErrorCode(error, code),
    );
  }
  assert.deepEqual(await getCollectionsForUser(user.id), [collection]);
});

test("COL-05-T-1 enforces collection name uniqueness per owner", async () => {
  const firstUser = await createTestUser();
  const secondUser = await createTestUser();
  await db
    .insert(collections)
    .values({ userId: firstUser.id, name: "Favorites" });
  await assert.rejects(
    db.insert(collections).values({ userId: firstUser.id, name: "favorites" }),
    (error) => hasPostgresErrorCode(error, UNIQUE_VIOLATION),
  );
  const [other] = await db
    .insert(collections)
    .values({ userId: secondUser.id, name: "Favorites" })
    .returning();
  assert.equal(other?.name, "Favorites");
});

test("COL-05-T-1 renames a collection without changing its memberships", async () => {
  const fixture = await createCollectionFixture();
  for (const name of ["Best Books", "BEST BOOKS"]) {
    const [updated] = await db
      .update(collections)
      .set({ name })
      .where(eq(collections.id, fixture.firstCollection.id))
      .returning();
    assert.deepEqual(updated, { ...fixture.firstCollection, name });
  }
  await assert.rejects(
    db
      .update(collections)
      .set({ name: "summer reading" })
      .where(eq(collections.id, fixture.firstCollection.id)),
    (error) => hasPostgresErrorCode(error, UNIQUE_VIOLATION),
  );
  const [unchanged] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, fixture.firstCollection.id));
  assert.deepEqual(unchanged, {
    ...fixture.firstCollection,
    name: "BEST BOOKS",
  });
  assert.deepEqual(
    await getMembershipsForUser(fixture.user.id),
    fixture.memberships,
  );
});

test("COL-05-T-1 supports multiple books and multiple collections", async () => {
  const fixture = await createCollectionFixture();
  const memberships = await getMembershipsForUser(fixture.user.id);
  assert.equal(memberships.length, 3);
  assert.equal(
    memberships.filter((row) => row.collectionId === fixture.firstCollection.id)
      .length,
    2,
  );
  assert.equal(
    memberships.filter((row) => row.savedBookId === fixture.firstBook.id)
      .length,
    2,
  );
  for (const row of memberships)
    assert.ok(
      row.createdAt instanceof Date && Number.isFinite(row.createdAt.getTime()),
    );
  assert.equal((await getSavedBooksForUser(fixture.user.id)).length, 2);
});

test("COL-05-T-1 rejects duplicate memberships", async () => {
  const fixture = await createCollectionFixture();
  await assert.rejects(
    db.insert(collectionBooks).values(fixture.firstBookInFirstCollection),
    (error) => hasPostgresErrorCode(error, UNIQUE_VIOLATION),
  );
  assert.deepEqual(
    await getMembershipsForUser(fixture.user.id),
    fixture.memberships,
  );
});

test("COL-05-T-1 rejects missing required references", async () => {
  const fixture = await createCollectionFixture();
  for (const expression of ["DEFAULT", "NULL"]) {
    await assert.rejects(
      pool.query(
        `INSERT INTO collections (user_id, name) VALUES (${expression}, 'Missing owner')`,
      ),
      (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
    );
    for (let missingIndex = 0; missingIndex < 3; missingIndex += 1) {
      const values = [
        fixture.firstCollection.id,
        fixture.firstBook.id,
        fixture.user.id,
      ];
      const parameters = values.filter((_, index) => index !== missingIndex);
      let parameterIndex = 0;
      const placeholders = values.map((_, index) =>
        index === missingIndex ? expression : `$${++parameterIndex}`,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO collection_books (collection_id, saved_book_id, user_id)
         VALUES (${placeholders.join(", ")})`,
          parameters,
        ),
        (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
      );
    }
  }
});

test("COL-05-T-1 rejects nonexistent references", async () => {
  const fixture = await createCollectionFixture();
  await assert.rejects(
    db.insert(collections).values({ userId: -1, name: "No owner" }),
    (error) => hasPostgresErrorCode(error, FOREIGN_KEY_VIOLATION),
  );
  for (const membership of [
    {
      userId: fixture.user.id,
      collectionId: -1,
      savedBookId: fixture.firstBook.id,
    },
    {
      userId: fixture.user.id,
      collectionId: fixture.firstCollection.id,
      savedBookId: -1,
    },
    {
      userId: -1,
      collectionId: fixture.secondCollection.id,
      savedBookId: fixture.secondBook.id,
    },
  ])
    await assert.rejects(
      db.insert(collectionBooks).values(membership),
      (error) => hasPostgresErrorCode(error, FOREIGN_KEY_VIOLATION),
    );
  assert.deepEqual(
    await getMembershipsForUser(fixture.user.id),
    fixture.memberships,
  );
});

test("COL-05-T-1 rejects cross-user memberships", async () => {
  const first = await createCollectionFixture();
  const second = await createCollectionFixture();
  const [sameBook] = await db
    .insert(savedBooks)
    .values({ userId: second.user.id, bookKey: first.firstBook.bookKey })
    .returning();
  assert.ok(sameBook);
  for (const userId of [first.user.id, second.user.id]) {
    for (const pair of [
      { collectionId: first.firstCollection.id, savedBookId: sameBook.id },
      {
        collectionId: second.firstCollection.id,
        savedBookId: first.firstBook.id,
      },
    ])
      await assert.rejects(
        db.insert(collectionBooks).values({ userId, ...pair }),
        (error) => hasPostgresErrorCode(error, FOREIGN_KEY_VIOLATION),
      );
  }
});

test("COL-05-T-1 removes membership without deleting parents", async () => {
  const fixture = await createCollectionFixture();
  await db
    .delete(collectionBooks)
    .where(
      and(
        eq(collectionBooks.collectionId, fixture.firstCollection.id),
        eq(collectionBooks.savedBookId, fixture.firstBook.id),
      ),
    );
  assert.equal((await getMembershipsForUser(fixture.user.id)).length, 2);
  await db
    .delete(collectionBooks)
    .where(eq(collectionBooks.collectionId, fixture.firstCollection.id));
  assert.deepEqual(await getMembershipsForUser(fixture.user.id), [
    fixture.firstBookInSecondCollection,
  ]);
  assert.deepEqual(await getCollectionsForUser(fixture.user.id), [
    fixture.firstCollection,
    fixture.secondCollection,
  ]);
  assert.deepEqual(await getSavedBooksForUser(fixture.user.id), [
    fixture.firstBook,
    fixture.secondBook,
  ]);
});

test("COL-05-T-1 cascades membership deletion from a collection", async () => {
  const fixture = await createCollectionFixture();
  await db
    .delete(collections)
    .where(eq(collections.id, fixture.firstCollection.id));
  assert.deepEqual(await getMembershipsForUser(fixture.user.id), [
    fixture.firstBookInSecondCollection,
  ]);
  assert.deepEqual(await getCollectionsForUser(fixture.user.id), [
    fixture.secondCollection,
  ]);
  assert.deepEqual(await getSavedBooksForUser(fixture.user.id), [
    fixture.firstBook,
    fixture.secondBook,
  ]);
});

test("COL-05-T-1 cascades membership deletion from a saved book", async () => {
  const fixture = await createCollectionFixture();
  await db.delete(savedBooks).where(eq(savedBooks.id, fixture.firstBook.id));
  assert.deepEqual(await getMembershipsForUser(fixture.user.id), [
    fixture.secondBookInFirstCollection,
  ]);
  assert.deepEqual(await getCollectionsForUser(fixture.user.id), [
    fixture.firstCollection,
    fixture.secondCollection,
  ]);
  assert.deepEqual(await getSavedBooksForUser(fixture.user.id), [
    fixture.secondBook,
  ]);
});

test("COL-05-T-1 cascades collections and memberships when a user is deleted", async () => {
  const first = await createCollectionFixture();
  const second = await createCollectionFixture();
  await db.delete(users).where(eq(users.id, first.user.id));
  createdUserIds.delete(first.user.id);
  assert.deepEqual(await getCollectionsForUser(first.user.id), []);
  assert.deepEqual(await getMembershipsForUser(first.user.id), []);
  assert.deepEqual(await getSavedBooksForUser(first.user.id), []);
  assert.deepEqual(await getCollectionsForUser(second.user.id), [
    second.firstCollection,
    second.secondCollection,
  ]);
  assert.deepEqual(
    await getMembershipsForUser(second.user.id),
    second.memberships,
  );
  assert.deepEqual(await getSavedBooksForUser(second.user.id), [
    second.firstBook,
    second.secondBook,
  ]);
});

test("DIS-01-T-1 user genres are unique and cascade", async () => {
  const user = await createTestUser();
  const insert = (genre: string) =>
    pool.query("INSERT INTO user_genres (user_id, genre) VALUES ($1, $2)", [
      user.id,
      genre,
    ]);

  await insert("Fantasy");
  await assert.rejects(insert("Fantasy"), (error) =>
    hasPostgresErrorCode(error, "23505"),
  );
  await assert.rejects(insert("Cooking"), (error) =>
    hasPostgresErrorCode(error, "22P02"),
  );

  await db.delete(users).where(eq(users.id, user.id));
  createdUserIds.delete(user.id);
  const rows = await pool.query(
    "SELECT 1 FROM user_genres WHERE user_id = $1",
    [user.id],
  );
  assert.equal(rows.rowCount, 0);
});

// COL-08-T-1: direct database checks; no notes endpoints or UI are involved.
async function createNoteFixture() {
  // creates a test user and one valid note
  const user = await createTestUser();
  const [note] = await db
    .insert(bookNotes)
    .values({
      userId: user.id,
      bookKey: createTestBookKey(),
      content: "A thought",
    })
    .returning();
  assert.ok(note);
  const typedNote: BookNote = note;
  return { user, note: typedNote };
}

function getNotesForUser(userId: number) {
  // returns all notes owned by one user
  return db
    .select()
    .from(bookNotes)
    .where(eq(bookNotes.userId, userId))
    .orderBy(bookNotes.id);
}

test("COL-08-T-1 creates the book-notes table with constraints and index", async () => {
  const { rows } = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    is_identity: string;
    identity_generation: string | null;
    column_default: string | null;
  }>(`SELECT column_name, data_type, is_nullable, is_identity,
       identity_generation, column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'book_notes'`);
  assert.deepEqual(rows.map((row) => row.column_name).sort(), [
    "book_key",
    "content",
    "created_at",
    "id",
    "reference",
    "updated_at",
    "user_id",
  ]);
  for (const row of rows) {
    assert.equal(
      row.is_nullable,
      row.column_name === "reference" ? "YES" : "NO",
    );
    assert.equal(
      row.data_type,
      ["id", "user_id"].includes(row.column_name)
        ? "integer"
        : ["created_at", "updated_at"].includes(row.column_name)
          ? "timestamp with time zone"
          : "text",
    );
    if (row.column_name === "id") {
      assert.equal(row.is_identity, "YES");
      assert.equal(row.identity_generation, "ALWAYS");
    } else if (["created_at", "updated_at"].includes(row.column_name)) {
      assert.equal(row.column_default, "now()");
    } else {
      assert.equal(row.column_default, null);
    }
  }
  const { rows: constraints } = await pool.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
     WHERE conrelid = 'book_notes'::regclass`,
  );
  const definitions = constraints.map((row) => row.definition);
  assert.ok(definitions.includes("PRIMARY KEY (id)"));
  assert.deepEqual(
    definitions.filter((definition) => definition.startsWith("FOREIGN KEY")),
    ["FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"],
  );
  for (const column of ["book_key", "content", "reference"]) {
    assert.ok(
      definitions.some(
        (definition) =>
          definition.startsWith("CHECK") && definition.includes(column),
      ),
    );
  }
  const { rows: indexes } = await pool.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'book_notes'`,
  );
  assert.ok(
    indexes.some(({ indexdef }) =>
      /CREATE INDEX .*\(user_id, book_key\)/.test(indexdef),
    ),
  );
  assert.equal(
    indexes.filter(({ indexdef }) => indexdef.includes("UNIQUE INDEX")).length,
    1,
    "Only the primary key should be unique",
  );
});

test("COL-08-T-1 generates note identity and timestamps with a null reference", async () => {
  const { user, note } = await createNoteFixture();
  assert.ok(Number.isInteger(note.id) && note.id > 0);
  assert.equal(note.reference, null);
  assert.ok(
    note.createdAt instanceof Date && Number.isFinite(note.createdAt.getTime()),
  );
  assert.ok(
    note.updatedAt instanceof Date && Number.isFinite(note.updatedAt.getTime()),
  );
  assert.deepEqual(note.updatedAt, note.createdAt);
  assert.deepEqual(await getNotesForUser(user.id), [note]);
  for (const column of ["created_at", "updated_at"]) {
    await assert.rejects(
      pool.query(
        `INSERT INTO book_notes (user_id, book_key, content, ${column}) VALUES ($1, $2, 'Text', NULL)`,
        [user.id, note.bookKey],
      ),
      (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
    );
  }
});

test("COL-08-T-1 allows multiple notes and owners without saved books", async () => {
  const first = await createTestUser();
  const second = await createTestUser();
  const bookKey = createTestBookKey();
  assert.deepEqual(await getNotesForUser(first.id), []);
  const notes = await db
    .insert(bookNotes)
    .values([
      { userId: first.id, bookKey, content: "Same thought" },
      { userId: first.id, bookKey, content: "Same thought" },
      { userId: first.id, bookKey, content: "Another thought" },
      { userId: second.id, bookKey, content: "Same thought" },
    ])
    .returning();
  assert.equal(new Set(notes.map((note) => note.id)).size, 4);
  assert.deepEqual(await getNotesForUser(first.id), notes.slice(0, 3));
  assert.deepEqual(await getNotesForUser(second.id), notes.slice(3));
  assert.deepEqual(await getSavedBooksForUser(first.id), []);
  assert.deepEqual(await getSavedBooksForUser(second.id), []);
});

test("COL-08-T-1 rejects missing and malformed book keys", async () => {
  const { user, note } = await createNoteFixture();
  await assert.rejects(
    pool.query(
      "INSERT INTO book_notes (user_id, content) VALUES ($1, 'Text')",
      [user.id],
    ),
    (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
  );
  for (const bookKey of [
    null,
    "",
    " ",
    "/books/OL123M",
    "OL123W",
    "/works/OLW",
    "/works/OL123w",
    "/works/OL-1W",
    "/works/OL１２３W",
    " /works/OL123W",
    "/works/OL123W ",
    "/works/OL123W\n",
    "/works/OL123W/extra",
    "/works/OL12\n3W",
  ]) {
    const code = bookKey === null ? NOT_NULL_VIOLATION : CHECK_VIOLATION;
    await assert.rejects(
      pool.query(
        "INSERT INTO book_notes (user_id, book_key, content) VALUES ($1, $2, 'Text')",
        [user.id, bookKey],
      ),
      (error) => hasPostgresErrorCode(error, code),
    );
    await assert.rejects(
      pool.query("UPDATE book_notes SET book_key = $1 WHERE id = $2", [
        bookKey,
        note.id,
      ]),
      (error) => hasPostgresErrorCode(error, code),
    );
  }
  assert.deepEqual(await getNotesForUser(user.id), [note]);
});

test("COL-08-T-1 preserves valid content and references at length boundaries", async () => {
  const { user, note } = await createNoteFixture();
  for (const content of [
    "A",
    "x".repeat(10000),
    "猫".repeat(10000),
    "😀".repeat(10000),
    "  My thoughts — 'why?'\n\t<b>plain text</b>  ",
  ]) {
    const [inserted] = await db
      .insert(bookNotes)
      .values({ userId: user.id, bookKey: note.bookKey, content })
      .returning();
    assert.equal(inserted?.content, content);
    const [updated] = await db
      .update(bookNotes)
      .set({ content })
      .where(eq(bookNotes.id, note.id))
      .returning();
    assert.equal(updated?.content, content);
  }
  for (const reference of [
    null,
    "A",
    "x".repeat(100),
    "猫".repeat(100),
    "😀".repeat(100),
    " Page 42\nChapter 3 ",
  ]) {
    const [inserted] = await db
      .insert(bookNotes)
      .values({
        userId: user.id,
        bookKey: note.bookKey,
        content: "Text",
        reference,
      })
      .returning();
    assert.equal(inserted?.reference, reference);
    const [updated] = await db
      .update(bookNotes)
      .set({ reference })
      .where(eq(bookNotes.id, note.id))
      .returning();
    assert.equal(updated?.reference, reference);
  }
});

test("COL-08-T-1 rejects invalid text on inserts and updates without changing the note", async () => {
  const { user, note } = await createNoteFixture();
  await assert.rejects(
    pool.query("INSERT INTO book_notes (user_id, book_key) VALUES ($1, $2)", [
      user.id,
      note.bookKey,
    ]),
    (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
  );
  await assert.rejects(
    pool.query("UPDATE book_notes SET content = DEFAULT WHERE id = $1", [
      note.id,
    ]),
    (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
  );
  for (const [column, limit] of [
    ["content", 10000],
    ["reference", 100],
  ] as const) {
    const invalid: (string | null)[] = [
      "",
      " ",
      "\t",
      "\n",
      "\r",
      "\f",
      "\v",
      " \t\n",
      "x".repeat(limit + 1),
      "猫".repeat(limit + 1),
    ];
    if (column === "content") invalid.push(null);
    for (const value of invalid) {
      const code = value === null ? NOT_NULL_VIOLATION : CHECK_VIOLATION;
      const columns = column === "content" ? "content" : "content, reference";
      const values = column === "content" ? "$3" : "'Valid content', $3";
      await assert.rejects(
        pool.query(
          `INSERT INTO book_notes (user_id, book_key, ${columns}) VALUES ($1, $2, ${values})`,
          [user.id, note.bookKey, value],
        ),
        (error) => hasPostgresErrorCode(error, code),
      );
      await assert.rejects(
        pool.query(
          `UPDATE book_notes SET ${column} = $1, updated_at = $2 WHERE id = $3`,
          [value, new Date(note.updatedAt.getTime() + 1000), note.id],
        ),
        (error) => hasPostgresErrorCode(error, code),
      );
      assert.deepEqual(await getNotesForUser(user.id), [note]);
    }
  }
});

test("COL-08-T-1 edits text with an explicit timestamp and preserves note identity", async () => {
  const { user, note } = await createNoteFixture();
  const updatedAt = new Date(note.updatedAt.getTime() + 1000);
  const [updated] = await db
    .update(bookNotes)
    .set({ content: "Reconsidered", reference: "Chapter 3", updatedAt })
    .where(eq(bookNotes.id, note.id))
    .returning();
  assert.deepEqual(updated, {
    ...note,
    content: "Reconsidered",
    reference: "Chapter 3",
    updatedAt,
  });
  // Storage has no automatic timestamp trigger; the future endpoint supplies it.
  await db
    .update(bookNotes)
    .set({ reference: null })
    .where(eq(bookNotes.id, note.id));
  assert.deepEqual(await getNotesForUser(user.id), [
    { ...updated, reference: null },
  ]);
});

test("COL-08-T-1 rejects missing and nonexistent owners", async () => {
  const { user, note } = await createNoteFixture();
  const deletedUser = await createTestUser();
  await db.delete(users).where(eq(users.id, deletedUser.id));
  createdUserIds.delete(deletedUser.id);
  await assert.rejects(
    pool.query(
      "INSERT INTO book_notes (book_key, content) VALUES ($1, 'Text')",
      [note.bookKey],
    ),
    (error) => hasPostgresErrorCode(error, NOT_NULL_VIOLATION),
  );
  for (const userId of [null, deletedUser.id]) {
    const code = userId === null ? NOT_NULL_VIOLATION : FOREIGN_KEY_VIOLATION;
    await assert.rejects(
      pool.query(
        "INSERT INTO book_notes (user_id, book_key, content) VALUES ($1, $2, 'Text')",
        [userId, note.bookKey],
      ),
      (error) => hasPostgresErrorCode(error, code),
    );
    await assert.rejects(
      pool.query("UPDATE book_notes SET user_id = $1 WHERE id = $2", [
        userId,
        note.id,
      ]),
      (error) => hasPostgresErrorCode(error, code),
    );
  }
  assert.deepEqual(await getNotesForUser(user.id), [note]);
});

test("COL-08-T-1 cascades notes only for the deleted owner", async () => {
  const first = await createNoteFixture();
  const second = await createNoteFixture();
  await db.insert(bookNotes).values({
    userId: first.user.id,
    bookKey: second.note.bookKey,
    content: "Another note",
  });
  await db.delete(users).where(eq(users.id, first.user.id));
  createdUserIds.delete(first.user.id);
  assert.deepEqual(await getNotesForUser(first.user.id), []);
  assert.deepEqual(await getNotesForUser(second.user.id), [second.note]);
  assert.equal(
    (await db.select().from(users).where(eq(users.id, second.user.id))).length,
    1,
  );
});

test("COL-08-T-1 deletes one note without deleting its owner or other notes", async () => {
  const { user, note } = await createNoteFixture();
  const [other] = await db
    .insert(bookNotes)
    .values({ userId: user.id, bookKey: note.bookKey, content: "Keep this" })
    .returning();
  await db.delete(bookNotes).where(eq(bookNotes.id, note.id));
  assert.deepEqual(await getNotesForUser(user.id), [other]);
  assert.equal(
    (await db.select().from(users).where(eq(users.id, user.id))).length,
    1,
  );
});

test("COL-08-T-1 preserves notes when saved books or collections are deleted", async () => {
  const fixture = await createCollectionFixture();
  const notes = await db
    .insert(bookNotes)
    .values([
      {
        userId: fixture.user.id,
        bookKey: fixture.firstBook.bookKey,
        content: "Keep first",
      },
      {
        userId: fixture.user.id,
        bookKey: fixture.secondBook.bookKey,
        content: "Keep second",
      },
    ])
    .returning();
  await db
    .delete(collections)
    .where(eq(collections.id, fixture.firstCollection.id));
  assert.deepEqual(await getNotesForUser(fixture.user.id), notes);
  await db.delete(savedBooks).where(eq(savedBooks.id, fixture.firstBook.id));
  assert.deepEqual(await getNotesForUser(fixture.user.id), notes);
});

test(
  "COL-08-T-1 preserves existing data across repeated schema pushes",
  { timeout: 90000 },
  async () => {
    const fixture = await createCollectionFixture();
    const userId = fixture.user.id;
    await db.insert(sessions).values({
      id: `notes-schema-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await db
      .insert(bookRatings)
      .values({ userId, bookKey: fixture.firstBook.bookKey, rating: 4 });
    await db.insert(userGenres).values({ userId, genre: "Fantasy" });
    await db.insert(bookNotes).values({
      userId,
      bookKey: fixture.firstBook.bookKey,
      content: "Retain this note",
    });
    const snapshot = async () => ({
      users: await db.select().from(users).where(eq(users.id, userId)),
      sessions: await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId)),
      books: await getSavedBooksForUser(userId),
      collections: await getCollectionsForUser(userId),
      memberships: await getMembershipsForUser(userId),
      ratings: await db
        .select()
        .from(bookRatings)
        .where(eq(bookRatings.userId, userId)),
      genres: await db
        .select()
        .from(userGenres)
        .where(eq(userGenres.userId, userId)),
      notes: await getNotesForUser(userId),
    });
    const before = await snapshot();
    const run = promisify(execFile);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assertTestDatabaseUrl();
      const { stdout } = await run("pnpm", ["--dir", "server", "db:push"], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: process.env,
        timeout: 40000,
      });
      assert.match(stdout, /No changes detected|Changes applied/);
      assert.deepEqual(await snapshot(), before);
    }
  },
);
