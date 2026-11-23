---
id: IMP-03-T-2
story: IMP-03
sprint: 4
assignee: Natalie Marks
estimate_hours: 1.5
---

# Allow users to include/exclude entries or resolve unmatched entries

## Description

Serves IMP-03 (review imported books to make sure they were imported correctly). This task lets the user act on the preview from IMP-03-T-1: leave out books they don't want, and find the right book for rows that had no match. Confirming the import and showing per-book results belong to IMP-03-T-3.

## Specs

- In `src/pages/ImportBooksPage.tsx`, each "Ready to import" item has a checkbox labeled with the book, checked by default. Unchecking it leaves the book out of the import. Choosing or uploading a file resets the checkboxes.
- Each "No match found" row has a "Search" button. It opens a search form for that row, and only one is open at a time. The form has a "Search Open Library" input, filled with the row's title and author, and a "Search" button.
- Searching calls `searchBooks` from `src/api/books.ts` and lists the first `IMPORT_SEARCH_RESULTS` (5) results, labeled like the preview, each with a "Choose" button. While it runs the button reads "Searching…". With no results it says "No books found.", and a failed request shows its error in a `role="alert"` element inside the form. Closing the form or searching again aborts the request still running.
- Choosing a result moves the row from "No match found" to "Ready to import" as an included book. It isn't flagged, since the user picked it.
- The "Import <n> books" button counts the unique keys of included preview books and picked ambiguous books.

## Requirements

- Calls go through `src/api/books.ts`. Use the existing import page styles and palette tokens. Add no dependencies.
- Keep the matching, picker, retry, preview and import behavior from IMP-02-T-3 and IMP-03-T-1.

## Acceptance criteria

1. Every preview book can be left out of the import and put back.
2. A row with no match can be searched for by hand, starting from its title and author.
3. A chosen search result is imported like a matched book.
4. Searching shows progress, an empty result and errors.

## Tests

Tested in `src/pages/ImportBooksPage.test.tsx` with Testing Library, mocking `src/api/books.ts` and `src/api/library.ts`.

| Test name                                                 | Setup / Asserts                                                                     | Criterion |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| `IMP-03-T-2 leaves out an unchecked book`                 | Unchecking a book lowers the count and drops its key; checking it again restores it | 1         |
| `IMP-03-T-2 searches for a row with no match`             | "Search" opens a form filled with the title and author; results list up to 5 books  | 2         |
| `IMP-03-T-2 imports a chosen search result`               | Choosing a result moves the row to the preview, unflagged, and its key is imported  | 3         |
| `IMP-03-T-2 shows search progress, no results and errors` | "Searching…" while pending, "No books found." for none, the error for a rejection   | 4         |
| `IMP-03-T-2 aborts a search when the form closes`         | Opening another row's form aborts the pending request's signal                      | 4         |
