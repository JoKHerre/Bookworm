---
id: DIS-01-T-2
story: DIS-01
sprint: 4
assignee: Natalie Marks
estimate_hours: 2
---

# Recommend books from a user's liked genres

## Description

Serves DIS-01 (recommendations based on my interests). This task adds an API that recommends books from the genres the user picked in DIS-01-T-1. Showing the recommendations belongs to DIS-01-T-3.

## Specs

- Add `GET /api/recommendations` for the signed-in user. It returns 200 with `{"books":[...]}`, validated by `recommendationsResponse`. The response has at most 12 books, each with a canonical `/works/OL...W` key, a non-blank title, and optional author, year, and cover fields.
- A user with no liked genres gets `{"books":[]}` and no Open Library requests are made.
- For each liked genre, search Open Library once with `q=subject:"<subject>"`, `sort=rating`, `limit=20`, and `fields=key,title,author_name,first_publish_year,cover_i`. The subject is the lowercased genre, except that `Sci-fi` is `science fiction` and `Non-fiction` is `nonfiction`. Search filters use the same mapping.
- Run the genre searches in parallel. Cache each genre's results for one hour, shared by all users.
- Merge the results by taking the first book from each genre, then the second from each, and so on, in `BOOK_GENRES` order. Convert bare `OL...W` keys to `/works/OL...W`. Skip records with invalid keys, blank titles, or malformed fields. Skip books already listed, books in the user's library, and books the user has rated.
- If one genre search fails, it is skipped. If every genre search fails, return 502 with `{"error":"Unable to retrieve recommendations"}`. Logged-out requests return 401.
- If the client disconnects, abort the user's pending genre searches.

## Requirements

- Add the route in `server/src/routes/recommendations.ts`, `getGenreBooks(genre, signal)` in `server/src/services/openLibrary.ts`, and `recommendationsResponse` in `shared/books.ts`. Add no dependencies or database changes.
- Preserve search, filters, suggestions, similar books, interests, and the personal library.

## Acceptance criteria

1. Recommendations come from the user's liked genres, alternate between genres, and have at most 12 unique, schema-valid books with canonical keys.
2. Each genre search sends the specified subject query, sort, limit, and fields.
3. Books in the user's library, books the user rated, and malformed records are left out.
4. A user without liked genres gets an empty list without any Open Library request.
5. Genre results are cached, so a second request for the same genre doesn't search Open Library again.
6. A failed genre search is skipped. When every search fails, the route returns the specified 502, and logged-out requests return 401.

## Tests

Test file: `server/backend_tests/recommendations.test.ts`, using `node:test`, real Postgres, and a stubbed `fetch` for Open Library.

| Test name                                             | Setup / Asserts                                                                 | Criterion |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| `DIS-01-T-2 alternates between liked genres`          | Two genres with several books; results alternate and stop at 12                 | 1         |
| `DIS-01-T-2 sends one rated subject search per genre` | Sci-fi and Non-fiction map to their subjects with the sort, limit and fields    | 2         |
| `DIS-01-T-2 skips duplicates and malformed records`   | Bare keys become canonical; a book in two genres appears once; bad records drop | 1, 3      |
| `DIS-01-T-2 leaves out saved and rated books`         | Books in the library and rated books are not recommended                        | 3         |
| `DIS-01-T-2 returns nothing without liked genres`     | No genres returns `{"books":[]}` and makes no upstream request                  | 4         |
| `DIS-01-T-2 caches genre results`                     | Two requests for the same genres search Open Library once per genre             | 5         |
| `DIS-01-T-2 skips a failed genre`                     | One genre returns 500; the other genre's books are returned                     | 6         |
| `DIS-01-T-2 reports when every genre fails`           | All genre searches fail or return invalid JSON; the route returns 502           | 6         |
| `DIS-01-T-2 requires login`                           | No session returns 401                                                          | 6         |
