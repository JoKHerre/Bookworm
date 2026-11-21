---
id: IMP-02-T-2
story: IMP-02
sprint: 4
assignee: Natalie Marks
estimate_hours: 2
---

# API lookup for imported entries

## Description

Serves IMP-02 (match imported titles with known books so users don't have to fill in their information). This task adds an endpoint that looks up imported rows on Open Library and applies the matching rules from IMP-02-T-1. Showing the results and letting users resolve them belongs to IMP-02-T-3.

## Specs

- Add `IMPORT_MATCH_BATCH_SIZE` = 6 (two rounds of the 3 concurrent lookups, so the page can show progress often) and the request and response types to `shared/bookMatch.ts`. The body schema is `{ "rows": { "title": string, "author": string, "isbn": string }[] }` with `.strict()` on both levels: 1 to 6 rows, a non-empty title, and `isbn` empty or a valid ISBN-10/13 (reuse `hasValidIsbnChecksum`). Rows with a `book_key` are not sent.
- Add `POST /api/books/match`, behind `requireAuth`. An invalid body returns 400 `{ "error": "Invalid match request" }`; no session returns 401.
- It returns 200 `{ "results": ImportMatch[] }`, one per row in request order, where `ImportMatch` is a `TitleMatch` or `{ "status": "failed" }`.
- For each row, in `server/src/services/openLibrary.ts`:
  - With an ISBN, search `/search.json?isbn=<isbn>&limit=1`. A result returns `matched` with that work.
  - Otherwise, or when the ISBN finds nothing, search `/search.json?title=<title>&author=<author>` (no `author` when empty) for 10 results, and return `matchTitle(row, docs)`.
  - Both searches use the fields `key,title,author_name,first_publish_year,cover_i`.
  - If Open Library fails or times out for a row, that row is `failed` and the others still return.
- Run at most 3 rows at a time, and cache each search for an hour with the existing `PromiseCache`. Stop the remaining lookups if the client disconnects.
- Add `matchImportRows(rows, signal?)` in `src/api/books.ts`. It validates the response with Zod and returns the results. A 401 throws "Your session has expired. Please log in again."; any other failure throws "Could not match these books."

## Requirements

- Reuse `fetchOpenLibrary`, `PromiseCache` and the auth middleware. Add no dependencies or tables.
- Preserve existing search, suggestion and import behavior.

## Acceptance criteria

1. An unauthenticated request returns 401; invalid bodies (empty rows, 7 rows, missing title, a bad ISBN, extra fields) return 400 and make no Open Library calls.
2. A row with an ISBN Open Library knows is matched to that work without a title search.
3. A row whose ISBN finds nothing, or that has no ISBN, is matched by title and author using `matchTitle`, so results can be matched, ambiguous or none.
4. A failed Open Library call marks only that row as failed.
5. Results come back in request order.
6. `matchImportRows` returns parsed results and maps 401 and other failures to their messages.

## Tests

Server tests are in `server/backend_tests/bookMatch.test.ts` with `node:test`, stubbing `fetch` for Open Library. Client tests are in `src/api/books.test.ts`.

| Test name                                       | Setup / Asserts                                                             | Criterion |
| ----------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| `IMP-02-T-2 rejects an unauthenticated match`   | No cookie returns 401                                                       | 1         |
| `IMP-02-T-2 rejects invalid match bodies`       | Each bad body returns 400 and `fetch` isn't called                          | 1         |
| `IMP-02-T-2 matches a row by ISBN`              | ISBN search returns a work; result is matched and no title search is made   | 2         |
| `IMP-02-T-2 falls back to title search`         | Empty ISBN result, then a title search; the title and author are in the URL | 3         |
| `IMP-02-T-2 returns ambiguous and missing rows` | Stubbed searches give ambiguous and none results                            | 3         |
| `IMP-02-T-2 marks only failed rows`             | One search returns 500; that row is failed, the other is matched            | 4         |
| `IMP-02-T-2 keeps request order`                | Slower first lookup still comes back first                                  | 5         |
| `IMP-02-T-2 matchImportRows posts rows`         | Sends the rows as JSON and returns the results                              | 6         |
| `IMP-02-T-2 matchImportRows maps failures`      | 401, 500, a network error and a malformed body give their messages          | 6         |
