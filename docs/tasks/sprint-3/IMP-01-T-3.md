---
id: IMP-01-T-3
story: IMP-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 0.5
---

# Parse an uploaded CSV file into import rows

## Description

Serves IMP-01 (import a list of books so users do not add them one at a time). This task turns the text read by the Import books page (IMP-01-T-2) into structured rows using the columns defined in IMP-01-T-1, and shows how many books were found. Checking the values in each row (IMP-01-T-4) and saving them (IMP-01-T-5) are out of scope.

## Specs

- Add `shared/csvImport.ts` exporting `parseImportCsv(text)`, which returns `{ ok: true; rows: ImportRow[] }` or `{ ok: false; error: string }`.
- `ImportRow` is `{ row: number; title: string; author: string; isbn: string; book_key: string }`. `row` is the spreadsheet row number, so the header is row 1 and the first book is row 2. Every value is trimmed. A column missing from the file is `""`.
- Parsing follows RFC 4180: fields are separated by commas; a field wrapped in double quotes may contain commas, line breaks, and `""` for a literal quote. `\n`, `\r\n`, and `\r` all end a record, a leading byte-order mark is ignored, and a final line break does not create an empty record.
- Records whose every field is blank are skipped (but still count toward `row` numbering).
- The first record is the header and is checked with `checkImportHeaders`; its error is returned unchanged.
- Errors, each returned as `{ ok: false, error }`:
  - Text with no records: "This file is empty."
  - A quote that is never closed: "The file has an unclosed quote."
  - A record with more fields than the header: `Row <n> has more values than the header.` Records with fewer fields are padded with `""`.
  - No book rows after the header: "This file has no books."
  - More than `IMPORT_MAX_ROWS` book rows: "Too many rows. The limit is 500."
- In `src/pages/ImportBooksPage.tsx`, after "Upload" reads the file, call `parseImportCsv`. On success show `<name> is ready to import.` and, in the same status area, "<n> books found." (singular "1 book found."). On failure show the parser's error in the `role="alert"` element and no status message.

## Requirements

- `parseImportCsv` is a pure function with no dependencies, no I/O, and no browser or Node APIs, so it runs in the frontend and on the server.
- Do not add dependencies, API endpoints, or database tables, and do not send the file anywhere.
- Preserve the IMP-01-T-1 and IMP-01-T-2 behavior.

## Acceptance criteria

1. A header-plus-rows CSV becomes an array of `ImportRow` with trimmed values, numbered from 2, with columns in any order and missing optional columns as `""`.
2. Quoted fields with commas, line breaks, and escaped quotes are parsed correctly, with `\n`, `\r\n`, and `\r` line endings and a byte-order mark.
3. Blank records are skipped and a trailing line break adds no record.
4. Header errors are returned unchanged; empty text, an unclosed quote, a record with too many values, no book rows, and more than 500 rows each return their exact message.
5. After upload, the page shows the number of books found for a valid file and the parser's error for an invalid one.

## Tests

Parser tests are in `server/backend_tests/csvImport.test.ts` with `node:test`; the page tests are in `src/pages/ImportBooksPage.test.tsx`.

| Test name                                                  | Setup / Asserts                                                        | Criterion |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| `IMP-01-T-3 parses rows with trimmed values`               | Header and two rows return trimmed rows numbered 2 and 3               | 1         |
| `IMP-01-T-3 supports any column order and missing columns` | `author,title` order; absent `isbn` and `book_key` are `""`            | 1         |
| `IMP-01-T-3 parses quoted fields`                          | Commas, a line break, and `""` inside quotes are kept                  | 2         |
| `IMP-01-T-3 supports all line endings`                     | `\n`, `\r\n`, and `\r` give the same rows                              | 2         |
| `IMP-01-T-3 ignores a byte-order mark`                     | A leading `﻿` does not change the header                               | 2         |
| `IMP-01-T-3 skips blank records and trailing newline`      | Blank line is skipped, later rows keep their row numbers               | 3         |
| `IMP-01-T-3 pads short records`                            | A record with fewer fields gets `""` for the rest                      | 1         |
| `IMP-01-T-3 returns header errors unchanged`               | Missing title returns "Missing required column: title."                | 4         |
| `IMP-01-T-3 rejects empty text`                            | `""` and only blank lines return "This file is empty."                 | 4         |
| `IMP-01-T-3 rejects an unclosed quote`                     | `title\n"Dune` returns the unclosed quote error                        | 4         |
| `IMP-01-T-3 rejects a record with too many values`         | Row with an extra field returns the row-numbered error                 | 4         |
| `IMP-01-T-3 rejects a file with no books`                  | Header only returns "This file has no books."                          | 4         |
| `IMP-01-T-3 rejects too many rows`                         | 501 rows returns the limit error and 500 rows is accepted              | 4         |
| `IMP-01-T-3 page shows the number of books found`          | Upload a two-row file; "2 books found." appears, and "1 book found."   | 5         |
| `IMP-01-T-3 page shows the parser error`                   | Upload a file with an unknown column; the alert shows the parser error | 5         |
