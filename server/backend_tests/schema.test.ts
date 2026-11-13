import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and } from "drizzle-orm";
import { assertTestDatabaseUrl, createTestBookKey, eq } from "./test-utils.ts";

assertTestDatabaseUrl();

// import postgres connection, schema, and drizzle eq helper
const [
  { db, pool },
  { bookRatings, savedBooks, users, collections, collectionBooks },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
]);

// trackers
const createdUserIds = new Set<number>();
let emailCounter = 0;

// insert a user with a unique email and a placeholder password hash, then return new user's ID
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

// post-test cleanup: delete any remaining test users and close the postgres connection pool
after(async () => {
  try {
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
  } finally {
    // still attempt to close pool
    await pool.end();
  }
});

// helper to check that an error has a certain error code
function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;

  if ("code" in error && error.code === code) return true;

  return "cause" in error && hasPostgresErrorCode(error.cause, code);
}

// test: check that the saved_books table exists and has the expected structure
test("COL-01-T-4 creates the saved-books table", async () => {
  // ask postgres for the columns of the saved_books table in the public schema
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

  // save results in a lookup map
  const columns = new Map(
    result.rows.map((column) => [column.column_name, column]),
  );

  // check that the expected columns are present
  assert.deepEqual([...columns.keys()].sort(), [
    "book_key",
    "created_at",
    "id",
    "reading_status",
    "user_id",
  ]);

  // check that the columns have the expected properties (can't be null, id = automatically generated identity,
  // created_at has a default value, etc.)
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

  // get the table's indexes and check that there is a unique index on (user_id, book_key)
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
  // create sample user and book key
  const user = await createTestUser();
  const bookKey = createTestBookKey();

  // insert a saved_books row without specifying reading_status
  const result = await pool.query<{ reading_status: string }>(
    `INSERT INTO saved_books (user_id, book_key)
     VALUES ($1, $2)
     RETURNING reading_status`,
    [user.id, bookKey],
  );

  // check that reading_status is present and set to "to_be_read"
  assert.equal(result.rows[0]?.reading_status, "to_be_read");
});

