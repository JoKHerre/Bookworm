---
id: SRC-04-T-2
story: SRC-04
sprint: 3
assignee: Jonathan H
estimate_hours: 2
---

# Add filters to the book search API

## Description

Serves SRC-04 (filter search results to narrow down the books shown). This task adds genre, language, and publication-year filtering to the existing book search API. Connecting the controls, showing active selections, and handling removal/reset belong to SRC-04-T-3 and are out of scope.

## Specs

- Extend `GET /api/books/search` to accept optional `genre`, `language`, and `year` parameters alongside `q`. Repeat `genre` for multiple selections.
- Match any selected genre, then narrow by language and first publication year. Apply these filters in the Open Library search before limiting results.
- Return `{ books, total }` with up to 20 matching books and the filtered total. No matches returns empty `books` and a total of 0.
- An omitted or default filter leaves that field unrestricted. With no active filters, keep the existing search behavior.
- Invalid filter values return HTTP 400 with an error message without calling Open Library. Open Library failures return HTTP 502 with an error message.

## Requirements

- Use the existing books router, Open Library service, and shared validation patterns.
- Support the filter choices already provided by the SRC-04 controls; do not add new filter types.
- Do not add runtime or test dependencies, database tables, or authentication requirements.
- Preserve unfiltered search, suggestions, book details, ISBN lookup, and personal-library behavior.

## Acceptance criteria

1. A search with one valid genre, language, or year returns results matching that filter.
2. Multiple genres match any selected genre, while language and year further restrict the results.
3. Filtered searches return up to 20 books and the matching total; no matches returns empty books and a total of 0.
4. Invalid filters return HTTP 400 without contacting Open Library; Open Library failures return HTTP 502. Both responses include an error message.
5. Searching without filters keeps the existing 20-result limit and response format.
