---
id: DIS-01-T-1
story: DIS-01
sprint: 4
assignee: Natalie Marks
estimate_hours: 1
---

# Let users pick the genres they like

## Description

Serves DIS-01 (recommendations based on my interests). This task stores the genres a signed-in user likes and lets them pick those genres on the search page. Building recommendations from them belongs to DIS-01-T-2, and showing them belongs to DIS-01-T-3.

## Specs

- Add a `user_genres` table with `user_id` (references `users.id`, cascades on delete) and `genre` (a `book_genre` enum of `BOOK_GENRES`), with primary key `(user_id, genre)`.
- Add `GET /api/interests`, which returns `{"genres":[...]}` for the signed-in user in `BOOK_GENRES` order. A user who hasn't picked any genres gets `{"genres":[]}`.
- Add `PUT /api/interests` with body `{"genres":[...]}`. It replaces the user's genres in one transaction and returns the saved list in `BOOK_GENRES` order. Repeated genres count once. An empty list clears them. Saves that overlap for the same user both succeed, and the stored list is one of the two, never a mix.
- Unknown genres, a missing or non-array `genres`, or extra fields return 400 `{"error":"Invalid genres"}` and change nothing. Both routes return 401 when logged out.
- On the search page before a search, signed-in users see a "Genres you like" section with one toggle button per genre (`aria-pressed`). Clicking a genre saves the new list right away. Only one save runs at a time: changes made while a save is running are sent together once it finishes. If a save fails, the selection reverts to the last saved list, any changes made after it are dropped, and the section shows "Could not save your genres." Logged-out users don't see the section.

## Requirements

- Add the table to `server/src/db/schema.ts`, the route to `server/src/routes/interests.ts`, the body schema to `shared/interests.ts`, and client calls to `src/api/interests.ts`.
- Reuse the existing chip styles in `SearchStart.css` and the palette tokens. Add no dependencies.
- Preserve search, filters, currently reading, recent searches, and the personal library.

## Acceptance criteria

1. The table enforces one row per user and genre, accepts only known genres, and cascades when the user is deleted.
2. `GET /api/interests` returns the signed-in user's genres in `BOOK_GENRES` order, or an empty list.
3. `PUT /api/interests` replaces the user's genres, removes duplicates, and clears them with an empty list, without affecting other users. Overlapping saves don't fail or mix lists.
4. Invalid bodies return 400 without changing stored genres, and logged-out requests return 401.
5. Signed-in users can toggle genres on the search page and the change is saved, one save at a time. A failed save reverts to the last saved list and shows the error. Logged-out users don't see the picker.

## Tests

Backend tests in `server/backend_tests/interests.test.ts` and `server/backend_tests/schema.test.ts` (`node:test`, real Postgres). Frontend tests in `src/pages/SearchPage.test.tsx` (Vitest, Testing Library, stubbed `fetch`).

| Test name                                                 | Setup / Asserts                                                         | Criterion |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| `DIS-01-T-1 user genres are unique and cascade`           | Duplicate and unknown genres are rejected; deleting the user drops rows | 1         |
| `DIS-01-T-1 returns no genres before any are picked`      | A new user gets `{"genres":[]}`                                         | 2         |
| `DIS-01-T-1 replaces genres and returns them in order`    | Save a list out of order with a duplicate, then a shorter list          | 2, 3      |
| `DIS-01-T-1 clears genres with an empty list`             | Save genres, then `[]`; GET returns `[]`                                | 3         |
| `DIS-01-T-1 keeps each user's genres separate`            | Two users save different lists                                          | 3         |
| `DIS-01-T-1 overlapping saves don't conflict`             | Several PUTs at once all return 200; the stored list is one of them     | 3         |
| `DIS-01-T-1 rejects invalid genres without changing them` | Unknown genre, non-array, extra field; stored list unchanged            | 4         |
| `DIS-01-T-1 requires login`                               | GET and PUT without a session return 401                                | 4         |
| `DIS-01-T-1 signed-in users can pick genres`              | Clicking a genre sends PUT and marks it pressed                         | 5         |
| `DIS-01-T-1 a failed save reverts the genre`              | PUT fails; the genre is unpressed and the error shows                   | 5         |
| `DIS-01-T-1 saves one change at a time`                   | Clicks during a pending save are sent together after it                 | 5         |
| `DIS-01-T-1 a failed save drops the changes after it`     | First save fails; later clicks revert and aren't sent                   | 5         |
| `DIS-01-T-1 logged-out users don't see the genre picker`  | No "Genres you like" heading without a user                             | 5         |
