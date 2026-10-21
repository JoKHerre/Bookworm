---
id: COL-01-T-3
story: COL-01
sprint: 1
assignee: Shruti Saini
estimate_hours: 2
---

# Add an authenticated endpoint for saving a book

## Description

Serves COL-01 (add a book to a personal library). This task creates the backend endpoint that lets a signed-in user save an Open Library work to their personal library. It also completes COL-01 Task 5 by requiring an authenticated session and assigning the saved book to the signed-in user. The personal-library page, save button, listing saved books, reading status, and removing books are out of scope.

## Specs

- Add our endpoint, `POST /api/library` in `server/src/routes/library.ts`, and mount the router from `server/src/index.ts` at `/api/library`.
- Input: JSON body `{ "bookKey": "/works/OL123W" }`. `bookKey` must be a string matching the existing Open Library work-key format: `^/works/OL\d+W$`. A user ID should not be accepted in the request body.
- Authentication state: the route will use the existing `loadSession` and `requireAuth` middleware to check whether the request has a valid login session. If there is no valid session, should return HTTP code 401 with `{ "error": "Not logged in" }`, and should not create a saved-book row.
- Successful output/state: for an authenticated request with a valid book key not already saved by that user (as no duplicate books allowed), should insert one row into `saved_books` using the authenticated user's ID from `res.locals.user`. Should then return HTTP code 201 with the created row's `id`, `userId`, `bookKey`, and `createdAt`.
- Invalid-input edge cases: a missing, null, non-string, or malformed `bookKey`, or a body containing a `userId`, should return HTTP code 400 with `{ "error": "Invalid book key" }`. No row created.
- Duplicate edge case: if the authenticated user already has that `bookKey`, return HTTP code 409 with `{ "error": "Book is already in your library" }`. Should not create a second row.
- Different-user state: another authenticated user may save the same `bookKey`; the existing `(user_id, book_key)` uniqueness rule is scoped to one user's library. Second user should not be blocked from saving book.
- Tests exercise `POST /api/library`, `server/src/routes/library.ts`, `server/src/index.ts`, the existing `loadSession`/`requireAuth` middleware, and the `savedBooks` table in `server/src/db/schema.ts`.

## Requirements

- Use the existing Express router, Drizzle database connection, `savedBooks` table, and session authentication middleware.
- Determine the row's `user_id` only from the authenticated session; never trust a user ID supplied by a client.
- Return only the authenticated user's newly created saved-book row; do not add an endpoint for reading or deleting library rows in this task.
- Preserve the existing authentication, book-search, and book-details routes.
- Do not add any new runtime dependencies.

## Acceptance criteria

1. `POST /api/library` is mounted and accepts a JSON body containing a valid Open Library work key.
2. A request without a valid login session returns HTTP code 401 with `{ "error": "Not logged in" }` and creates no row.
3. A valid authenticated request creates exactly one `saved_books` row for the authenticated user and returns HTTP 201 with its `id`, `userId`, `bookKey`, and `createdAt`.
4. Any missing, null, non-string, or malformed `bookKey` values return HTTP code 400 with `{ "error": "Invalid book key" }` and create no row.
5. A request that includes `userId` in its body returns HTTP code 400; clients should not be able to select which account owns the saved book.
6. Saving the same book twice for one user returns HTTP code 409 with `{ "error": "Book is already in your library" }`; the database still contains only one row for that user and key.
7. Two different authenticated users can each save the same book key.

## Tests

Add `server/src/routes/library.test.ts` using Node's built-in `node:test` runner and `node:assert/strict`; no additional test dependency is needed. The tests start a temporary Express server that mounts the real library router behind the existing JSON parser, cookie parser, and `loadSession` middleware. Create temporary users and sessions in the test database, send HTTP requests to the temporary server, assert the response and database state, then delete the users and close the server and database pool.

Use the separate PostgreSQL database `bookworm_test` from COL-01-T-4. The test file must refuse to run unless `DATABASE_URL` names `bookworm_test`. From the repository root, apply the schema if needed and run the route tests:

```sh
DATABASE_URL=postgres://bookworm:bookworm@localhost:5432/bookworm_test pnpm --dir server db:push
DATABASE_URL=postgres://bookworm:bookworm@localhost:5432/bookworm_test node --test server/src/routes/library.test.ts
```

| Test name                                               | Setup                                                                  | Asserts                                                      | Criterion |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| COL-01-T-3 rejects an unauthenticated save              | POST a valid `bookKey` without a session cookie                        | HTTP 401 and no saved-book row                               | 2         |
| COL-01-T-3 saves a book for the signed-in user          | Create a user and session; POST a valid key with that session cookie   | HTTP 201; response fields match; row belongs to that user    | 1, 3      |
| COL-01-T-3 rejects invalid book keys                    | Authenticated POSTs with missing, null, non-string, and malformed keys | HTTP 400 for each; no rows created                           | 4         |
| COL-01-T-3 does not accept a client-supplied user ID    | Authenticated POST with a `userId` field in the body                   | HTTP 400; no row is created for either account               | 5         |
| COL-01-T-3 rejects a duplicate save                     | Authenticated user saves a key, then posts the same key again          | First response is 201; second is 409; exactly one row exists | 6         |
| COL-01-T-3 allows different users to save the same book | Two authenticated users each POST the same key                         | Both responses are 201; one row exists for each user         | 7         |
