---
id: REF-01-T-2
story: REF-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 6
---

# Fix structural problems found in the sprint 3 review

## Description

Serves REF-01 (keep the codebase maintainable as features land). Builds on REF-01-T-1, which removed unused code. A review of the project at the end of sprint 3 also found duplicated helpers, a frontend that called `fetch` from pages, API responses with no shared types, an Express app that tests could not import, and an uncached Open Library dependency that made the library page issue several upstream requests per saved book. This task fixes those problems without changing any feature's behavior beyond the fixes listed below. Two follow-ups are out of scope and left for a team decision: replacing `db:push` with migrations, and storing book metadata when a book is saved.

## Specs

### Open Library caching

- Add `PromiseCache` in `server/src/services/cache.ts`: an in-memory cache of promises with a time-to-live and a size cap, evicting the least recently used entry.
- Concurrent callers for one key share a single load. A rejected load is evicted so the next caller retries it.
- Each caller may pass its own `AbortSignal`. Aborting rejects that caller only; the shared load is aborted, and its entry evicted, once every caller waiting on it has aborted. A caller without a signal keeps the load alive until it settles.
- Cache Open Library works and author names for one hour, up to 2,000 entries each. Book details and similar books read works through the cache. Client disconnects still cancel upstream work as DIS-02-T-1 requires.
- Export `clearOpenLibraryCache()` for tests that stub different responses for the same key.

### Shared response types

- Add `shared/api.ts` with `ApiError` (`{ error: string }`), replacing the books-only `BooksError`.
- Add `shared/library.ts` (`SavedBook`, `LibraryResponse`, `SaveBookResponse`, `ReadingStatusResponse`, `ImportBooksResponse`) and `shared/collections.ts` (`CollectionSummary`, `CollectionListResponse`, `CollectionDetailResponse`).
- Types with timestamps take a parameter `D` (default `string`): the server uses `Date`, the client reads ISO strings.
- Library, collections, and ratings handlers declare their response type with `Response<...>`. Response shapes are unchanged.

### Frontend API client

- Add `src/api/client.ts`:
  - `apiRequest<T>(url, { method, body, signal })` sends a JSON body when given and returns the parsed body, or `null` for an empty one.
  - A failed response throws `ApiRequestError` with `status` and the body's `error` as `serverMessage`. A network failure throws `ApiRequestError` with status `0`. A cancelled request rethrows the original `AbortError`.
  - `errorMessage(error, messages)` and `userError(error, messages)` choose the text to show: the message for the status if given, else the server's message when `useServerMessage` is set, else the fallback. Errors that are not `ApiRequestError` pass through `userError` unchanged.
- Move `booksApi`, `libraryApi`, and `ratingsApi` (and their tests) to `src/api/books.ts`, `library.ts`, and `ratings.ts`, built on the client, and add `src/api/auth.ts`. Their user-facing error messages are unchanged.
- Add `getLibrary`, `saveBook`, `removeSavedBook`, and `updateReadingStatus` to `src/api/library.ts`. These throw `ApiRequestError` so the caller can name the affected book in its message.
- `PersonalLibraryPage`, `BookDetailsPage`, and `AuthContext` stop calling `fetch` directly. The library page cancels its loads on unmount. Logging out clears the user whenever the server answers, as before.

### Express app

- Add `createApp()` in `server/src/app.ts`, which builds the app with all middleware, routes, `GET /api/health`, and the error handler without listening. `server/src/index.ts` starts session cleanup and listens.
- Add `startTestServer(app)` to `server/backend_tests/test-utils.ts`. Every backend test that makes HTTP requests serves `createApp()` through it instead of assembling its own partial app. The collections tests no longer spawn a child server process.

### Smaller fixes

