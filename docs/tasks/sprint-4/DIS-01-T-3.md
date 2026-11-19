---
id: DIS-01-T-3
story: DIS-01
sprint: 4
assignee: Natalie Marks
estimate_hours: 2
---

# Show recommended books on the search page

## Description

Serves DIS-01 (recommendations based on my interests). This task shows the books from `GET /api/recommendations` (DIS-01-T-2) on the search page before a search, and updates them when the user changes the genres they like (DIS-01-T-1).

## Specs

- Add `getRecommendations(signal)` in `src/api/recommendations.ts`. It validates the response with `recommendationsResponse` and throws "Could not load recommendations." on failure, or "Unable to connect." when the request doesn't reach the server.
- Before a search, a signed-in user who likes at least one genre sees a "Recommended for you" section below "Genres you like". It shows each book's cover (or a placeholder), title, and first author in the same grid as "Currently reading".
- Clicking a book opens its details page with "Back to Search", passing the search result so the details page can show it right away.
- While the first load is pending, the section shows "Loading recommendations...". A reload keeps the current books on screen until the new ones arrive. With no books, it shows "No recommendations for these genres yet." On failure, it shows the error.
- Recommendations reload after a genre change is saved, not for a change that is still saving or that failed. A newer load cancels an older one.
- Logged-out users and users who like no genres don't see the section and no request is made.

## Requirements

- Change `src/components/SearchStart.tsx`, `src/library/useInterests.ts`, and `src/pages/SearchPage.tsx`. Share the grid markup between "Currently reading" and "Recommended for you" instead of copying it.
- Use the existing `SearchStart.css` styles and palette tokens. Add no dependencies or API changes.
- Preserve search, filters, the genre picker, currently reading, and recent searches.

## Acceptance criteria

1. Signed-in users with liked genres see recommended books with cover, title, and author.
2. Clicking a recommendation opens its details page with the search result passed along.
3. Loading, empty, and error states show the specified messages. A reload doesn't hide the current books.
4. Saving a genre change reloads the recommendations. Changes that fail to save don't. A newer load cancels an older one.
5. Logged-out users and users without liked genres see no section and make no request.

## Tests

Frontend tests in `src/pages/SearchPage.test.tsx` and `src/api/recommendations.test.ts` (Vitest, Testing Library, mocked API modules or stubbed `fetch`).

| Test name                                                 | Setup / Asserts                                                       | Criterion |
| --------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| `DIS-01-T-3 shows recommended books`                      | Liked genres and two books; titles and author are shown               | 1         |
| `DIS-01-T-3 opens a recommended book`                     | Clicking a book navigates to its details page with the search result  | 2         |
| `DIS-01-T-3 shows loading, empty, and error states`       | Pending, empty, and rejected loads show their messages                | 3         |
| `DIS-01-T-3 reloads recommendations after a saved change` | Picking a genre reloads once the save resolves; a failed save doesn't | 4         |
| `DIS-01-T-3 keeps books on screen while reloading`        | During a reload the old books stay and no loading message shows       | 3         |
| `DIS-01-T-3 a newer load cancels an older one`            | A save during a pending load aborts the first load's signal           | 4         |
| `DIS-01-T-3 hides recommendations without liked genres`   | Logged out or no genres: no section and no request                    | 5         |
| `DIS-01-T-3 rejects a malformed recommendations response` | `getRecommendations` throws the specified message for bad data        | 3         |
