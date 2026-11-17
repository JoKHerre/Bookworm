---
id: IMP-01-T-1
story: IMP-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 2
---

# Define the supported book import formats

## Description

Serves IMP-01 (import a list of books so users do not add them one at a time). This task decides, in one shared module, exactly which files and columns the importer accepts, so the upload UI (IMP-01-T-2), parser (IMP-01-T-3), validation (IMP-01-T-4), and server (IMP-01-T-5) all agree. Reading file contents, matching titles to Open Library books (IMP-02), and reviewing imports (IMP-03) are out of scope.

## Specs

- Add `shared/bookImport.ts` exporting these constants:
  - `IMPORT_MAX_FILE_BYTES` = 1,048,576 (1 MB) and `IMPORT_MAX_ROWS` = 500.
  - `IMPORT_COLUMNS` = `["title", "author", "isbn", "book_key"]`, and `IMPORT_REQUIRED_COLUMNS` = `["title"]`.
  - `IMPORT_FILE_EXTENSIONS` = `[".csv"]`.
- Add `checkImportFile(file)` taking `{ name: string; size: number }` and returning `{ ok: true }` or `{ ok: false; error: string }`. Checks run in this order:
  1. The name does not end in `.csv` (case-insensitive): "Unsupported file type. Choose a .csv file."
  2. The size is 0: "This file is empty."
  3. The size exceeds `IMPORT_MAX_FILE_BYTES`: "This file is too large. The limit is 1 MB."
- Add `checkImportHeaders(headers)` taking the header row as strings. Headers are matched after trimming and lowercasing, and a leading byte-order mark is ignored. It returns `{ ok: true; columns: string[] }` with the normalized headers, or `{ ok: false; error: string }`:
  - A required column is missing: `Missing required column: title.`
  - A header is not in `IMPORT_COLUMNS`: `Unknown column: <name>.` (the first one found, in file order).
  - A column appears twice: `Duplicate column: <name>.`
- Document the format in `README.md` under a new "Importing books" heading: a CSV with a header row, the four columns, which one is required, and the limits.

## Requirements

- Pure functions with no dependencies, no I/O, and no use of browser or Node APIs, so they run in both the frontend and the server.
- Do not add dependencies, database tables, endpoints, or UI.
- File type is judged by extension only; MIME types are not trusted.

## Acceptance criteria

1. `checkImportFile` accepts a non-empty `.csv` file within the size limit, regardless of extension case.
2. `checkImportFile` rejects other extensions, empty files, and files over 1 MB with the exact messages above, checking in the stated order.
3. `checkImportHeaders` accepts headers that include `title`, in any order and any case, with surrounding spaces or a byte-order mark, and returns them normalized.
4. `checkImportHeaders` rejects a missing `title`, an unknown column, and a duplicated column with the exact messages above.
5. The importable format is documented in the README.

## Tests

Tested in `server/backend_tests/bookImport.test.ts` with `node:test`, because `shared/` code is tested through the server test runner.

| Test name                                                  | Setup / Asserts                                             | Criterion |
| ---------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| `IMP-01-T-1 accepts a csv file within the limit`           | `books.csv`, `BOOKS.CSV`, and a file of exactly 1 MB are ok | 1         |
| `IMP-01-T-1 rejects other file types`                      | `.xlsx`, `.txt`, and a name with no extension are rejected  | 2         |
| `IMP-01-T-1 rejects empty files`                           | A zero-byte `.csv` returns "This file is empty."            | 2         |
| `IMP-01-T-1 rejects files over the size limit`             | 1 MB + 1 byte returns the too-large message                 | 2         |
| `IMP-01-T-1 checks the file type before the size`          | An empty `.txt` returns the file type message               | 2         |
| `IMP-01-T-1 accepts and normalizes headers`                | `[" Title ", "AUTHOR"]` returns `["title", "author"]`       | 3         |
| `IMP-01-T-1 ignores a byte-order mark on the first header` | `"﻿title"` is accepted as `title`                           | 3         |
| `IMP-01-T-1 rejects a missing title column`                | `["author"]` returns "Missing required column: title."      | 4         |
| `IMP-01-T-1 rejects an unknown column`                     | `["title", "rating"]` returns "Unknown column: rating."     | 4         |
| `IMP-01-T-1 rejects a duplicate column`                    | `["title", "Title"]` returns "Duplicate column: title."     | 4         |
| README documents the format (manual)                       | Read the "Importing books" section                          | 5         |
