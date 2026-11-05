---
id: COL-04-T-3
story: COL-04
sprint: 2
assignee: Natalie Marks
estimate_hours: 0.5
---

# Add an endpoint to save or update a book's rating

## Description

Serves COL-04 (rate books to record opinions on books the user has read). This task creates the authenticated API operation that saves a signed-in user's 1–5 rating of a book, replacing any earlier rating by that user for the same book. It builds on the `book_ratings` table from COL-04-T-1. The rating control and displaying ratings are out of scope.

## Specs

- Add `PUT /api/ratings` in a new router, `ratingsRouter` in `server/src/routes/ratings.ts`, mounted at `/api/ratings` by `server/src/index.ts`.
- Input: a JSON body exactly shaped as `{ "bookKey": "/works/OL123W", "rating": 4 }`. `bookKey` must match the Open Library work-key format; `rating` must be an integer from 1 to 5. The body schema lives in `shared/ratings.ts` so the frontend can share its limits.
- Authentication: run the existing `requireAuth` middleware. Without a valid session, return HTTP 401 with `{ "error": "Not logged in" }` and change nothing.
- Success: insert a `book_ratings` row for the authenticated user (from `res.locals.user`), or, if that user already rated the book, update `rating` and `updated_at` on the existing row. Return HTTP 200 with `{ "bookKey": "...", "rating": <n> }`.
- The book does not need to be saved in the user's library.
- Invalid body: a missing, null, non-integer, out-of-range, or non-numeric `rating`; a missing or malformed `bookKey`; or any unexpected property (such as `userId`) returns HTTP 400 with `{ "error": "Invalid rating" }` and changes nothing.

## Requirements

- Use the existing Express, Zod, Drizzle, and session middleware. Do not add dependencies or use raw SQL.
- Identify the owner only from the session; never from the request body.
- Do not change existing library, books, or auth behavior.

## Acceptance criteria

1. An authenticated request with a valid `bookKey` and rating returns 200 and stores the rating for that user.
2. A repeat request for the same book updates the existing row (same ID and `created_at`) rather than creating another.
3. Unauthenticated requests return 401 and change nothing.
4. Invalid ratings, invalid book keys, and extra fields return 400 and change nothing.
5. Two users rating the same book get separate rows.

## Tests

Test file: `server/backend_tests/ratings.test.ts` (`node:test`, `bookworm_test` database, temporary Express app with `express.json()`, `cookieParser()`, `loadSession`, and `ratingsRouter`).

| Test name                                                       | Setup                                               | Asserts                                                        | Criterion |
| --------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- | --------- |
| `COL-04-T-3 rejects an unauthenticated rating`                  | PUT without a session cookie                        | 401 `Not logged in`; no row                                    | 3         |
| `COL-04-T-3 saves a new rating for the signed-in user`          | PUT a valid body with a session                     | 200 with `bookKey` and `rating`; one row owned by the user     | 1         |
| `COL-04-T-3 updates an existing rating without a duplicate row` | PUT 2, then PUT 5 for the same book                 | 200 with 5; one row with same ID and `created_at`; rating is 5 | 2         |
| `COL-04-T-3 rejects invalid ratings`                            | PUT 0, 6, -1, 2.5, `"4"`, null, and missing rating  | Each is 400 `Invalid rating`; no row                           | 4         |
| `COL-04-T-3 rejects invalid book keys and extra fields`         | PUT missing/null/malformed key and a `userId` field | Each is 400 `Invalid rating`; no row                           | 4         |
| `COL-04-T-3 keeps ratings separate for different users`         | Two users rate the same book                        | Two rows, each with that user's rating                         | 5         |
