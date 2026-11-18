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

## Tests

Test file: `src/components/SimilarBooksSection.test.tsx`, using the existing Vitest, React Testing Library, and user-event setup. Run `pnpm test src/components/SimilarBooksSection.test.tsx`.

| Test name                                                  | Setup                                                                                 | Asserts                                                                                 | Criterion |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| `DIS-02-T-2 keeps the heading in every state`              | Render results, loading, error, and empty states                                      | Every state keeps the "Similar books" heading                                           | 1         |
| `DIS-02-T-2 shows only the loading message while loading`  | Supply books and an error while loading                                               | The loading message appears without cards, an error, Retry, or the empty message        | 2         |
| `DIS-02-T-2 shows the first six books in supplied order`   | Supply seven books in a nonalphabetical order                                         | Only the first six appear, in supplied order; the results region accepts keyboard focus | 3         |
| `DIS-02-T-2 keeps optional metadata and its fallbacks`     | Supply one book with metadata and one without                                         | Author, year, and cover are preserved; missing author and cover use BookCard fallbacks  | 3         |
| `DIS-02-T-2 selects the book whose card was clicked`       | Click the second card, then the first                                                 | The callback receives the corresponding complete book data in click order               | 4         |
| `DIS-02-T-2 shows an empty message without cards or retry` | Supply an empty list with no error and loading finished                               | The empty message appears without cards, Retry, loading, or an error                    | 5         |
| `DIS-02-T-2 shows the error and calls retry when clicked`  | Supply books and an error, then click Retry                                           | The error replaces the cards; clicking Retry calls its callback once                    | 6         |
| Horizontal scrolling (manual)                              | Temporarily preview six books in a narrow container; scroll and Tab through the cards | Cards stay in one row, scroll horizontally, and remain reachable by keyboard            | 3         |

The horizontal-scrolling check has not yet been performed. It requires a browser preview because the unit tests do not measure layout. Remove any temporary preview before committing.
