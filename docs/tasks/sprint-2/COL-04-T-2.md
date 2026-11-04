---
id: COL-04-T-2
story: COL-04
sprint: 2
assignee: Natalie Marks
estimate_hours: 2
---

# Add a rating control to the book details view

## Description

Serves COL-04 (rate books to record opinions on books the user has read). This task adds a 1–5 star control to the book details page that lets a signed-in user rate the book, saving the choice through `PUT /api/ratings` (COL-04-T-3). Loading and displaying a previously saved rating, and showing ratings in the personal library, are out of scope (COL-04-T-4).

## Specs

- Add a reusable `StarRating` component (`src/components/StarRating.tsx` and `.css`) that renders five stars as a radio group in a `fieldset` labelled "Your rating". Each radio has an accessible label ("1 star", "2 stars", …). Stars up to and including the selected value are filled. It is keyboard operable and can be disabled.
- Add `saveRating(bookKey, rating)` in `src/ratingsApi.ts`, which sends `PUT /api/ratings` and throws an `Error` with a user-friendly message on network failure, 401, or an error response.
- In `src/pages/BookDetailsPage.tsx`, show the control below the save button only when the user is signed in. Signed-out users do not see it.
- Choosing a star immediately shows that rating, sends it to the server, and shows "Rating saved." on success. On failure, the previous rating is restored and the error message is shown. The control is disabled while a request is in flight or while the book is loading.

## Requirements

- Use the existing React, `useAuth`, and CSS variable conventions. Do not add dependencies.
- Take the rating limits from `shared/ratings.ts`.
- Do not change the save-to-library behavior.

## Acceptance criteria

1. A signed-in user sees five rating stars on the book details page; a signed-out user does not.
2. Selecting a star fills stars up to it and saves the rating through `PUT /api/ratings`.
3. A failed save restores the previous rating and shows an error message.
4. The control can be operated with the keyboard and each star has an accessible name.

## Tests

The repository has no frontend test runner, so this task is verified with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and manual checks in the running app:

| Check                        | Steps                                     | Expected                                               | Criterion |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------ | --------- |
| Stars hidden when signed out | Open a book's details while logged out    | No rating control is shown                             | 1         |
| Stars shown when signed in   | Log in and open a book's details          | "Your rating" with five stars                          | 1         |
| Choosing a rating saves it   | Click the 4th star                        | Four stars fill, "Rating saved.", row exists in the DB | 2         |
| Failure rolls back           | Stop the API server, click a star         | Previous rating restored and an error message appears  | 3         |
| Keyboard use                 | Tab to the control and use the arrow keys | Selection changes; focus ring is visible               | 4         |
