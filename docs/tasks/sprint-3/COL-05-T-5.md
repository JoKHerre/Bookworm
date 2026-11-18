---
id: COL-05-T-5
story: COL-05
sprint: 3
assignee: Shruti Saini
estimate_hours: 2.5
---

# Add authenticated endpoints to manage collections and their books

## Description

Serves COL-05 (organize books into different collections). This task builds on the `collections` and `collection_books` tables from COL-05-T-1. The API lets a signed-in user list, open, create, rename, and delete their collections and add or remove saved books. The collection controls, book-details assignment interface, My Library presentation, and end-to-end UI testing belong to Tasks 2, 3, 4, and 6.

## Specs

### Endpoint contracts

Mount `collectionsRouter` from `server/src/routes/collections.ts` at `/api/collections` in `server/src/index.ts`, after the existing session middleware. All seven routes require a valid session.

| Method and path                                            | Input                                                   | Success                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/collections`                                     | Optional `bookKey` query parameter                      | `200` with `{ collections: CollectionSummary[] }`, sorted by collection ID ascending. With `bookKey`, each summary also includes `containsBook`. |
| `POST /api/collections`                                    | JSON `{ "name": "Favorites" }`                          | `201` with a `CollectionSummary` for the new empty collection.                                                                                   |
| `GET /api/collections/:collectionId`                       | Collection ID                                           | `200` with `{ collection: CollectionSummary, books: CollectionBook[] }`, with books sorted by saved-book ID ascending.                           |
| `PATCH /api/collections/:collectionId`                     | Collection ID and JSON `{ "name": "Summer Reading" }`   | `200` with the updated `CollectionSummary`.                                                                                                      |
| `DELETE /api/collections/:collectionId`                    | Collection ID                                           | `204` with an empty response body. The collection and its memberships are deleted.                                                               |
| `POST /api/collections/:collectionId/books`                | Collection ID and JSON `{ "bookKey": "/works/OL123W" }` | `201` with the added `CollectionBook`. The work key must identify a book already saved by the signed-in user.                                    |
| `DELETE /api/collections/:collectionId/books/:savedBookId` | Collection ID and saved-book ID                         | `204` with an empty response body. The specified membership is deleted.                                                                          |

- `CollectionSummary` contains `id`, `name`, `createdAt`, and `bookCount`. `bookCount` is a JSON number and is `0` for an empty collection. List responses with `bookKey` add a boolean `containsBook` to each summary, including `false` for an unsaved book or a book outside that collection. This lets the book-details UI show every collection and which ones already contain the book in one request.
- `CollectionBook` is the API shape `{ id, bookKey, readingStatus, createdAt }`, matching a saved book returned by `GET /api/library`. `id` and `createdAt` refer to the saved-library row. Dates are ISO 8601 strings. Titles, covers, and authors can be looked up through the existing book-details flow in the frontend tasks.
- A user with no collections receives `{ "collections": [] }`. Opening an empty collection returns its summary and `books: []`. Renaming retains the collection ID, timestamp, and memberships.
- The same saved book can belong to multiple collections. Removing it from one collection leaves the saved book and its other memberships in place. Deleting a collection leaves its saved books and other collections intact. Deleting a saved book through `DELETE /api/library/:id` uses the Task 1 cascade to clear all of that book's memberships.

### Validation and errors

- Use `parsePositivePostgresId()` in the collections router for both path IDs. Accept strings of decimal digits that represent integers from `1` through `2_147_483_647`. Reject negatives, zero, decimals, scientific notation, nonnumeric values, and values above the PostgreSQL integer limit with `400` and `{ "error": "Invalid collection ID" }` or `{ "error": "Invalid saved book ID" }` as appropriate.
- Use a strict Zod `collectionNameBody` schema for create and rename. Require exactly one string field, `name`. Trim surrounding whitespace before validation and storage. Require 1–100 Unicode code points after trimming, preserve casing and internal text, and reject NUL characters. Invalid names and extra properties return `400` with `{ "error": "Invalid collection name" }`. If PostgreSQL's existing `collections_name_valid` check rejects a name, return the same `400`.
- Use strict Zod `collectionBookBody` and `collectionListQuery` schemas with `openLibraryWorkKey` from `shared/books.ts`. Reject missing or malformed work keys in the add body, malformed or repeated `bookKey` query values, and unexpected body or query fields with `400` and `{ "error": "Invalid book key" }`. A valid work key alone does not save a book or trigger a metadata lookup.
- Missing, invalid, and expired sessions return `401` with `{ "error": "Not logged in" }` for otherwise well-formed requests. Malformed JSON follows the existing Express error handler.
- Opening, renaming, or deleting a missing collection or one owned by another user returns `404` with `{ "error": "Collection not found" }`. Adding to a missing or foreign collection, or adding a book that the caller has not saved, returns `404` with `{ "error": "Collection or saved book not found" }`. Removing a missing or foreign membership returns `404` with `{ "error": "Collection membership not found" }`, including a repeated removal. Missing and foreign resources have the same response for each operation.
- Creating or renaming to a case-insensitive duplicate name for the same user returns `409` with `{ "error": "Collection name already exists" }`. A case-only rename of the same collection succeeds. Adding an existing collection/book pair returns `409` with `{ "error": "Book is already in this collection" }`.
- A rejected request leaves collection and saved-book data intact. Unexpected database errors use the server's existing generic `500` JSON response.

## Requirements

- Use the existing Express, Zod, Drizzle, and PostgreSQL setup. Use `loadSession` and `requireAuth`, and derive the owner only from `res.locals.user.id`. Use owner-scoped reads and writes, including when looking up a work key in `saved_books`. Reject extra request fields such as `userId`.
- Use the Task 1 schema and its constraints as the final authority for uniqueness and ownership. Handle the named collection name index and membership primary key conflicts even when writes race. Use an owner-scoped insert or a transaction for adding a membership, and translate a concurrent deletion of its collection or saved book into the add route's `404`.
- Reuse `saved_books` fields for returned book data and derive counts and membership flags from current rows. Use a grouped or set-based query for collection summaries so listing many collections does not require one query per collection.
- Keep existing library, reading-status, auth, ratings, and books endpoint contracts intact. Use Task 1's cascade behavior for deletes. Add no dependencies, database schema changes, or frontend changes.

## Acceptance criteria

1. Each of the seven routes rejects a request without a valid session with `401`.
2. Listing returns only the signed-in user's collections, ordered by ID, with accurate counts and an empty array when the user owns none.
3. Listing with a valid `bookKey` returns the correct `containsBook` flag on every owned collection.
4. Creation returns `201` and persists one empty collection for the signed-in user with the trimmed name and generated fields.
5. Invalid names, IDs, work keys, and unexpected request fields return the specified `400` without mutating data.
6. Same-owner duplicate names return `409` on create and rename, while different owners can use the same name.
7. Opening a collection returns its summary and only its saved-book rows, in ID order, including their current reading statuses.
8. Renaming returns the updated name and preserves the ID, timestamp, and memberships, including on a case-only rename.
9. Adding a saved book returns `201` and creates one membership, with the same saved book allowed in another collection.
10. Repeating an add returns `409` and leaves exactly one membership for the pair.
11. Removing a membership returns `204` and preserves the saved book, collection, and unrelated memberships.
12. Deleting a collection returns `204` and removes its memberships while preserving saved books and other collections.
13. Missing and foreign resources return the same `404` per operation without exposing or changing another user's records.
14. Removing a saved book through the existing library endpoint clears its collection memberships and updates the collection responses.
15. Concurrent duplicate writes preserve uniqueness and return the specified conflict response. Concurrent deletion of an add target does not leave an orphan or return an unhandled constraint error.
16. New endpoint tests, existing backend tests, and project checks pass.

## Tests

Add `server/backend_tests/collections.test.ts` using `node:test` and `node:assert/strict`. The file calls every endpoint in the contract table and uses `DELETE /api/library/:id` for the cascade regression. There are no UI elements under test.

- Use a temporary Express app with `express.json()`, `cookieParser()`, and `loadSession()`. Mount `collectionsRouter` and `libraryRouter` on their production paths. The tests exercise the collection handlers, `parsePositivePostgresId()`, `collectionNameBody`, `collectionBookBody`, and `collectionListQuery` in `server/src/routes/collections.ts`, `openLibraryWorkKey` in `shared/books.ts`, `loadSession()` and `requireAuth()` in `server/src/auth/middleware.ts`, and the library delete handler in `server/src/routes/library.ts`. Check the matching production mount in `server/src/index.ts` during review.
- Use `assertTestDatabaseUrl()` and `createTestBookKey()` from `server/backend_tests/test-utils.ts`. Use `generateSessionToken()` and `createSession()` from `server/src/db/session.ts` to create real sessions for temporary users. Use `db` and `pool` from `server/src/db/index.ts` and the `users`, `sessions`, `collections`, `collectionBooks`, and `savedBooks` definitions in `server/src/db/schema.ts` for setup and persisted-state checks.
- Run `pnpm --dir server db:push` against `bookworm_test` before testing. Clean up temporary users and close the test HTTP server and database pool afterward. Run `pnpm --dir server test`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm build` for regression coverage.

