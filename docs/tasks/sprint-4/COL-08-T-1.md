---
id: COL-08-T-1
story: COL-08
sprint: 4
assignee: Shruti Saini
estimate_hours: 2
---

# Create a table for users' book notes

## Description

Serves COL-08 (add notes to books to keep track of different thoughts about them). This database-only task stores multiple private notes per user and book, including note text, an optional page/chapter reference, and creation and update timestamps.

Notes belong to a user and an Open Library work key, independently of whether the book is saved in My Library. This follows the existing book-rating model and preserves a user's writing if they remove a book from their library. Notes are separate from quotes; quote storage belongs to COL-09.

CRUD endpoints and request authentication (COL-08-T-2), writing/editing/deleting controls (COL-08-T-3), saved-note presentation (COL-08-T-4), and end-to-end feature testing (COL-08-T-5) are out of scope. This task includes direct database checks of the new schema.

## Specs

### Stored data

Define and export `bookNotes` for PostgreSQL table `book_notes` in `server/src/db/schema.ts`, together with the inferred `BookNote` select type.

| Column       | Drizzle property | Stored behavior                                                                                                                                                                              |
| ------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `id`             | Automatically generated integer identity primary key; identifies one note for later editing/deletion                                                                                         |
| `user_id`    | `userId`         | Required integer referencing `users.id`, with `ON DELETE CASCADE`                                                                                                                            |
| `book_key`   | `bookKey`        | Required text containing an Open Library work key in the form `/works/OL` + one or more digits + `W`, such as `/works/OL45804W`                                                              |
| `content`    | `content`        | Required plain text, 1–10,000 PostgreSQL characters, containing at least one non-whitespace character                                                                                        |
| `reference`  | `reference`      | Optional text for a page/chapter reference, such as `Page 42` or `Chapter 3`; defaults to `NULL`; when present, 1–100 PostgreSQL characters containing at least one non-whitespace character |
| `created_at` | `createdAt`      | Required timestamp with time zone, defaulting to insertion time                                                                                                                              |
| `updated_at` | `updatedAt`      | Required timestamp with time zone, defaulting to insertion time                                                                                                                              |

### Behavior and edge cases

- A user/book pair may have zero, one, or many notes. Each insert creates a separate ID, even when the content matches another note. Do not add uniqueness on `(user_id, book_key)` or on note content.
- Different users may each have notes for the same book key. A note references exactly one owner and one book key; no `saved_books` row or collection membership is required.
- Enforce the complete book-key format with a database check, rejecting empty values, surrounding whitespace, edition keys, and malformed work keys. There is no local books table to reference; this task does not contact Open Library to verify that a work exists.
- Enforce content and reference lengths and non-whitespace rules with database checks. Whitespace-only means matching PostgreSQL `^[[:space:]]*$`, including spaces, tabs, and line breaks. Missing or `NULL` content is rejected. An omitted or `NULL` reference is accepted; an empty or whitespace-only reference is rejected.
- Preserve valid text exactly as supplied, including Unicode, punctuation, leading/trailing spaces, and line breaks. Do not trim, render, or interpret markup in this storage task. Length limits count PostgreSQL characters, not bytes.
- Inserting an existing user ID, valid book key, and valid content returns the stored row with generated ID and timestamps. Both timestamps initially use the database insertion-time default.
- Direct database updates can replace the content/reference and explicitly set `updated_at`, preserving the note ID, owner, book key, and `created_at`. Follow the existing ratings convention: there is no automatic update trigger; COL-08-T-2 must explicitly set `updated_at` on successful edits. A failed update leaves the previous row intact.
- Deleting one note preserves its user and all other notes. Deleting a user cascades to that user's notes and preserves other users' notes. Removing a saved book or collection does not delete notes.
- Add a non-unique index on `(user_id, book_key)` for owner-scoped lookups. Its leading `user_id` also supports user-deletion cleanup. Retrieval ordering and HTTP response shapes belong to COL-08-T-2.

### Verification touchpoints

