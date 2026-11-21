---
id: IMP-02-T-3
story: IMP-02
sprint: 4
assignee: Natalie Marks
estimate_hours: 1.5
---

# Handle ambiguous, missing, or failed matches

## Description

Serves IMP-02 (match imported titles with known books so users don't have to fill in their information). This task runs the lookup from IMP-02-T-2 on the import page and lets users resolve what it couldn't match on its own, so rows without a `book_key` can be imported. Editing imported rows before saving belongs to IMP-03.

## Specs

- In `src/pages/ImportBooksPage.tsx`, after a file is read and validated, valid rows with a `book_key` count as matched. The rest are sent to `matchImportRows` in batches of `IMPORT_MATCH_BATCH_SIZE`, one batch at a time. While this runs, a `role="status"` line shows "Matching books… <done> of <total>".
- When a batch request fails, its rows count as failed and later batches still run. A 401 stops matching and shows the error in the `role="alert"` element.
- Choosing another file aborts matching that is still running.
- When matching is done, show:
  - A "Pick the right book" section for ambiguous rows. Each row shows its title (and author, if any) as the label of a select. Each candidate's option reads "Author (Year)", with the candidate's title in front when it differs from the row's or the candidate has no author. "Skip this book" is the first option and the default. Rows that are left ambiguous after the IMP-02-T-1 rules are ones Open Library can't settle, so nothing is chosen for the user.
  - A "No match found" section listing the title (and author) of each row with no match.
  - For failed rows, a "Could not look up <n> books" section (singular "1 book") listing their titles (and authors), and a "Try again" button that re-runs matching for those rows only.
- The "Import <n> books" button counts the unique keys of matched rows and ambiguous rows with a chosen book, and imports them. It is disabled while matching runs. The message about rows lacking a `book_key` is removed.
- The "Upload" button sits right below the file picker. Once a file has been read, it uses the outlined secondary style so "Import <n> books" is the only filled button.

## Requirements

- Calls go through `src/api/books.ts`. Use the existing import page styles and palette tokens. Add no dependencies.
- Preserve file checks, row validation errors and the import result from IMP-01.

## Acceptance criteria

1. Rows without a `book_key` are matched in batches with visible progress, and rows with one aren't sent.
2. Matched rows are included in the import without any user action.
3. Ambiguous rows offer their candidates and are imported only when the user picks one.
4. Rows with no match are listed and skipped.
5. Failed rows are counted and can be retried on their own; a failed batch doesn't stop the others, and a 401 stops matching with an error.
6. Choosing another file stops matching for the old one.

## Tests

Tested in `src/pages/ImportBooksPage.test.tsx` with Testing Library, mocking `src/api/books.ts` and `src/api/library.ts`.

| Test name                                            | Setup / Asserts                                                              | Criterion |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| `IMP-02-T-3 matches rows in batches`                 | 8 rows without keys make two calls of 6 and 2; progress is shown             | 1         |
| `IMP-02-T-3 skips matching for rows with a book key` | Keyed rows aren't sent; with only keyed rows no call is made                 | 1         |
| `IMP-02-T-3 imports matched rows`                    | Matched and keyed rows are counted in the button and their keys are imported | 2         |
| `IMP-02-T-3 imports a picked ambiguous book`         | Default is skip; option labels drop a repeated title; a pick is imported     | 3         |
| `IMP-02-T-3 lists books with no match`               | A `none` row appears under "No match found" and isn't imported               | 4         |
| `IMP-02-T-3 retries failed rows`                     | A failed row is listed; "Try again" sends only that row and matches it       | 5         |
| `IMP-02-T-3 keeps going after a failed batch`        | First batch rejects, second resolves; both are accounted for                 | 5         |
| `IMP-02-T-3 stops matching on an expired session`    | A 401 shows the session message and makes no more calls                      | 5         |
| `IMP-02-T-3 aborts matching when the file changes`   | Choosing a new file aborts the pending request's signal                      | 6         |
