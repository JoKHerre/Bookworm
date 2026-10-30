---
id: COL-02-T-1
story: COL-02
sprint: 2
assignee: Shruti Saini
estimate_hours: 2
---

# Add a default reading status to saved books

## Description

Serves COL-02 (track the reading status of books in a user's personal library). This task adds a database field to each saved-book row to record whether the book is to be read, currently being read, or finished. It defines the stored status values and the default for existing and newly saved books. Updating the status through an endpoint, adding a dropdown, displaying status in the UI, and testing status changes through the app are out of scope for this database-only task.

## Specs

- Add a non-null `reading_status` column to the existing PostgreSQL `saved_books` table defined by `savedBooks` in `server/src/db/schema.ts`.
- The stored values are `to_be_read`, `currently_reading`, and `finished`. These stable values correspond to the UI labels “TBR”, “Currently reading”, and “Finished”.
- The column defaults to `to_be_read`. Existing rows receive this value when the schema is applied, and new saved-book rows that omit the column receive the same value.
- A row may store any of the three allowed values. A value outside that set, or `NULL`, is rejected by the database.
- Keep the existing saved-book ID, user reference and delete cascade, book key, creation timestamp, and `(user_id, book_key)` uniqueness behavior intact.
- Apply the updated schema using the existing `pnpm --dir server db:push` workflow. Tests exercise the `savedBooks` definition in `server/src/db/schema.ts` and the resulting PostgreSQL `saved_books` table using `server/backend_tests/schema.test.ts`. No API endpoint or UI element is called.

## Requirements

- Use the existing Drizzle ORM and PostgreSQL configuration in `server/src/db/schema.ts` and `server/drizzle.config.ts`.
- Represent the allowed statuses in the database schema so invalid values cannot be stored. Use Drizzle's PostgreSQL enum support for the three values.
- Set the database default to `to_be_read`; do not require existing rows to be manually updated.
- Preserve all existing `saved_books` columns, constraints, indexes, and user-deletion cascade behavior.
- Do not add an endpoint, UI, a separate status table, or runtime dependencies in this task.

## Acceptance criteria

1. The Drizzle `savedBooks` definition includes a non-null `reading_status` column with exactly `to_be_read`, `currently_reading`, and `finished` as allowed values.
2. The database defaults an omitted status to `to_be_read` for both existing rows during schema application and newly inserted rows afterward.
3. The database accepts each of the three allowed statuses and rejects an unsupported value and `NULL`.
4. The existing saved-book columns, unique `(user_id, book_key)` constraint, and user foreign-key cascade remain intact.
5. The existing Drizzle database push workflow applies the updated schema to PostgreSQL.

## Tests

Test file: `server/backend_tests/schema.test.ts`. Use the existing Node.js built-in test runner and PostgreSQL test database setup. The tests inspect the `saved_books` table and perform direct database inserts; they do not call an API endpoint or render a UI element. Run against the separate `bookworm_test` database using the existing `DATABASE_URL` guard and schema-push workflow documented in the test file or repository task instructions.

| Test name | Setup | Asserts | Criterion |
| --- | --- | --- | --- |
| COL-02-T-1 adds the default reading status column | Apply the Drizzle schema and inspect `saved_books` column metadata; insert a row without `reading_status` | Column exists, is non-null, and the inserted row has `to_be_read` | 1, 2, 5 |
| COL-02-T-1 defaults existing saved books to TBR | Insert a saved-book row before applying the updated schema, then push the schema | Existing row has `to_be_read` after schema application | 2, 5 |
| COL-02-T-1 accepts each supported status | Insert separate rows using `to_be_read`, `currently_reading`, and `finished` | All three values are stored unchanged | 1, 3 |
| COL-02-T-1 rejects unsupported or null statuses | Attempt inserts with an unsupported string and with `NULL` | PostgreSQL rejects both inserts | 3 |
| COL-02-T-1 preserves saved-book constraints | Inspect existing table constraints, then verify a duplicate user/book pair fails and deleting a user cascades | Uniqueness and foreign-key cascade continue to work | 4 |
