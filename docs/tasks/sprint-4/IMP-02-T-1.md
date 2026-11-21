---
id: IMP-02-T-1
story: IMP-02
sprint: 4
assignee: Natalie Marks
estimate_hours: 1
---

# Decide on matching rules

## Description

Serves IMP-02 (match imported titles with known books so users don't have to fill in their information). This task decides, in one shared module, when an imported row counts as a match for an Open Library search result, so the lookup (IMP-02-T-2) and the import page (IMP-02-T-3) agree. Calling Open Library belongs to IMP-02-T-2, and showing results belongs to IMP-02-T-3.

## Specs

- Add `shared/bookMatch.ts`. It takes candidates as `BookSearchResult` from `shared/books.ts`.
- Add `MATCH_MAX_CANDIDATES` = 5.
- Add `normalizeTitle(title)`: decompose and drop diacritics, lowercase, replace `&` with `and`, replace other punctuation with spaces, collapse whitespace, trim, and drop one leading `the`, `a` or `an`. `"The Hobbit; or, There & Back Again"` becomes `"hobbit or there and back again"`.
- Add `titlesMatch(rowTitle, candidateTitle)`: true when the normalized titles are equal, or when they are equal after cutting each title at its first `:` (so a subtitle on one side only still matches). An empty normalized title never matches.
- Add `authorsMatch(rowAuthor, candidateAuthors)`: `"Last, First"` is read as `"First Last"`. Names are normalized like titles (without dropping articles). True when any candidate author equals the row author, or has the same last word (surname). False when the candidate has no authors.
- Add `matchTitle(row, candidates)` taking `{ title: string; author: string }` and candidates in Open Library's search order. It returns:
  - `{ status: "matched", book }` when the passing candidates all share one first author (normalized). `book` is the first passing candidate.
  - `{ status: "ambiguous", candidates }` when passing candidates have different first authors. `candidates` holds the first passing candidate for each first author, in search order, at most `MATCH_MAX_CANDIDATES`.
  - `{ status: "none" }` when nothing passes.
  - A candidate passes when `titlesMatch` holds and, if the row has an author, `authorsMatch` holds.
- Export the result type as `TitleMatch`.
- Document the lookup order in a comment at the top of the module: a valid `book_key` is used as is; otherwise a row with an ISBN takes the work of the first Open Library result for that ISBN; otherwise (or if the ISBN finds nothing) the title and author search is matched with `matchTitle`.

## Requirements

- Pure functions with no dependencies, no I/O, and no browser or Node APIs, so they run on both sides.
- Do not add endpoints, database tables or UI.

## Acceptance criteria

1. Titles match regardless of case, accents, punctuation, `&`/`and`, a leading article, and a subtitle present on one side only. Different titles don't match.
2. Authors match on the full name or the surname, and `"Last, First"` matches `"First Last"`.
3. A row whose title and author fit one first author is matched to the first such candidate, even when Open Library lists several works by that author.
4. A row without an author whose title fits books by different authors is ambiguous, with one candidate per author, capped at 5.
5. A row with an author that no fitting candidate shares, or a title that fits nothing, has no match.

## Tests

Tested in `shared/bookMatch.test.ts` with Vitest.

| Test name                                             | Setup / Asserts                                                                    | Criterion |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| `IMP-02-T-1 normalizes titles`                        | Case, accents, punctuation, `&` and a leading article give the expected string     | 1         |
| `IMP-02-T-1 matches a title with or without subtitle` | `"Dune"` matches `"Dune: Deluxe Edition"`; `"Dune"` doesn't match `"Dune Messiah"` | 1         |
| `IMP-02-T-1 matches authors by name or surname`       | `"Herbert, Frank"` and `"F. Herbert"` match `["Frank Herbert"]`; `[]` doesn't      | 2         |
| `IMP-02-T-1 matches one author's book`                | Two "Dune" works by Frank Herbert return the first as matched                      | 3         |
| `IMP-02-T-1 reports ambiguous titles`                 | No author, "Emma" by two authors gives two candidates; seven authors give five     | 4         |
| `IMP-02-T-1 reports no match`                         | Wrong author, unrelated title, and an empty candidate list return `none`           | 5         |
