---
id: SRC-03-T-2
story: SRC-03
sprint: 2
assignee: Jonathan H
estimate_hours: 2
---

# Add the book suggestions API endpoint

## Description

Serves SRC-03 (show book suggestions while the user types). This task adds the backend endpoint that retrieves up to five Open Library matches from a partial query. Client typing behavior, the suggestion dropdown, and selecting a suggestion are out of scope.

## Specs

- Add `GET /api/books/suggestions?q=...` to the existing books router. The query is plain text, not Open Library query syntax.
- Trim the query. It must have at least three characters and include a word that is not in the shared common-word list. Invalid queries return HTTP 400.
- Search Open Library using the existing book fields. Treat the final query word as a prefix and return no more than five books.
- If Open Library fails, return HTTP 502 with the standard error response. Do not retry the failed upstream request.
- Keep `GET /api/books/search` and its 20-result behavior unchanged.

## Requirements

- Use the existing books router, Open Library fetch and validation code, and response shapes.
- Do not add runtime or test dependencies.
- Preserve existing search, details, ISBN, and library behavior.

## Acceptance criteria

1. A valid suggestion query returns no more than five books in the existing book response shape.
2. A partial final word is sent to Open Library as a prefix query.
3. Blank queries, queries shorter than three characters, and queries made only of common words return HTTP 400; Open Library is not called for them.
4. An Open Library failure returns HTTP 502 with the standard `{ "error": "..." }` response, with no automatic retry.
5. The existing `GET /api/books/search` endpoint continues to request up to 20 results.

## Tests

| Test name                                         | Asserts                                                                                 | Criterion |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| SRC-03-T-2 rejects invalid suggestion queries     | Blank, short, and common-word-only queries return 400; the upstream fetch is not called | 3         |
| SRC-03-T-2 limits suggestion results              | A valid query returns at most five books and sends `limit=5` upstream                   | 1         |
| SRC-03-T-2 sends a prefix query for partial words | A query such as `harry pot` sends `pot*` as its final search term                       | 2         |
| SRC-03-T-2 handles an Open Library failure        | An upstream failure returns 502 with an `error` string and makes one upstream request   | 4         |
| SRC-03-T-2 preserves submitted search behavior    | The existing search endpoint still sends `limit=20` and returns its standard response   | 5         |
