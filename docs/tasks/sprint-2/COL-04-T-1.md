---
id: COL-04-T-1
story: COL-04
sprint: 2
assignee: Natalie Marks
estimate_hours: 1
---

# Add a book ratings table

## Description

Serves COL-04 (rate books to record opinions on books the user has read). This task adds the database table that stores one 1–5 star rating per user per book. A rating is independent of the user's personal library, so a book can be rated whether or not it has been saved. Endpoints, the rating control, and displaying ratings are out of scope for this database-only task.

## Specs

- Add a `book_ratings` table, defined as `bookRatings` in `server/src/db/schema.ts`, with columns `id` (generated identity primary key), `user_id`, `book_key`, `rating`, `created_at`, and `updated_at`. All columns are non-null.
- `user_id` references `users.id` and cascades on user deletion. `book_key` is an Open Library work key, as in `saved_books`.
- `rating` is an integer. A check constraint (`book_ratings_rating_range`) restricts it to 1 through 5 inclusive.
- `created_at` and `updated_at` default to the current time.
- A unique index on `(user_id, book_key)` allows one rating per user per book. Different users may rate the same book.
- Apply the schema with the existing `pnpm --dir server db:push` workflow. Tests inspect the table and insert rows directly in `server/backend_tests/schema.test.ts`; no endpoint or UI is called.

## Requirements

- Use the existing Drizzle ORM and PostgreSQL configuration. Do not add dependencies.
- Do not modify the `saved_books` table; ratings must not depend on a book being saved.
- Do not add an endpoint or UI in this task.

## Acceptance criteria

1. `bookRatings` defines the non-null columns listed above.
2. The database accepts ratings 1 through 5 and rejects 0, 6, negative values, and `NULL`.
3. A second rating for the same `(user_id, book_key)` is rejected; another user can rate the same book.
4. Deleting a user deletes their ratings.
5. `pnpm --dir server db:push` applies the schema.

## Tests

Test file: `server/backend_tests/schema.test.ts`, run against the `bookworm_test` database.

| Test name                                            | Setup                                                  | Asserts                                                         | Criterion |
| ---------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | --------- |
| `COL-04-T-1 creates the book-ratings table`          | Inspect `book_ratings` column metadata                 | Expected columns exist and are all non-null                     | 1, 5      |
| `COL-04-T-1 accepts ratings from 1 to 5`             | Insert one row per value 1–5                           | Each is stored unchanged                                        | 2         |
| `COL-04-T-1 rejects out-of-range and null ratings`   | Insert 0, 6, -1, and `NULL`                            | Check violation (23514) for numbers; not-null violation (23502) | 2         |
| `COL-04-T-1 allows one rating per user per book`     | Duplicate insert for one user; same book for two users | Duplicate rejected (23505); second user's insert succeeds       | 3         |
| `COL-04-T-1 cascades ratings when a user is deleted` | Delete a user who has a rating                         | No rating rows remain for that user                             | 4         |
