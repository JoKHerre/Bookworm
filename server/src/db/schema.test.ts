import assert from "node:assert/strict";
import { after, test } from "node:test";
import { assertTestDatabaseUrl, createTestBookKey } from "../../test-utils.ts";

assertTestDatabaseUrl();

// import postgres connection, schema, and drizzle eq helper
const [{ db, pool }, { savedBooks, users }, { eq }] = await Promise.all([
  import("./index.ts"),
  import("./schema.ts"),
  import("drizzle-orm"),
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
    "user_id",
  ]);

  // check that the columns have the expected properties (can't be null, id = automatically generated identity,
  // created_at has a default value, etc.)
  assert.equal(columns.get("id")?.is_nullable, "NO");
  assert.equal(columns.get("id")?.is_identity, "YES");
  assert.equal(columns.get("user_id")?.is_nullable, "NO");
  assert.equal(columns.get("book_key")?.is_nullable, "NO");
  assert.equal(columns.get("created_at")?.is_nullable, "NO");
  assert.ok(columns.get("created_at")?.column_default);

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
