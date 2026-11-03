---
id: COL-02-T-3
story: COL-02
sprint: 2
assignee: Shruti Saini
estimate_hours: 2
---

# Update a saved book's reading status

## Description

Serves COL-02 (track the reading status of books in a user's personal library). This combined task creates the authenticated API operation that changes a saved book's status and persists the change in the existing `saved_books` row. It covers the backend work from COL-02 Task 3. Adding a status dropdown, displaying statuses in the personal-library page, and UI-level interaction tests are out of scope and remain for the related frontend tasks.

## Specs

- Add `PATCH /api/library/:id/reading-status` to the existing library router in `server/src/routes/library.ts`, mounted at `/api/library` by `server/src/index.ts`.
- Input: a positive base-10 saved-book row ID in `:id` and a JSON body exactly shaped as `{ "readingStatus": "currently_reading" }`. `readingStatus` must be one of `to_be_read`, `currently_reading`, or `finished`, matching the PostgreSQL enum defined by `savedBooks.readingStatus` in `server/src/db/schema.ts`.
- Authentication: run the existing `requireAuth` middleware. If the request has no valid session, return HTTP 401 with `{ "error": "Not logged in" }`; do not change any row.
- Successful update: for an authenticated request with a valid ID and status, update only that saved-book row's `reading_status`, and only when its `user_id` matches the authenticated user in `res.locals.user`. Return HTTP 200 with `{ "id": <saved-book-id>, "readingStatus": "<stored-status>" }`.
- Repeating a request with the row's current status is successful and returns HTTP 200 with that status. Updating the status must not create a new saved-book row or change its owner, book key, ID, or creation timestamp.
- Invalid ID: a non-numeric, non-positive, unsafe, or out-of-PostgreSQL-integer-range ID returns HTTP 400 with `{ "error": "Invalid saved book ID" }`; no row changes.
- Invalid body: a missing, null, non-string, or unsupported `readingStatus`, or a body containing unexpected properties, returns HTTP 400 with `{ "error": "Invalid reading status" }`; no row changes.
- Missing or unowned row: a valid ID that does not exist, or belongs to another user, returns HTTP 404 with `{ "error": "Book not found in your library" }`. Do not reveal whether another user's row exists, and do not change it.
- Tests exercise `PATCH /api/library/:id/reading-status`, `libraryRouter` in `server/src/routes/library.ts`, the existing session loading and `requireAuth` middleware, and the `savedBooks` table. In `server/backend_tests/library.test.ts`, the temporary Express app uses the JSON parser, cookie parser, and `loadSession`; tests use the existing test-user/session helpers and inspect persisted rows through the database.

## Requirements

- Use the existing Express library router, Zod validation, Drizzle database connection, `savedBooks` table, and session authentication middleware. Do not add dependencies or use raw SQL for the update.
- Accept only the three statuses already defined in `server/src/db/schema.ts`; keep the database enum as the final protection against unsupported values.
- Identify the owner exclusively from the authenticated session. Scope the update by both saved-book ID and authenticated user ID.
- Preserve the existing `GET /api/library`, `POST /api/library`, and `DELETE /api/library/:id` behavior and response shapes. In particular, do not change save or removal behavior as part of this task.
- Do not add a status dropdown, change the personal-library UI, or add a new database table.

## Acceptance criteria

1. An authenticated request to `PATCH /api/library/:id/reading-status` with a valid saved-book ID and one of the three supported statuses returns HTTP 200 and the saved-book ID and persisted status.
2. The requested status is stored on the existing `saved_books` row; changing it does not create another row or modify the row's owner, book key, ID, or creation timestamp.
3. A request without a valid session returns HTTP 401 and leaves the row unchanged.
4. Malformed, non-positive, unsafe, and out-of-range IDs return HTTP 400 with the invalid-ID error and make no database changes.
5. Missing, null, non-string, unsupported, or extra-field request bodies return HTTP 400 with the invalid-status error and make no database changes.
6. A valid ID for a nonexistent row or another user's row returns HTTP 404 with the not-found error; another user's row remains unchanged.
7. The same user can change one saved book through each supported status, and repeating the current status succeeds without creating a duplicate row.
8. Existing library endpoint behavior and all existing backend tests remain intact.

## Tests

Test file: `server/backend_tests/library.test.ts`. Use Node's built-in `node:test` and `node:assert/strict` with the separate PostgreSQL database `bookworm_test`. Keep the existing test setup: apply `server/src/db/schema.ts` with `pnpm --dir server db:push`, start the temporary Express app with `express.json()`, `cookieParser()`, `loadSession`, and `libraryRouter`, create temporary users and sessions, and remove temporary users and close the server and database pool afterward. Add a `patchReadingStatus(id, body, token?)` helper parallel to the existing `postBook` and `deleteBook` helpers. Assert both HTTP responses and the database state using `rowsForBook` or a query scoped to the saved-book ID.

| Test name                                                          | Setup                                                                                                                            | Asserts                                                                                                                                        | Criterion |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `COL-02-T-3 updates a saved book's reading status`                 | Create a signed-in user and saved book; PATCH its ID with `currently_reading`                                                    | HTTP 200 response contains the ID and status; the same database row stores `currently_reading`                                                 | 1, 2      |
| `COL-02-T-3 allows changing between all supported statuses`        | Create one saved book (initially `to_be_read`); PATCH it successively to all three supported values, then repeat the final value | Each response and database read has the requested status; exactly one row exists and its ID, owner, key, and creation timestamp stay unchanged | 2, 7      |
| `COL-02-T-3 rejects an unauthenticated status update`              | Create a saved book for a signed-in user; PATCH without a session cookie                                                         | HTTP 401 with `Not logged in`; stored status remains unchanged                                                                                 | 3         |
| `COL-02-T-3 rejects invalid saved-book IDs`                        | Send authenticated PATCH requests with non-numeric, zero, negative, unsafe, and out-of-range IDs                                 | Each returns HTTP 400 with `Invalid saved book ID`; no row changes                                                                             | 4         |
| `COL-02-T-3 rejects invalid reading statuses`                      | For an existing row, PATCH with a missing, null, non-string, unsupported status and with an extra body property                  | Each returns HTTP 400 with `Invalid reading status`; row remains unchanged                                                                     | 5         |
| `COL-02-T-3 does not update another user's saved book`             | Create two signed-in users; PATCH the first user's saved-book ID using the second user's session                                 | HTTP 404 with `Book not found in your library`; the first user's row remains unchanged                                                         | 6         |
| `COL-02-T-3 returns not found for a missing saved book`            | PATCH an authenticated request with a valid positive ID that has no saved-book row                                               | HTTP 404 with `Book not found in your library`                                                                                                 | 6         |
| Existing `COL-01-T-3`, COL-03, and COL-01-T-4 library/schema tests | Run the existing backend suite against `bookworm_test`                                                                           | Existing save, remove, authentication, schema, and ownership behavior continues to pass                                                        | 8         |
