---
id: COL-06-T-3
story: COL-06
sprint: 3
assignee: Natalie Marks
estimate_hours: 2
---

# Filter the personal library by one tag

## Description

Serves COL-06 (books have automatic tags so users can organize them easily). This task adds a tag dropdown to the personal library page that narrows the saved books to those carrying the chosen tag, using the `tags` returned by `GET /api/books/details`. Selecting several tags at once belongs to COL-06-T-4 and is out of scope.

## Specs

- Add `libraryTags(books)` and `filterByTag(books, tag)` to `shared/tags.ts`. Books are objects with `details: { tags: string[] } | null`.
  - `libraryTags` returns the sorted, de-duplicated tags across all given books; books without details contribute nothing.
  - `filterByTag` returns the books whose tags include `tag`. An empty `tag` returns all books unchanged. Books without details never match a non-empty tag.
- In `src/pages/PersonalLibraryPage.tsx`, show a labelled "Filter by tag" dropdown above the book list whenever the library has at least one tag. Its first option is "All tags"; the other options are `libraryTags` of the saved books.
- Choosing a tag shows only the matching saved books; choosing "All tags" shows every saved book again. Removing a book or changing a reading status keeps the current filter.
- If a filter matches no books (for example after removing the last book with that tag), show "No books match this tag." and keep the dropdown usable. If the selected tag no longer exists in the library, the selection resets to "All tags".

## Requirements

- Use the existing page, components, and CSS conventions; filter in the browser using details already loaded. Do not add API endpoints, database tables, or dependencies.
- Preserve saving, removal, reading status, ratings, and book navigation.
- The dropdown must be keyboard accessible with a visible label and focus ring.

## Acceptance criteria

1. `libraryTags` returns the sorted unique tags of the given books and ignores books without details.
2. `filterByTag` returns only books containing the tag, returns every book for an empty tag, and never matches books without details.
3. The library page offers a "Filter by tag" dropdown listing "All tags" plus every tag in the library.
4. Choosing a tag shows only matching books; "All tags" restores the full list.
5. A tag with no remaining books shows "No books match this tag." and the dropdown stays usable.

## Tests

Pure filtering logic is tested in `server/backend_tests/libraryTags.test.ts` with `node:test`; the page itself has no frontend test runner and is verified with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and manual checks.

| Test name                                            | Setup / Asserts                                                               | Criterion |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `COL-06-T-3 lists sorted unique library tags`        | Books with overlapping tags and one without details return sorted unique tags | 1         |
| `COL-06-T-3 filters books by one tag`                | Only books containing the tag are returned, in original order                 | 2         |
| `COL-06-T-3 empty tag returns every book`            | Empty tag returns all books, including ones without details                   | 2         |
| `COL-06-T-3 books without details never match a tag` | A book with `details: null` is excluded for a non-empty tag                   | 2         |
| Dropdown lists tags (manual)                         | Open My Library with several saved books                                      | 3         |
| Choosing a tag filters the list (manual)             | Pick a tag, then "All tags"                                                   | 4         |
| Empty filter shows a message (manual)                | Select a tag, remove its only book                                            | 5         |
