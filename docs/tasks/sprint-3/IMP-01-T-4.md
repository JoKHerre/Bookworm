---
id: IMP-01-T-4
story: IMP-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 0.5
---

# Validate the parsed import rows

## Description

Serves IMP-01 (import a list of books so users do not add them one at a time). This task checks every row produced by `parseImportCsv` (IMP-01-T-3) and tells the user which rows have problems before anything is saved. Saving the valid rows (IMP-01-T-5), matching titles to Open Library books (IMP-02), and letting users fix rows in the browser (IMP-03) are out of scope.

## Specs

- Add `validateImportRows(rows)` to `shared/csvImport.ts`. It takes `ImportRow[]` and returns `{ valid: ImportRow[]; errors: ImportRowError[] }`, where `ImportRowError` is `{ row: number; message: string }`. Every input row ends up in exactly one of the two lists, and both keep the file's order.
- A row gets at most one error, the first that applies in this order:
  1. Empty title: `Row <n>: title is required.`
  2. Title over 300 characters: `Row <n>: title is longer than 300 characters.`
  3. Author over 200 characters: `Row <n>: author is longer than 200 characters.`
  4. A non-empty `isbn` that is not a valid ISBN-10 or ISBN-13 (hyphens and spaces are ignored, the ISBN-10 check digit may be `X`, and the checksum must match): `Row <n>: isbn is not a valid ISBN-10 or ISBN-13.`
  5. A non-empty `book_key` that does not match `openLibraryWorkKey` from `shared/books.ts`: `Row <n>: book_key is not a valid Open Library work key.`
  6. A row that repeats an earlier valid row: `Row <n>: duplicate of row <m>.` Two rows are duplicates when they share a `book_key`; otherwise when they share a normalized ISBN; otherwise when `title` and `author` match ignoring case. A row's identity is its `book_key`, else its ISBN, else its title and author.
- Valid rows are returned with `isbn` normalized to digits (and a final `X`), with hyphens and spaces removed.
- In `src/pages/ImportBooksPage.tsx`, after a successful parse, validate the rows. The status message becomes `<name> is ready to import. <n> books found. <v> valid, <e> with problems.` When there are errors, list them under a "Rows with problems" heading, one list item per error, in row order.

## Requirements

- `validateImportRows` is a pure function with no dependencies and no browser or Node APIs, so it runs in the frontend and on the server.
- Do not add dependencies, API endpoints, or database tables. Nothing is saved yet.
- Preserve the IMP-01-T-1 to T-3 behavior.

## Acceptance criteria

1. Rows with a title and no other fields, or with valid optional fields, are returned as valid, in order.
2. Empty or too-long titles and too-long authors are reported with the exact messages above.
3. Valid ISBN-10 (including a final `X`) and ISBN-13 values, with or without hyphens or spaces, are accepted and normalized; bad lengths, characters, and checksums are reported.
4. A `book_key` that is not an Open Library work key is reported; a valid one is accepted.
5. Duplicate rows are reported against the first row they repeat, and each row has at most one error in the stated order.
6. After upload, the page shows the valid and problem counts and lists every row error.

## Tests

Validation tests are in `server/backend_tests/csvImport.test.ts` with `node:test`; the page tests are in `src/pages/ImportBooksPage.test.tsx`.

| Test name                                                 | Setup / Asserts                                                           | Criterion |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| `IMP-01-T-4 accepts rows with only a title`               | Rows with just titles are all valid, in order                             | 1         |
| `IMP-01-T-4 requires a title`                             | Empty title returns "Row 2: title is required."                           | 2         |
| `IMP-01-T-4 limits title and author length`               | 301-character title and 201-character author return their messages        | 2         |
| `IMP-01-T-4 accepts valid ISBNs and normalizes them`      | ISBN-13 with hyphens, ISBN-10, and ISBN-10 ending in X are valid, cleaned | 3         |
| `IMP-01-T-4 rejects invalid ISBNs`                        | Wrong length, letters, and a bad checksum return the ISBN message         | 3         |
| `IMP-01-T-4 checks the book key`                          | `/works/OL45883W` is valid; `/books/OL1M` and `OL1W` are not              | 4         |
| `IMP-01-T-4 reports duplicate book keys`                  | Second row with the same key returns "duplicate of row 2."                | 5         |
| `IMP-01-T-4 reports duplicate ISBNs and titles`           | Same ISBN in different formats, and same title and author in other case   | 5         |
| `IMP-01-T-4 does not treat different books as duplicates` | Same title with different authors are both valid                          | 5         |
| `IMP-01-T-4 reports only the first error per row`         | Empty title and bad ISBN return only the title error                      | 5         |
| `IMP-01-T-4 keeps every row in exactly one list`          | Mixed rows: valid plus errors cover all rows, in file order               | 1         |
| `IMP-01-T-4 page shows valid and problem counts`          | Upload a file with one bad row; the status shows both counts              | 6         |
| `IMP-01-T-4 page lists row problems`                      | The bad row's message is listed under "Rows with problems"                | 6         |