- **ID parsing:** `parsePositiveId` in `server/src/routes/params.ts` replaces the separate saved-book and collection ID parsers. It accepts decimal digits from `1` through `2_147_483_647` and returns `null` otherwise.
- **ISBNs:** `shared/isbn.ts` provides `cleanIsbn`, `hasIsbnShape`, and `hasValidIsbnChecksum`, used by the CSV importer, the availability lookup, and the catalog scraper.
- **Search filter options:** `shared/books.ts` exports `BOOK_GENRES`, `BOOK_LANGUAGES`, and `PUBLICATION_YEAR_RANGES`. The search schema and the search page's filter controls both read them.
- **Catalog URL:** `shared/availability.ts` owns the catalog URL and context and exports `libraryCatalogRecordUrl(bibid)` for the details page link.
- **Search escaping:** search text is escaped with the existing Open Library escaping before filters are added, so characters such as `)` cannot close the group and make filters optional. Boolean words such as `OR` still work.
- **Filters in the URL:** genre, language, and year live in the search URL beside `q`. A refresh, Back, or a shared link restores them, and values the filters don't offer are ignored. Changing a filter replaces the current history entry, and a new search keeps the current filters.
- **One rating lookup:** `GET /api/ratings` accepts an optional `bookKey` query and returns only that book's rating. An invalid or repeated key, or an unexpected query field, returns `400` with `{ "error": "Invalid book key" }`; no query behaves as before. The details page asks for its own book's rating.
- **Error messages:** 4xx errors from the error handler return `"Bad request"` for `400` and the standard reason phrase for other statuses, such as `413` with `"Payload Too Large"`. 5xx errors are unchanged.

## Requirements

