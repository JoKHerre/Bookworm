---
id: SRC-05-T-1
story: SRC-05
sprint: 4
assignee: Jonathan H
estimate_hours: 2
---

# Add API to retrieve trigger warnings for books

## Description

Serves SRC-05 (exclude genres and content warnings from search results). Add a backend API that matches an Open Library book to a Trigger Warning Database entry and returns its warnings. Search filtering, frontend API changes, and UI controls belong to later tasks.

## Specs

- Add `GET /api/books/content-warnings?key=/works/OL...W` in the existing books router. Reuse `openLibraryWorkKey` and `getBookDetails`, including cached work/author lookups and merged-work redirects. Invalid keys return 400 without upstream calls; missing works return 404; other Open Library failures return 502, using the shared `ApiError` format.
- Return a shared, validated response from `shared/contentWarnings.ts` with status `found`, `not_found`, or `unavailable`. Found responses include warning text, category IDs from the entry's linked warning tags, source URL, and retrieval time. Other outcomes use `warnings: null`, with attribution when available.
- Implement `server/src/services/contentWarnings.ts` with both work-key and supplied-title/author lookups. Require a matching title and book author; never rely on result order. Incomplete, failed, or uncertain lookups are unavailable.
- Use the matched entry's linked warning tags for filtering categories, excluding genre/category links and unrelated tags elsewhere on the page. Retain its labelled warning list for original wording and qualifiers. Missing or unrecognized warning data is unavailable, not an empty warning list.
- Define shared identifiers for supported warning categories, choosing the initial categories during implementation based on source warning tags. Map tags explicitly.

## Requirements

- Scrape only relevant public pages on `https://triggerwarningdatabase.com/`, using backend Cheerio. Add no dependencies or database changes.
- Bound source work to one active request, one search page, three candidate entries, 5-second request timeouts, and a 20-second lookup deadline. Reuse `PromiseCache` for successful lookups and support cancellation.
- Keep warning categories separate from Open Library display tags and follow existing project conventions.
- Preserve existing book behavior. Do not add warning requests to search, suggestions, similar books, or library lookups in this task.

## Acceptance criteria

1. A matched book, including a merged Open Library work, returns its warning list with source attribution and retrieval time.
2. Invalid keys and Open Library failures return the specified HTTP errors.
3. Matching requires title and book author, distinguishes missing records from unavailable information, and never automatically accepts the first result.
4. Filtering categories come from the entry's warning tags; original warning text and qualifiers are retained, and unrelated tags are excluded.
5. Failed, incomplete, or changed source pages return unavailable information without claiming the book has no warnings.
6. Request limits, caching, and cancellation work; supplied-metadata lookups need no additional Open Library request.