- Schema: `bookNotes`, `BookNote`, and existing `users` in `server/src/db/schema.ts`; existing `savedBooks` and `collections` are used to verify independent deletion behavior.
- Database access: `db` and `pool` from `server/src/db/index.ts`. Tests use Drizzle `db.insert()`, `db.select()`, `db.update()`, `db.delete()`, and raw `pool.query()` for schema metadata and invalid SQL inputs.
- Tests: add `COL-08-T-1` cases to `server/backend_tests/schema.test.ts`, reusing `createTestUser()`, `hasPostgresErrorCode()`, and the existing cleanup hook. Use `assertTestDatabaseUrl()`, `createTestBookKey()`, and `eq` from `server/backend_tests/test-utils.ts`.
- Schema application: existing `pnpm --dir server db:push`, configured by `server/drizzle.config.ts` and `server/package.json`. Backend regression checks use `pnpm --dir server test`; type checks use root `pnpm typecheck`.
- These new tests call no API endpoint, authentication middleware, external service, or UI element.

## Requirements

- Use the existing PostgreSQL database and Drizzle ORM. Follow the existing direct schema-push workflow; add no migration system or runtime dependencies.
- Enforce required values, owner existence, book-key validity, and text validity in the database, not only in TypeScript or future endpoint validation.
- Keep ownership explicit through `user_id`. Database constraints establish ownership relationships but do not authenticate callers or make reads private. COL-08-T-2 must use the existing `requireAuth` middleware in `server/src/auth/middleware.ts`, derive ownership from the session, and restrict every note read/write to that owner.
- Preserve existing tables, records, indexes, constraints, defaults, deletion rules, authentication behavior, and API contracts. Applying this task is additive and must not alter or delete existing data.
- Do not store quote-specific fields, book metadata, note counts, or UI state in `book_notes`. A note has no required title.
- Use existing `node:test` and `node:assert/strict` conventions for database tests. Run only against `bookworm_test`, retaining the database URL guard and cleanup of temporary users and dependent records.

## Acceptance criteria

1. `server/src/db/schema.ts` exports `bookNotes` and `BookNote`, and PostgreSQL exposes `book_notes` with all specified columns, types, nullability, primary key, owner foreign key, defaults, and lookup index.
2. Inserting a valid note without an ID, reference, or timestamps produces a generated ID, `NULL` reference, and valid creation/update timestamps.
3. One user can store multiple notes for one book, including identical content; different users can store notes for the same book without conflicts.
4. A valid work key can receive notes without a saved-library row, while missing, null, or malformed book keys are rejected by the database.
5. Content of 1 and 10,000 characters is accepted, including multiline and Unicode text; missing, null, empty, whitespace-only, and over-limit content is rejected on inserts and updates.
6. An omitted or null reference is accepted; valid references of 1 and 100 characters are accepted, while empty, whitespace-only, and over-limit references are rejected on inserts and updates.
7. A direct content/reference edit with an explicit replacement `updated_at` preserves note identity, ownership, book key, and creation time; a rejected edit preserves the previous stored row.
8. Missing, null, and nonexistent owner IDs are rejected; deleting an existing owner removes their notes and preserves another owner's notes.
9. Deleting one note preserves its owner and other notes; deleting a saved-book row or collection preserves notes for that book.
10. Applying and reapplying the schema through the existing push workflow preserves existing data, and the new database cases, existing backend tests, and project type checks pass.

## Tests

All new cases live in `server/backend_tests/schema.test.ts` and use the guarded `bookworm_test` PostgreSQL database. The criterion numbers below refer to the acceptance criteria above.

| Test name (prefixed with `COL-08-T-1`)                                  | Criteria |
| ----------------------------------------------------------------------- | -------- |
| `creates the book-notes table with constraints and index`               | 1        |
| `generates note identity and timestamps with a null reference`          | 2, 6     |
| `allows multiple notes and owners without saved books`                  | 3, 4     |
| `rejects missing and malformed book keys`                               | 4        |
| `preserves valid content and references at length boundaries`           | 5, 6     |
| `rejects invalid text on inserts and updates without changing the note` | 5, 6, 7  |
| `edits text with an explicit timestamp and preserves note identity`     | 7        |
| `rejects missing and nonexistent owners`                                | 8        |
| `cascades notes only for the deleted owner`                             | 8        |
| `deletes one note without deleting its owner or other notes`            | 9        |
| `preserves notes when saved books or collections are deleted`           | 9        |
| `preserves existing data across repeated schema pushes`                 | 10       |

The repeated-push test seeds users, sessions, saved books, collections, memberships, ratings, genre preferences, and notes. It runs the existing `db:push` workflow twice against the guarded test database and verifies that those records remain unchanged after each push. Apply the schema before running the suite. Full backend regression tests and root type checking complete criterion 10's validation.
