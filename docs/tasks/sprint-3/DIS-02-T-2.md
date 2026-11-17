---
id: DIS-02-T-2
story: DIS-02
sprint: 3
assignee: Jonathan H
estimate_hours: 2
---

# Build the similar-books display component

## Description

Serves DIS-02 (discover similar books while viewing a book). Build a component that displays supplied books and request states. Fetching recommendations, connecting the component to the details page, and handling navigation belong to DIS-02-T-3.

## Specs

- Add `SimilarBooksSection` in `src/components/SimilarBooksSection.tsx`.
- Accept `books` as `BookSearchResult[]`, `loading` as a boolean, `error` as a string, and `onSelect` and `onRetry` callbacks.
- Always show a "Similar books" heading.
- While loading, show "Loading similar books..." instead of results, errors, or Retry.
- When loading is finished and `error` is nonempty, show that message and a "Retry" button. Clicking Retry calls `onRetry`.
- Otherwise, display the first six supplied books in their supplied order using the existing `BookCard` component and its metadata fallbacks.
- Selecting a card calls `onSelect` with that book.
- When loading is finished with no error and no books, show "No similar books found."

## Requirements

- Reuse `BookCard`, `BookSearchResult` from `shared/books.ts`, and existing styling conventions.
- Keep the component controlled by its props. Do not fetch data, manage requests, or perform navigation.
- Add no runtime dependencies or backend changes.
- Preserve existing BookCard behavior and styling wherever it is already used.

## Acceptance criteria

1. The component displays a "Similar books" heading.
2. Loading shows the loading message and hides results, errors, and Retry.
3. Successful results show at most six cards in supplied order, including books without optional metadata.
4. Selecting a card calls `onSelect` with the correct book.
5. An empty result shows "No similar books found."
6. An error shows its message and a Retry button; clicking it calls `onRetry`.