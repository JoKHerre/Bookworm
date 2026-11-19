---
id: DIS-02-T-3
story: DIS-02
sprint: 3
assignee: Jonathan H
estimate_hours: 1
---

# Connect similar books to the book details page

## Description

Serves DIS-02 (discover similar books while viewing a book). Connect the API from DIS-02-T-1 to the display component from DIS-02-T-2. This task handles loading recommendations, navigation, retry, and cancellation. Retrieval and ranking stay in the existing backend.

## Specs

- Add `getSimilarBooks(key, signal)` to `src/api/books.ts`. Use its existing `get` helper, which routes requests through `src/api/client.ts`. Call `GET /api/books/similar?key=...` and validate successful responses with `similarBooksResponse` from `shared/books.ts`. Follow the existing concise API error messages, including "Unable to read similar books." for invalid schema data and "Unable to connect." for network failures.
- Add `SimilarBooks` in `src/components/SimilarBooks.tsx` to manage request state and pass books, loading, error, selection, and retry props to `SimilarBooksSection`.
- Render it in `src/pages/BookDetailsPage.tsx` after the main book details load successfully. Request recommendations automatically for the displayed book.
- Show the loading, results, empty, and error states through the existing display component. Preserve the API's result order and the single horizontally scrollable row.
- Selecting a card opens that book using `bookDetailsPath` from `src/routes.ts`. Back returns to the previous page.
- Failed requests show "Unable to load similar books." and Retry. Retry clears the error, shows loading, and requests recommendations for the current book again.
- Changing books clears old results and messages through the details page's existing keyed content component. Abort pending requests when changing books or leaving the page, and ignore late responses from cancelled requests.
- Similar-book loading and retry operate independently of ISBN expansion and availability loading.

## Requirements

- This task depends on DIS-02-T-2. Merge Task 2 before merging this task.
- Build on the approved copy, cleanup, layout, and UI changes and the updated DIS-02-T-2 display. Reuse existing API helpers in `src/api/`, shared schemas, navigation, components, and Vitest setup. Keep similarity request state in `SimilarBooks`.
- Add no dependencies or backend changes. Preserve tags, search, ISBN browsing, availability, library title searches, authentication, saved-library operations, and ratings.

## Acceptance criteria

1. `getSimilarBooks` sends the work key and caller signal to the existing endpoint and returns schema-valid results, including an empty list.
2. The API client rejects malformed successful responses, HTTP errors, and network failures.
3. Successfully loaded book details automatically load recommendations and display the API's books in order through `SimilarBooksSection`.
4. Selecting a recommendation opens its details, and Back returns to the previous page.
5. An empty response shows "No similar books found."
6. Failure shows the specified error and Retry; retry shows loading and can replace the error with successful results.
7. Changing books resets the section; changing books or leaving aborts pending requests, and late responses cannot update the current section.
8. Similar-book requests, failures, and retries do not block or reset book details, ISBN browsing, or availability.

## Tests

Test files: `src/api/books.test.ts` and `src/pages/BookDetailsPage.test.tsx`, using the existing Vitest, React Testing Library, and user-event setup. Run `pnpm test src/api/books.test.ts src/pages/BookDetailsPage.test.tsx`.

| Test name                                                                    | Setup                                                                       | Asserts                                                                                                     | Criterion |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| `DIS-02-T-3 loads similar books with the work key and caller signal`         | Mock a valid API response                                                   | The endpoint receives the work key and caller signal; the helper returns the books                          | 1         |
| `DIS-02-T-3 accepts empty similar-book results`                              | Return an empty books list                                                  | The helper accepts the empty result                                                                         | 1         |
| `DIS-02-T-3 rejects malformed similar-book responses`                        | Return invalid JSON or invalid response shapes                              | The helper rejects each response                                                                            | 2         |
| `DIS-02-T-3 reports similar-book HTTP errors`                                | Return HTTP 404 and 502 errors                                              | The helper rejects with the API error                                                                       | 2         |
| `DIS-02-T-3 reports similar-book network failures`                           | Reject fetch with a network error                                           | The helper rejects with the network error message                                                           | 2         |
| `DIS-02-T-3 preserves cancelled similar-book requests`                       | Cancel the caller signal and reject fetch with its reason                   | The helper preserves the cancellation error                                                                 | 7         |
| `DIS-02-T-3 loads recommendations after the book details`                    | Resolve book details, then recommendations                                  | Recommendations start after details load, show loading, and display cards in API order                      | 3         |
| `DIS-02-T-3 skips recommendations when book details fail`                    | Reject the details request                                                  | The details error appears without requesting recommendations                                                | 3         |
| `DIS-02-T-3 opens a recommendation and returns with Back`                    | Load recommendations, select a card, then click Back                        | The selected book opens with fresh loading state and no old cards; Back restores the previous book          | 4, 7      |
| `DIS-02-T-3 shows an empty recommendation response`                          | Return no recommendations                                                   | The empty message appears without cards                                                                     | 5         |
| `DIS-02-T-3 retries only the failed recommendations`                         | Fail recommendations, click Retry, then resolve the retry                   | The specified error becomes loading, then results; details, availability, and ISBNs are not requested again | 6, 8      |
| `DIS-02-T-3 ignores late success/failure after changing books` (two cases)   | Change books while recommendations are pending, then finish the old request | The old signal is aborted; late results or errors do not replace the current loading state or results       | 7         |
| `DIS-02-T-3 aborts recommendations when leaving the page`                    | Unmount with a pending request                                              | The recommendation signal is aborted                                                                        | 7         |
| `DIS-02-T-3 loads recommendations without waiting for availability or ISBNs` | Leave availability and ISBN requests pending                                | Recommendations appear independently; ISBNs are still loaded only on expansion                              | 8         |
| `DIS-02-T-3 keeps availability and ISBNs usable while recommendations load`  | Leave recommendations pending and expand ISBNs                              | Main details, availability, and ISBNs remain usable                                                         | 8         |
