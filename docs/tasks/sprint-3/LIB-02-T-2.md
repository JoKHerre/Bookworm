---
id: LIB-02-T-2
story: LIB-02
sprint: 3
assignee: Jonathan Villalobos
estimate_hours: 3
---

## Description
# Search titles in the library catalog by format (book and eBook)
## Specs
- Add `GET /api/books/library-search` accepting `title` and `format` (`book` or `ebook`).
- Search the SCPL catalog by title keyword, limited to the requested material type, and return `{ results }` with up to 5 entries.
- Each result contains `bibid`, `title`, and optional `author` and `format`, and links to its catalog record.
- Results are not filtered against the current book, so exact-title matches are included.
- No matches returns an empty `results` array.
- Invalid or missing `title` or `format` returns HTTP 400 with an error message without contacting the catalog. Catalog failures or timeouts return HTTP 502 with an error message.
- The book details page shows one section per format, styled like Library Availability. Each section has its own loading, empty, and error states and loads independently of availability.

## Requirements
- Use the existing books router, catalog service (`searchlibrary.ts`), and shared zod validation patterns.
- Title search uses its own request timeout (20s). The ISBN availability timeout (5s) is unchanged.
- Share the format values between server and frontend through `shared/titleSearch.ts`.
- Do not add runtime or test dependencies, database tables, or authentication requirements.
- Preserve ISBN availability, search, suggestions, book details, and personal-library behavior.

## Acceptance Criteria
1. A valid title and format returns up to 5 catalog results of that format.
2. A title with no catalog matches returns empty `results`.
3. Invalid `title` or `format` returns HTTP 400 without contacting the catalog; catalog failures return HTTP 502. Both include an error message.
4. The book details page shows a Books section and an eBooks section, each with loading, empty, error, and results states.
5. Existing ISBN availability behavior and its timeout are unchanged.
