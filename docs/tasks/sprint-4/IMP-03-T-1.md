---
id: IMP-03-T-1
story: IMP-03
sprint: 4
assignee: Natalie Marks
estimate_hours: 1.5
---

# Create import preview for flagged books

## Description

Serves IMP-03 (review imported books to make sure they were imported correctly). This task lists the books an import will add before the user confirms it, and flags matches that may be the wrong book, so the user can see what IMP-02 matched instead of trusting a count. Including or excluding entries and resolving unmatched rows belong to IMP-03-T-2. The import results belong to IMP-03-T-3.

## Specs

- Add `matchNeedsCheck(row, book)` to `shared/bookMatch.ts`. It returns true when the normalized titles differ (`normalizeTitle`), or when the row has an author and `authorsMatch` fails for the book's authors. This catches ISBN matches for another book and matches that only agreed on the title before a `:`.
- In `src/pages/ImportBooksPage.tsx`, once matching is done, show a "Ready to import" section above "Pick the right book". It lists each matched book once by key, in file order, with flagged books first. A book matched by several rows is flagged when any of them needs a check, and shows that row's file entry, so an ISBN for another book isn't hidden behind a correct row.
- Each item shows the matched book's title, then its authors and first publish year when known, in the same form as the picker. Rows matched by `book_key` show the file's title and author, and are never flagged.
- A flagged item has a "Check this match" tag and a line "In your file: <title> by <author>" (just the title when there is no author).
- Ambiguous picks stay in "Pick the right book" and aren't repeated in the preview.

## Requirements

- Use the existing import page styles and palette tokens. Add no dependencies.
- Keep the matching, picker, retry and import behavior from IMP-02-T-3.

## Acceptance criteria

1. After matching, every matched book that will be imported is listed with its title, authors and year.
2. Matches whose title or author differ from the file are flagged and show what the file said.
3. Books matched by `book_key` are listed and not flagged.
4. A book matched by more than one row is listed once, and flagged if any of those rows needs a check.

## Tests

`matchNeedsCheck` is tested in `shared/bookMatch.test.ts`. The page is tested in `src/pages/ImportBooksPage.test.tsx` with Testing Library, mocking `src/api/books.ts` and `src/api/library.ts`.

| Test name                                                | Setup / Asserts                                                               | Criterion |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `IMP-03-T-1 flags a match with another title`            | A different title or a title matched only before `:` is flagged; equal is not | 2         |
| `IMP-03-T-1 flags a match with another author`           | A row author that doesn't match the book is flagged; no row author is not     | 2         |
| `IMP-03-T-1 lists matched books before import`           | Matched rows show title, author and year under "Ready to import"              | 1         |
| `IMP-03-T-1 flags doubtful matches first`                | A flagged match is listed first with the tag and the file's title and author  | 2         |
| `IMP-03-T-1 lists keyed books without a flag`            | A `book_key` row shows the file's title and author and has no tag             | 3         |
| `IMP-03-T-1 lists a book matched twice once`             | Two rows matching the same key give one item                                  | 4         |
| `IMP-03-T-1 flags a book when a later row needs a check` | A correct row and a later doubtful row for one key give one flagged item      | 4         |