test("COL-02-T-1 accepts each supported reading status", async () => {
  // create sample user
  const user = await createTestUser();
  const statuses = ["to_be_read", "currently_reading", "finished"];

  // try inserting a saved_books row for each of the reading statuses
  // ensure that each status is accepted and returned correctly
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
  // create sample user
  const user = await createTestUser();

  // try inserting saved_books row with an unsupported reading statuses
  // ensure errors occur
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

// test: require an existing user
test("COL-01-T-4 requires an existing user", async () => {
  // try inserting a row with a non-existent user ID (-1) and expect a foreign key violation (error code 23503)
  await assert.rejects(
    pool.query("INSERT INTO saved_books (user_id, book_key) VALUES ($1, $2)", [
      -1,
      createTestBookKey(),
    ]),
    (error) => hasPostgresErrorCode(error, "23503"),
  );
});

// test: require both a user ID and a book key
test("COL-01-T-4 requires a user ID and book key", async () => {
  const user = await createTestUser();

  // try inserting a row into saved_books with a book key but no user_id
  // expect a missing value violation (error code 23502)
  await assert.rejects(
    pool.query("INSERT INTO saved_books (book_key) VALUES ($1)", [
      createTestBookKey(),
    ]),
    (error) => hasPostgresErrorCode(error, "23502"),
  );

  // try inserting a row into saved_books with a user_id but no book_key
  // expect a missing value violation (error code 23502)
  await assert.rejects(
    pool.query("INSERT INTO saved_books (user_id) VALUES ($1)", [user.id]),
    (error) => hasPostgresErrorCode(error, "23502"),
  );
});

// test: deleting a user should cascade and delete their saved_books rows
test("COL-01-T-4 cascades when a user is deleted", async () => {
  // create test user and book key
  const user = await createTestUser();
  const bookKey = createTestBookKey();

  // insert a row into saved_books, then delete the user's row from the users table
  await db.insert(savedBooks).values({ userId: user.id, bookKey });
  await db.delete(users).where(eq(users.id, user.id));
  createdUserIds.delete(user.id);

  // check that there are no saved_books rows with that user id
  const remainingRows = await db
    .select()
    .from(savedBooks)
    .where(eq(savedBooks.userId, user.id));
  assert.equal(remainingRows.length, 0);
});

// test: reject a duplicate book for the same user
test("COL-01-T-4 rejects a duplicate for one user", async () => {
  // create test user and a book key
  const user = await createTestUser();
  const book = { userId: user.id, bookKey: createTestBookKey() };

  // insert row into table
  await db.insert(savedBooks).values(book);

  // try insert again and expect a unique violation (error code 23505)
  await assert.rejects(db.insert(savedBooks).values(book), (error) =>
    hasPostgresErrorCode(error, "23505"),
  );
});

// test: allow the same book for different users
test("COL-01-T-4 allows the same book for different users", async () => {
  // create two test users and a book key
  const firstUser = await createTestUser();
  const secondUser = await createTestUser();
  const bookKey = createTestBookKey();

  // insert the two rows into saved_books at the same time
  await db.insert(savedBooks).values([
    { userId: firstUser.id, bookKey },
    { userId: secondUser.id, bookKey },
  ]);

  // check that there are in fact two rows with this book key
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
  const memberships = await db
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
  return {
    user,
    firstBook,
    secondBook,
    firstCollection,
    secondCollection,
    memberships,
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
    (error) => hasPostgresErrorCode(error, "23502"),
  );
  // DEFAULT represents an omitted replacement value in an UPDATE.
  await assert.rejects(
    pool.query("UPDATE collections SET name = DEFAULT WHERE id = $1", [
      collection.id,
    ]),
    (error) => hasPostgresErrorCode(error, "23502"),
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
    const code = name === null ? "23502" : "23514";
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
  assert.deepEqual(
    await db.select().from(collections).where(eq(collections.userId, user.id)),
    [collection],
  );
});

test("COL-05-T-1 enforces collection name uniqueness per owner", async () => {
  const firstUser = await createTestUser();
  const secondUser = await createTestUser();
  await db
    .insert(collections)
    .values({ userId: firstUser.id, name: "Favorites" });
  await assert.rejects(
    db.insert(collections).values({ userId: firstUser.id, name: "favorites" }),
    (error) => hasPostgresErrorCode(error, "23505"),
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
    (error) => hasPostgresErrorCode(error, "23505"),
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
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, fixture.user.id))
      .orderBy(collectionBooks.collectionId, collectionBooks.savedBookId),
    fixture.memberships,
  );
});

test("COL-05-T-1 supports multiple books and multiple collections", async () => {
  const fixture = await createCollectionFixture();
  const memberships = await db
    .select()
    .from(collectionBooks)
    .where(eq(collectionBooks.userId, fixture.user.id));
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
  assert.equal(
    (
      await db
        .select()
        .from(savedBooks)
        .where(eq(savedBooks.userId, fixture.user.id))
    ).length,
    2,
  );
});

test("COL-05-T-1 rejects duplicate memberships", async () => {
  const fixture = await createCollectionFixture();
  await assert.rejects(
    db.insert(collectionBooks).values(fixture.memberships[0]!),
    (error) => hasPostgresErrorCode(error, "23505"),
  );
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, fixture.user.id))
      .orderBy(collectionBooks.collectionId, collectionBooks.savedBookId),
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
      (error) => hasPostgresErrorCode(error, "23502"),
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
        (error) => hasPostgresErrorCode(error, "23502"),
      );
    }
  }
});