| Test name                                                      | Setup                                                                                                                                                                 | Asserts                                                                                                                                     | Criteria |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `COL-05-T-5 requires a valid session for all routes`           | Call each route with otherwise valid inputs and no cookie, an invalid cookie, and an expired session                                                                  | Each response is `401` and collection, membership, and book rows are intact                                                                 | 1        |
| `COL-05-T-5 lists owned collections and counts`                | Create empty and populated collections for two users and list for each user and a third user with no collections                                                      | Only owned summaries appear, sorted by ID, with exact counts and `[]` for the third user                                                    | 2        |
| `COL-05-T-5 reports membership for a work key`                 | Save one work for two users and place each saved row in different collections. List with that key and a valid unsaved key                                             | Flags reflect only the caller's saved row, and the unsaved key returns `false` for every collection                                         | 3        |
| `COL-05-T-5 creates an empty collection with a trimmed name`   | POST a name with surrounding whitespace, then read the stored row                                                                                                     | `201` includes the generated ID and timestamp, trimmed name, and zero count. The row belongs to the caller                                  | 4        |
| `COL-05-T-5 rejects invalid names, IDs, and work keys`         | Exercise missing, null, whitespace-only, overlength, and NUL names, malformed or out-of-range IDs, invalid or repeated work keys, and extra fields including `userId` | Each request returns the documented `400` and data is intact                                                                                | 5        |
| `COL-05-T-5 scopes name conflicts to an owner`                 | Create `Favorites`, attempt `favorites` for that user, rename another of their collections to the same name, then create `Favorites` for a second user                | Conflicting create and rename return `409` with no changes. The second user succeeds                                                        | 6        |
| `COL-05-T-5 opens empty and populated collections`             | Seed an empty collection and a collection with multiple books and a nondefault reading status. Keep an unrelated saved book outside both                              | Exact response shapes, counts, book IDs, ISO timestamps, reading statuses, ID ordering, and empty `books` match the contract                | 7        |
| `COL-05-T-5 renames a collection without changing membership`  | Rename a populated collection and then change only its capitalization                                                                                                 | Both return `200`, with stable ID, timestamp, count, and membership rows                                                                    | 8        |
| `COL-05-T-5 adds one saved book to multiple collections`       | Save a work and add its key to two collections                                                                                                                        | Both return `201` with the original saved-book fields. Two memberships point to the same saved row                                          | 9        |
| `COL-05-T-5 rejects a duplicate membership`                    | Add a saved book twice to one collection                                                                                                                              | The second add returns `409` and exactly one membership persists                                                                            | 10       |
| `COL-05-T-5 removes only the specified membership`             | Place one saved book in two collections, remove one membership, then repeat the removal                                                                               | First response is an empty `204`, second is `404`, and the saved book, collection, and other membership survive                             | 11, 13   |
| `COL-05-T-5 deletes a collection without deleting saved books` | Put a saved book in two collections and delete one collection                                                                                                         | Empty `204`, deleted collection and memberships absent, saved book and other membership present                                             | 12       |
| `COL-05-T-5 hides missing and foreign resources`               | Try detail, rename, delete, add, and remove with unknown and foreign IDs. Try adding a work saved only by another user                                                | Each pair gives the same `404` response. No foreign data appears or changes                                                                 | 13       |
| `COL-05-T-5 reflects removal from the personal library`        | Add one saved book to two collections, then call the existing library delete endpoint                                                                                 | Library delete retains its `204` response. Collection detail and list reflect zero memberships for the removed book                         | 14       |
| `COL-05-T-5 handles simultaneous duplicate writes`             | Send concurrent same-name create requests and concurrent adds of the same pair                                                                                        | Each pair yields one `201` and one `409`, with one persisted row                                                                            | 15       |
| `COL-05-T-5 handles deletion during a membership add`          | Race an add against deletion of its collection or saved book                                                                                                          | The add succeeds before deletion or returns the documented `404`. The completed deletion leaves no orphan and neither request returns `500` | 15       |
| Existing backend suite and project checks                      | Apply the schema to `bookworm_test` and run the repository checks above                                                                                               | Endpoint, schema, library, and other regression tests pass. Lint, formatting, type checking, and build succeed                              | 16       |
