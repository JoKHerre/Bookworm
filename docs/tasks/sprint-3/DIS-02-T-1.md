---
id: DIS-02-T-1
story: DIS-02
sprint: 3
assignee: Jonathan H
estimate_hours: 3
---

# Return ranked similar books through the books API

## Description

Serves DIS-02 (discover similar books while viewing a book). Add a subject-based similar-books API. Showing the results on the details page belongs to DIS-02-T-2.

## Specs

- Add `GET /api/books/similar?key=/works/OL...W`, validated by `similarBooksQuery` using the existing `openLibraryWorkKey` rule. Return HTTP 200 with `{"books":[...]}`, validated by `similarBooksResponse`. Return at most six `BookSearchResult` records with work keys and optional author, year, and cover fields.
- Fetch the source work's subjects. Trim, collapse whitespace, lowercase, and deduplicate. Exclude empty labels, labels longer than 40 characters, labels containing `:`, and the normalized book title. Use the first three remaining labels.
- Search Open Library once with `q=subject:("first" OR "second" OR "third")`, using only the selected labels. Request `fields=key,title,author_name,first_publish_year,cover_i,subject`, using default relevance ordering.
- Skip candidates with invalid keys, blank titles, or malformed supplied fields. Missing optional display fields are allowed. Convert bare `OL...W` keys to `/works/OL...W` and exclude the source work.
- Score candidates by distinct exact matches between the selected labels and all their normalized subjects. Missing subjects mean no matches. Drop zero-score candidates and duplicate work keys, keeping the first qualifying record. Sort by score descending, then normalized title and work key ascending using ordinal comparison.
- Return `{"books":[]}` when no subjects or candidates qualify. Without usable source subjects, skip the search.
- Missing, repeated, or malformed input keys return 400 with `{"error":"Invalid book key"}` before any upstream call. A missing source work returns 404 with `{"error":"Book not found"}`. Other upstream failures, invalid JSON or source/search responses, and timeout return 502 with `{"error":"Unable to retrieve similar books"}`.
- Make at most two sequential requests: source work, then candidate search. No retries, pagination, or extra lookups.
- Apply one ten-second deadline across both requests and their body reads. Timeout or client disconnection aborts active upstream work and prevents further requests. Release timers and listeners afterward.

## Requirements

- Use `booksRouter` in `server/src/routes/books.ts`, `getSimilarBooks(workKey, signal)` in `server/src/services/openLibrary.ts`, and Zod schemas in `shared/books.ts` and `shared/openLibrary.ts`. Add no dependencies or database changes.
- Preserve existing tags, search, suggestions, ISBN browsing, availability, authentication, and personal-library behavior. Keep similarity ranking separate from search and suggestions, and its requests independent of ISBN and availability loading.

## Acceptance criteria

1. Valid requests return at most six schema-valid, unique canonical works, excluding the source and malformed candidates; optional display metadata may be absent.
2. Subject selection and the candidate query follow the specified rules.
3. Results follow the specified overlap, title, and key ordering for a fixed candidate pool.
4. Missing usable subjects or qualifying candidates return an empty 200 response; missing subjects trigger no search.
5. Invalid input returns the specified 400 response without upstream calls.
6. A missing source work returns the specified 404 response.
7. Upstream failures, invalid responses, and deadline expiry return the specified 502 response.
8. At most two upstream requests occur, without retries, pagination, or extra lookups.
9. Client disconnection aborts active work and prevents further upstream requests.

## Tests

Test file: `server/backend_tests/bookSimilar.test.ts`, using `node:test` and `node:assert/strict` with a stubbed `fetch` for Open Library.

| Test name                                                                    | Setup                                                                                                                       | Asserts                                                                                                           | Criterion |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| `DIS-02-T-1 returns six ranked unique canonical books`                       | Stub mixed candidates with score and title ties, bare keys, the source work, and an unrelated book; repeat in reverse order | Returns at most six canonical works, excludes the source, and keeps the same ranking when candidates are reversed | 1, 3      |
| `DIS-02-T-1 selects the first three usable normalized subjects`              | Stub source subjects with blanks, duplicates, the title, a colon label, and labels at the length boundaries                 | Filters and deduplicates subjects, then sends the first three with the requested fields                           | 2         |
| `DIS-02-T-1 treats punctuation in subjects as literal query text`            | Stub source subjects containing quotes and backslashes                                                                      | Quotes and backslashes are escaped in the subject query                                                           | 2         |
| `DIS-02-T-1 skips malformed candidates and allows optional display metadata` | Stub invalid candidates alongside valid books with and without display metadata                                             | Invalid records are skipped; valid books with or without optional metadata are returned                           | 1         |
| `DIS-02-T-1 keeps the first qualifying duplicate work`                       | Stub three records for one work: unrelated, qualifying, then a higher-scoring duplicate                                     | Unrelated duplicates are skipped and the first qualifying record is kept                                          | 1, 3      |
| `DIS-02-T-1 counts distinct exact matches across all candidate subjects`     | Stub repeated matches, matches after 20 unrelated subjects, and a partial match                                             | Repeated subjects count once, later subjects count, and partial matches are excluded                              | 3         |
| `DIS-02-T-1 skips candidate search without usable source subjects`           | Stub source subjects as missing, empty, or entirely unusable                                                                | Missing, empty, or unusable subjects return an empty 200 response with only one upstream call                     | 4         |
| `DIS-02-T-1 returns empty results without unrelated fallback`                | Stub an empty candidate pool, then a pool containing only invalid, source, or unrelated records                             | Empty or nonqualifying candidates return an empty 200 response                                                    | 4         |
| `DIS-02-T-1 rejects invalid keys without upstream calls`                     | Request the route with missing, empty, repeated, and malformed keys                                                         | Missing, repeated, and malformed keys return 400 without calling Open Library                                     | 5         |
| `DIS-02-T-1 distinguishes a missing source work`                             | Stub the source request to return 404                                                                                       | A source work returning 404 produces the specified 404 response                                                   | 6         |
| `DIS-02-T-1 reports upstream and malformed-response failures`                | Stub source and search HTTP errors, network errors, invalid JSON, and malformed data                                        | Source and search failures, invalid JSON, and malformed responses return 502                                      | 7         |
| `DIS-02-T-1 makes only a source request and one candidate search`            | Stub 100 matching candidates                                                                                                | A large candidate pool still needs only the source request and one search                                         | 8         |
| `DIS-02-T-1 applies one deadline through candidate body reads`               | Use fake timers: spend four seconds reading the source and four fetching candidates, then leave the candidate body pending  | Time spent fetching the source and candidates shares one ten-second deadline, including body reads                | 7         |
| `DIS-02-T-1 returns 502 when the overall deadline expires`                   | Leave the source fetch pending and advance fake timers by ten seconds                                                       | Deadline expiry returns the specified 502 response without starting a search                                      | 7, 8      |
| `DIS-02-T-1 cancels active fetches and does not start the search`            | Leave the source fetch pending, then abort the caller signal                                                                | Cancellation aborts the active source fetch and prevents the search                                               | 9         |
| `DIS-02-T-1 aborts source body reads when the client disconnects`            | Leave the source body read pending, then cancel the HTTP request                                                            | Client disconnection aborts the source body read and prevents the search                                          | 9         |
