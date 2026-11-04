---
id: COL-04-T-4
story: COL-04
sprint: 2
assignee: Natalie Marks
estimate_hours: 2
---

# Display a user's book ratings

## Description

Serves COL-04 (rate books to record opinions on books the user has read). This task lets the app read back the signed-in user's saved ratings and show them: the book details page pre-fills the rating control with the user's existing rating, and each personal-library book card shows its rating when the user has rated that book. It adds the read endpoint these views need, building on COL-04-T-1 (table), COL-04-T-3 (save endpoint), and COL-04-T-2 (rating control).

## Specs

- Add `GET /api/ratings` to `ratingsRouter` in `server/src/routes/ratings.ts`. It runs `requireAuth` (401 `{ "error": "Not logged in" }` otherwise) and returns HTTP 200 with `{ "ratings": [{ "bookKey": "...", "rating": 4 }, ...] }` containing only the authenticated user's ratings. A user with none gets `{ "ratings": [] }`.
- Add `getRatings(signal?)` to `src/ratingsApi.ts`.
- Book details page: when signed in, load the user's ratings and pre-fill `StarRating` with the rating for the current `bookKey`, without overwriting a rating the user chose while the request was loading. If loading fails, the control is left empty.
- Add a read-only `StarDisplay` component (`src/components/StarDisplay.tsx`) with the accessible label "Rated N out of 5 stars".
- Personal library page: load ratings with the saved books and show `StarDisplay` on each card whose book has a rating. A failure to load ratings does not prevent the library from showing. Books not rated show no stars.

## Requirements

- Use the existing router, Drizzle, `requireAuth`, and React conventions. Do not add dependencies.
- Never return another user's ratings; scope by `res.locals.user`.
- Do not change `GET /api/library` or its response shape.

## Acceptance criteria

1. `GET /api/ratings` returns 401 without a session.
2. `GET /api/ratings` returns only the signed-in user's ratings, with each book once at its latest value.
3. The book details page shows the user's existing rating when they revisit a book they rated.
4. Personal-library cards show the rating for rated books and nothing for unrated books.

## Tests

Backend tests are in `server/backend_tests/ratings.test.ts`. The frontend has no test runner, so UI behavior is checked manually after `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`.

| Test / check                                                    | Setup                                              | Asserts                                                         | Criterion |
| --------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- | --------- |
| `COL-04-T-4 rejects an unauthenticated ratings list`            | GET without a session cookie                       | 401 `Not logged in`                                             | 1         |
| `COL-04-T-4 lists only the signed-in user's ratings`            | Two users rate overlapping books; a third has none | Each user sees only their own ratings; the empty user gets `[]` | 2         |
| `COL-04-T-4 lists an updated rating once with its latest value` | PUT 2 then PUT 4 for one book                      | A single entry with rating 4                                    | 2         |
| Manual: details page shows an existing rating                   | Rate a book, reload its details page               | The saved number of stars is filled                             | 3         |
| Manual: library cards show ratings                              | Save two books, rate one, open My Library          | The rated card shows stars; the other shows none                | 4         |
