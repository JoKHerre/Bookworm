---
id: COL-06-T-4
story: COL-06
sprint: 3
assignee: Natalie Marks
estimate_hours: 1
---

# Combine several tag filters in the personal library

## Description

Serves COL-06 (books have automatic tags so users can organize them easily). This task extends the single-tag dropdown from COL-06-T-3 so a user can select several tags at once and see only the saved books that carry all of them. New tags, server-side filtering, and saved filters are out of scope.

## Specs

- Add `filterByTags(books, tags)` to `shared/tags.ts`. It returns the books whose tags include every tag in `tags` (AND). An empty `tags` array returns all books unchanged. Books without details never match a non-empty selection.
- In `src/pages/PersonalLibraryPage.tsx`, replace the "Filter by tag" dropdown with a "Filter by tags" group of checkboxes, one per entry of `libraryTags`, each labelled with its tag. Checking and unchecking tags updates the visible books immediately.
- Show a "Clear tags" button, disabled when no tag is selected, that unchecks every tag and shows all saved books.
- Selected tags that no longer exist in the library (for example after removing a book) are dropped from the selection.
- When the selected combination matches no saved books, show "No books match these tags." and keep the checkboxes and "Clear tags" usable.
- Removing a book or changing a reading status keeps the current selection.

## Requirements

- Use the existing page, components, and CSS conventions; filter in the browser. Do not add API endpoints, database tables, or dependencies.
- Checkboxes and "Clear tags" must be keyboard accessible, with visible labels and focus rings.
- Preserve saving, removal, reading status, ratings, and book navigation.

## Acceptance criteria

1. `filterByTags` returns only books containing every selected tag, returns every book for an empty selection, and never matches books without details.
2. Selecting several tags shows only saved books that have all of them; unchecking one widens the results while keeping the others.
3. "Clear tags" removes every selection, restoring the full list, and is disabled when nothing is selected.
4. A combination with no matching books shows "No books match these tags." and the controls stay usable.
5. Selected tags that disappear from the library are dropped from the selection.

## Tests

Pure filtering logic is tested in `server/backend_tests/libraryTags.test.ts` with `node:test`; the page has no frontend test runner and is verified with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and manual checks.

| Test name                                                      | Setup / Asserts                                                                | Criterion |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| `COL-06-T-4 requires every selected tag`                       | Two tags return only books carrying both                                       | 1         |
| `COL-06-T-4 empty selection returns every book`                | An empty array returns all books, including ones without details               | 1         |
| `COL-06-T-4 books without details never match a selection`     | A book with `details: null` is excluded for a non-empty selection              | 1         |
| `COL-06-T-4 a combination with no common book returns nothing` | Tags that never occur together return an empty array                           | 4         |
| Checking tags narrows the list (manual)                        | Check two tags, then uncheck one                                               | 2         |
| Clear tags restores the list (manual)                          | Select tags, click "Clear tags"; it becomes disabled                           | 3         |
| No match shows a message (manual)                              | Select two tags no single book shares                                          | 4         |
| Removed tags drop out (manual)                                 | Select a tag, remove its only book; the tag disappears and is no longer active | 5         |
