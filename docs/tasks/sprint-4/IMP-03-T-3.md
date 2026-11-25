---
id: IMP-03-T-3
story: IMP-03
sprint: 4
assignee: Natalie Marks
estimate_hours: 1
---

# Confirm import and display results

## Description

Serves IMP-03 (review imported books to make sure they were imported correctly). After the user confirms the books from the preview (IMP-03-T-1, IMP-03-T-2), this task shows which books were added and which were already in their library, by title, so they can check the result instead of reading two counts.

## Specs

- `POST /api/library/import` returns `{ added: string[], alreadySaved: string[] }`: the keys that were saved and the keys the user already had, each once and in request order. `ImportBooksResponse` in `shared/library.ts` and the IMP-01-T-5 tests change to match.
- `importBooks` in `src/api/library.ts` checks that both fields are arrays of strings, and otherwise throws "Could not import these books." as before.
- In `src/pages/ImportBooksPage.tsx`, the status line keeps its wording, using the lengths: "Imported <n> books. <m> already in your library."
- Below it, an "Added" section and an "Already in your library" section list their books, each shown only when it has books. Each item is a link to the book's page (`bookDetailsPath`), labeled like the preview (title, authors, year), using the book the page matched, picked or chose for that key, and Open Library's book over a `book_key` row's. A list longer than 10 books shows the first 10 and a "Show all <n>" button, which then reads "Show fewer". "Go to My Library" stays below the lists.

## Requirements

- Use the existing import page styles and palette tokens. Add no dependencies.
- Keep the import error and retry from IMP-01-T-5.

## Acceptance criteria

1. The import endpoint reports which keys were added and which were already saved.
2. After importing, the page lists added books and books already in the library by title, linked to their pages.
3. The counts in the status line match the lists.

## Tests

The endpoint is tested in `server/backend_tests/libraryImport.test.ts`, the client in `src/api/library.test.ts`, and the page in `src/pages/ImportBooksPage.test.tsx` with Testing Library.

| Test name                                                     | Setup / Asserts                                                                         | Criterion |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| `IMP-03-T-3 returns added and already saved keys`             | A saved and a new key, with a repeat, come back split and in request order              | 1         |
| `IMP-03-T-3 importBooks rejects a response without key lists` | Counts instead of arrays throw the import error                                         | 1         |
| `IMP-03-T-3 lists the imported books`                         | Added and already saved books are listed under their headings with links to their pages | 2, 3      |
| `IMP-03-T-3 labels picked and chosen books`                   | A picked ambiguous book and a chosen search result are labeled with their books         | 2         |
| `IMP-03-T-3 shows a long result list in part`                 | 12 added books show 10 until "Show all 12", and 10 again after "Show fewer"             | 2         |
| `IMP-03-T-3 hides an empty result list`                       | With nothing already saved, only "Added" is shown                                       | 2         |
