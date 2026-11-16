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
