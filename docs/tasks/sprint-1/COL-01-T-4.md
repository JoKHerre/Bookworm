---
id: COL-01-T-4
story: COL-01
sprint: 1
assignee: Shruti Saini
estimate_hours: 1
---

# Create a PostgreSQL table for each user's saved books

## Description
Serves the user story COL-01 (add a book to a personal library). This task creates the database structure that is needed to associate books with specific user accounts and prevent the same book from being saved twice by one user. Saving a book to the personal library through the app, displaying the personal library page, changing reading status, and removing a book from the personal library are out of scope.

## Specs
- Define a PostgreSQL table named `saved_books` in `server/src/db/schema.ts`, where each saved-book record points to a user by storing that user's ID. The existing `users.id` column is the source of that ID.
- Input: a database insert providing an existing `user_id` and a non-NULL Open Library work key (the book's OpenLibrary key). The database will assign the row its own row ID and creation timestamp.
- Successful output/state: If the input is valid, PostgreSQL stores one row in `saved_books` containing its generated ID, the supplied `user_id` and `book_key`, and the creation timestamp. The referenced user owns that saved book.
- Invalid owner edge case: inserting a `user_id` that does not exist in `users.id` should be rejected by the foreign-key constraint.
- Missing-value edge cases: omitting or inserting `NULL` for `user_id` or `book_key` should be rejected, as both columns are required.
- Duplicate save edge case: inserting the same `(user_id, book_key)` pair twice should be rejected by a unique constraint, as a user should not be able to save the same book twice. Inserting the same `book_key` for a different existing user should succeed, as two different users may both save the same book.
- Delete state transition: deleting a user removes all rows in `saved_books` for that `user_id` through the foreign-key cascade.
- Apply the schema using the existing `pnpm --dir server db:push` workflow. The test file exercises the exported `savedBooks` table definition in `server/src/db/schema.ts` and the resulting PostgreSQL table and constraints; it does not call an HTTP endpoint or interact with a UI.

## Requirements
- Use the existing Drizzle ORM and PostgreSQL configuration; don't add/use any different methods.
- Preserve the existing `users` and `sessions` table definitions and their behavior, as login and account sessions depend on these tables.
- A saved book must belong to an existing user, and deleting that user must delete their saved-book rows.
- Store the Open Library work key as the book identity. Do not add a second book catalog table.
- Add no runtime dependencies.

## Acceptance criteria
1. Drizzle defines a saved-books table with a generated primary key, required user reference, required Open Library work key, and creation timestamp.
2. A saved-book row cannot reference a user ID that does not exist.
3. Deleting a user cascades to that user's saved-book rows.
4. The database rejects a duplicate `(user_id, book_key)` pair.
5. Two different users can each save a row with the same `book_key`.
6. The existing Drizzle database push workflow can apply the schema.
7. Require both a `user_id` and a `book key`.

## Tests
How to run the tests:
Add `server/src/db/schema.test.ts` using Node's built-in test runner (`node:test`) and assertions (`node:assert/strict`). Our repository requires Node.js 24 or newer, so no additional test dependency is needed. Import the existing database connection and the `savedBooks` and `users` table definitions. Tests should create uniquely named temporary users, perform direct database operations, and clean up the users afterward. No API endpoint or UI element is in scope.

Run the tests against a separate PostgreSQL database named `bookworm_test`; do not run them against the regular or production database. PostgreSQL 16 or newer is supported (the project's README lists this prerequisite). Start one PostgreSQL server on port `5432` before continuing; if another version is already running there, it can be used as long as it is version 16 or newer.

First confirm that the `bookworm` database user can connect:

```sh
psql -h localhost -p 5432 -U bookworm -d postgres -c "SELECT 1;"
```

Create `bookworm_test` once using a PostgreSQL account that has permission to create databases, and make `bookworm` its owner. The `bookworm` application account may be allowed to connect without having permission to create databases. To check whether your current macOS account can create it, run:

```sh
psql -h localhost -p 5432 -d postgres -c "SELECT current_user, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user;"
```

If either permission column is `t`, create the database with that account:

```sh
psql -h localhost -p 5432 -d postgres -c "CREATE DATABASE bookworm_test OWNER bookworm;"
```

If neither is `t`, use a PostgreSQL administrator account instead by adding `-U your_admin_role` to the `psql` command. If `bookworm_test` already exists, skip this creation step. Do not grant `CREATEDB` to the application account just for running these tests.

From the repository root, apply the schema to the test database and run the test file:

```sh
DATABASE_URL=postgres://bookworm:bookworm@localhost:5432/bookworm_test pnpm --dir server db:push
DATABASE_URL=postgres://bookworm:bookworm@localhost:5432/bookworm_test node --test server/src/db/schema.test.ts
```

The test file refuses to run unless `DATABASE_URL` points to a database named `bookworm_test`, so it cannot accidentally run against the team's regular database.

| Test name | Setup | Asserts | Criterion |
|---|---|---|---|
| COL-01-T-4 creates the saved-books table | Apply the Drizzle schema; inspect PostgreSQL table metadata | `saved_books` and required columns exist with declared defaults and constraints | 1, 6 |
| COL-01-T-4 requires an existing user | Insert into `saved_books` with a nonexistent `user_id` | PostgreSQL rejects the insert | 2 |
| COL-01-T-4 requires a user ID and book key | Attempt inserts with either of the required columns omitted | PostgreSQL rejects both inserts | 7 |
| COL-01-T-4 cascades when a user is deleted | Create a temporary user and `saved_books` row, then delete the user | The saved-book row is deleted | 3 |
| COL-01-T-4 rejects a duplicate for one user | Insert the same `(user_id, book_key)` twice into `saved_books` | The second insert is rejected by the unique constraint | 4 |
| COL-01-T-4 allows the same book for different users | Create two temporary users and insert the same `book_key` for both | Both rows are accepted | 5 |