test("COL-05-T-1 rejects nonexistent references", async () => {
  const fixture = await createCollectionFixture();
  await assert.rejects(
    db.insert(collections).values({ userId: -1, name: "No owner" }),
    (error) => hasPostgresErrorCode(error, "23503"),
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
      (error) => hasPostgresErrorCode(error, "23503"),
    );
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, fixture.user.id))
      .orderBy(collectionBooks.collectionId, collectionBooks.savedBookId),
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
        (error) => hasPostgresErrorCode(error, "23503"),
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
  assert.equal(
    (
      await db
        .select()
        .from(collectionBooks)
        .where(eq(collectionBooks.userId, fixture.user.id))
    ).length,
    2,
  );
  await db
    .delete(collectionBooks)
    .where(eq(collectionBooks.collectionId, fixture.firstCollection.id));
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, fixture.user.id)),
    [fixture.memberships[2]],
  );
  assert.deepEqual(
    await db
      .select()
      .from(collections)
      .where(eq(collections.userId, fixture.user.id))
      .orderBy(collections.id),
    [fixture.firstCollection, fixture.secondCollection],
  );
  assert.deepEqual(
    await db
      .select()
      .from(savedBooks)
      .where(eq(savedBooks.userId, fixture.user.id))
      .orderBy(savedBooks.id),
    [fixture.firstBook, fixture.secondBook],
  );
});

test("COL-05-T-1 cascades membership deletion from a collection", async () => {
  const fixture = await createCollectionFixture();
  await db
    .delete(collections)
    .where(eq(collections.id, fixture.firstCollection.id));
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, fixture.user.id)),
    [fixture.memberships[2]],
  );
  assert.deepEqual(
    await db
      .select()
      .from(collections)
      .where(eq(collections.userId, fixture.user.id)),
    [fixture.secondCollection],
  );
  assert.deepEqual(
    await db
      .select()
      .from(savedBooks)
      .where(eq(savedBooks.userId, fixture.user.id))
      .orderBy(savedBooks.id),
    [fixture.firstBook, fixture.secondBook],
  );
});

test("COL-05-T-1 cascades membership deletion from a saved book", async () => {
  const fixture = await createCollectionFixture();
  await db.delete(savedBooks).where(eq(savedBooks.id, fixture.firstBook.id));
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, fixture.user.id)),
    [fixture.memberships[1]],
  );
  assert.deepEqual(
    await db
      .select()
      .from(collections)
      .where(eq(collections.userId, fixture.user.id))
      .orderBy(collections.id),
    [fixture.firstCollection, fixture.secondCollection],
  );
  assert.deepEqual(
    await db
      .select()
      .from(savedBooks)
      .where(eq(savedBooks.userId, fixture.user.id)),
    [fixture.secondBook],
  );
});

test("COL-05-T-1 cascades collections and memberships when a user is deleted", async () => {
  const first = await createCollectionFixture();
  const second = await createCollectionFixture();
  await db.delete(users).where(eq(users.id, first.user.id));
  createdUserIds.delete(first.user.id);
  assert.deepEqual(
    await db
      .select()
      .from(collections)
      .where(eq(collections.userId, first.user.id)),
    [],
  );
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, first.user.id)),
    [],
  );
  assert.deepEqual(
    await db
      .select()
      .from(savedBooks)
      .where(eq(savedBooks.userId, first.user.id)),
    [],
  );
  assert.deepEqual(
    await db
      .select()
      .from(collections)
      .where(eq(collections.userId, second.user.id))
      .orderBy(collections.id),
    [second.firstCollection, second.secondCollection],
  );
  assert.deepEqual(
    await db
      .select()
      .from(collectionBooks)
      .where(eq(collectionBooks.userId, second.user.id))
      .orderBy(collectionBooks.collectionId, collectionBooks.savedBookId),
    second.memberships,
  );
  assert.deepEqual(
    await db
      .select()
      .from(savedBooks)
      .where(eq(savedBooks.userId, second.user.id))
      .orderBy(savedBooks.id),
    [second.firstBook, second.secondBook],
  );
});
