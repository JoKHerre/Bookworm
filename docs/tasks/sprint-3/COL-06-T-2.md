---
id: COL-06-T-2
story: COL-06
sprint: 3
assignee: Natalie Marks
estimate_hours: 1
---

# Show a book's tags on the book details page

## Description

Serves COL-06 (books have automatic tags so users can organize them easily). This task replaces the raw "Genres" subject list on the book details page with the tags returned by `GET /api/books/details` from COL-06-T-1. Filtering by tag in the personal library belongs to COL-06-T-3 and COL-06-T-4 and is out of scope.

## Specs

- In `src/pages/BookDetailsPage.tsx`, replace the "Genres" section with a "Tags" section that lists every entry of the `tags` array returned for the book, in order, using the existing tag styling.
- A book with no tags shows the message "No tags available."
- The section appears together with the rest of the loaded book details and is not shown while loading or after a failed load.
- Tags are plain text, not links or buttons.

## Requirements

- Use the existing page, `BookDetails` type from `shared/books.ts`, and CSS conventions. Do not add runtime or test dependencies.
- Do not change the details API, the search page, or personal-library behavior.

## Acceptance criteria

1. The details page shows a "Tags" section listing each tag returned by the API.
2. A book with no tags shows "No tags available."
3. The raw subjects are no longer shown as genres.

## Tests

The repository has no frontend test runner, so this task is verified with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and manual checks in the running app:

| Test name                 | Setup                                                          | Asserts                                             | Criterion |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------------- | --------- |
| Tags are listed           | Open the details page of a book with subjects (e.g. a fantasy) | A "Tags" heading and up to 10 lowercase tags appear | 1, 3      |
| Missing tags show message | Open the details page of a book whose work has no subjects     | "No tags available." appears under "Tags"           | 2         |
