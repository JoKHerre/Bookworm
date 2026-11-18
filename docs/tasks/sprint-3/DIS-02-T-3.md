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

- Add `getSimilarBooks(key, signal)` to `src/booksApi.ts`. Call `GET /api/books/similar?key=...` and validate successful responses with `similarBooksResponse` from `shared/books.ts`.
- Add `SimilarBooks` in `src/components/SimilarBooks.tsx` to manage request state and pass books, loading, error, selection, and retry props to `SimilarBooksSection`.
- Render it in `src/pages/BookDetailsPage.tsx` after the main book details load successfully. Request recommendations automatically for the displayed book.
- Show the loading, results, empty, and error states through the existing display component. Preserve the API's result order and the single horizontally scrollable row.
- Selecting a card opens that book using `bookDetailsPath` from `src/routes.ts`. Back returns to the previous page.
- Failed requests show "Unable to load similar books." and Retry. Retry clears the error, shows loading, and requests recommendations for the current book again.
- Changing books clears old results and messages. Abort pending requests when changing books or leaving the page, and ignore late responses from cancelled requests.
- Similar-book loading and retry operate independently of ISBN expansion and availability loading.

## Requirements

- This task depends on DIS-02-T-2. Merge Task 2 before merging this task.
- Reuse existing API helpers, shared schemas, navigation, components, and Vitest setup. Keep similarity request state in `SimilarBooks`.
- Add no dependencies or backend changes. Preserve tags, search, ISBN browsing, availability, authentication, saved-library operations, and ratings.

## Acceptance criteria

1. `getSimilarBooks` sends the work key and caller signal to the existing endpoint and returns schema-valid results, including an empty list.
2. The API client rejects malformed successful responses, HTTP errors, and network failures.
3. Successfully loaded book details automatically load recommendations and display the API's books in order through `SimilarBooksSection`.
4. Selecting a recommendation opens its details, and Back returns to the previous page.
5. An empty response shows "No similar books found."
6. Failure shows the specified error and Retry; retry shows loading and can replace the error with successful results.
7. Changing books resets the section; changing books or leaving aborts pending requests, and late responses cannot update the current section.
8. Similar-book requests, failures, and retries do not block or reset book details, ISBN browsing, or availability.