- Keep every existing endpoint's paths, status codes, and response shapes, and every user-facing message, except where a fix above changes them.
- Add no dependencies and no database schema changes.
- Adjust existing tests only where they depended on internals this task changes: tests that stub the same work key twice clear the cache, tests that checked the exact arguments passed to `fetch` check the URL and method, and tests mount `createApp()`.
- `pnpm --dir server test`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm build` pass.

## Acceptance criteria

1. Repeated and concurrent details requests for a work reach Open Library once per cache lifetime, and a failed lookup is retried on the next request.
2. A client disconnect still cancels the upstream lookup once no other caller is waiting on it, and a caller without a signal is never cancelled by another caller.
3. Library, collections, and ratings handlers type-check against the shared response types.
4. No frontend module outside `src/api/client.ts` calls `fetch`, and the messages users see for each failure are unchanged.
5. Every backend HTTP test runs against `createApp()`, and the server still starts and serves requests from `src/index.ts`.
6. ID parsing, ISBN handling, filter options, and the catalog URL each have one definition.
7. Query syntax in the search box cannot bypass the selected filters.
8. Search filters survive a page reload and are restored from a link.
9. The details page loads only its own book's rating, and the ratings list without a query is unchanged.
10. Oversized request bodies return `413` with `"Payload Too Large"`, and malformed JSON still returns `400` with `"Bad request"`.
11. All existing and new tests and the project checks pass.

## Tests

Backend tests use `node:test` and `node:assert/strict`, with the guarded `bookworm_test` database from `server/backend_tests/test-utils.ts`; run `pnpm --dir server db:push` against it first. Frontend tests use Vitest and Testing Library with `fetch` stubbed through `vi.stubGlobal`.

| Test name                                                                       | Setup                                                                                | Asserts                                                                                            | Criteria |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| `REF-01-T-2 concurrent callers share one load`                                  | Request one key twice at once, then again                                            | All three get the first result and the loader ran once                                             | 1        |
| `REF-01-T-2 a rejected load is retried by the next caller`                      | Load a key with a rejecting loader, then a resolving one                             | The first rejects and the second resolves                                                          | 1        |
| `REF-01-T-2 an expired entry is loaded again`                                   | Load a key, advance mocked time past the time-to-live, load again                    | The loader ran twice                                                                               | 1        |
| `REF-01-T-2 the least recently used entry is dropped past the size cap`         | Fill a cache of two, touch the older entry, add a third                              | The untouched entry is reloaded and the touched one is not                                         | 1        |
| `REF-01-T-2 the shared load is aborted only after every waiting caller aborts`  | Two callers with signals wait on one pending load; abort each in turn                | The load's signal aborts only after the second caller aborts, and a later call starts a fresh load | 2        |
| `REF-01-T-2 a caller without a signal keeps the shared load alive`              | One caller with a signal and one without wait on one load; abort the first           | The load is not aborted and the second caller receives its result                                  | 2        |
| Existing `DIS-02-T-1` similar books tests                                       | Clear the cache whenever a test stubs Open Library                                   | Cancellation and upstream-failure behavior is unchanged                                            | 2        |
| `REF-01-T-2 sends a JSON body and returns the parsed response`                  | POST a body through `apiRequest`                                                     | `fetch` receives the method, JSON content type, and serialized body; the parsed body is returned   | 4        |
| `REF-01-T-2 returns null for an empty body`                                     | Respond `204` with no body                                                           | `apiRequest` resolves to `null`                                                                    | 4        |
| `REF-01-T-2 reports the status and server message of a failed response`         | Respond `409` with `{ "error": "Nope" }`                                             | Throws `ApiRequestError` with status `409` and server message `"Nope"`                             | 4        |
| `REF-01-T-2 reports a network failure as status 0`                              | Reject `fetch` with a `TypeError`                                                    | Throws `ApiRequestError` with status `0`                                                           | 4        |
| `REF-01-T-2 rethrows the abort when the caller cancelled`                       | Abort the caller's signal while `fetch` rejects                                      | The original `AbortError` is thrown                                                                | 4        |
| `REF-01-T-2 picks a status message, then the server message, then the fallback` | Call `errorMessage` with matching and non-matching statuses and non-request errors   | Each case shows the documented message                                                             | 4        |
| `REF-01-T-2 passes errors other than failed requests through userError`         | Pass an `AbortError` to `userError`                                                  | The same error is returned                                                                         | 4        |
| Existing frontend API, page, and auth tests                                     | Run against the new `src/api/` modules                                               | Requests, error messages, and page behavior are unchanged                                          | 4        |
| Existing backend HTTP tests                                                     | Serve `createApp()` with `startTestServer`                                           | All auth, library, import, ratings, books, and collections tests pass against the real app         | 5        |
| `REF-01-T-2 cleanIsbn keeps digits and an uppercase X`                          | Clean hyphenated, spaced, and lowercase-`x` ISBNs                                    | Only digits and an uppercase `X` remain                                                            | 6        |
| `REF-01-T-2 hasIsbnShape accepts ISBN-10 and ISBN-13 lengths only`              | Check 10- and 13-character ISBNs and malformed values                                | Only the valid shapes pass                                                                         | 6        |
| `REF-01-T-2 hasValidIsbnChecksum checks both formats`                           | Check valid and off-by-one ISBN-10 and ISBN-13 values                                | Only the valid checksums pass                                                                      | 6        |
| `REF-01-T-2 keeps query syntax from escaping the filters`                       | Search `dune) OR (harry` with the Fantasy genre                                      | The parentheses are escaped inside the group and the genre filter applies to the whole query       | 7        |
| `REF-01-T-2 search page restores filters from the URL`                          | Render `/search` with a genre, an unknown genre, a language, and an unsupported year | The search uses only the valid filters and the controls show them                                  | 8        |
| `REF-01-T-2 returns only the requested book's rating`                           | Rate two books, then list ratings with one book's key and with an unrated key        | Only that book's rating is returned, and `[]` for the unrated key                                  | 9        |
| `REF-01-T-2 rejects an invalid bookKey filter`                                  | List ratings with a malformed key, a repeated key, and an unknown query field        | Each returns `400` with `{ "error": "Invalid book key" }`                                          | 9        |
| `REF-01-T-2 asks for one book's rating`                                         | Call `getRatings` with a book key                                                    | `fetch` is called with the encoded `bookKey` query                                                 | 9        |
| `REF-01-T-2 malformed JSON is a bad request`                                    | POST `{` with a JSON content type                                                    | `400` with `{ "error": "Bad request" }`                                                            | 10       |
| `REF-01-T-2 an oversized body says so`                                          | POST a JSON body over Express's 100 KB limit                                         | `413` with `{ "error": "Payload Too Large" }`                                                      | 10       |
| Existing suites and project checks                                              | Run both test suites, lint, format check, type check, and build                      | Everything passes                                                                                  | 3, 11    |
