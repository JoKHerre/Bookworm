---
id: IMP-01-T-5
story: IMP-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 2
---

# Save imported books to the user's library

## Description

Serves IMP-01 (import a list of books so users do not add them one at a time). This task sends the valid imported rows from IMP-01-T-4 to the server and saves them in the signed-in user's library. Matching titles to Open Library books (IMP-02) is out of scope, so only rows that already carry an Open Library `book_key` can be saved here; rows without one are counted and left for IMP-02. Previewing and editing the import (IMP-03) is also out of scope.

## Specs

- Add `POST /api/library/import` to `server/src/routes/library.ts`, behind the existing `requireAuth`. The body is `{ "bookKeys": string[] }`, validated with Zod and `.strict()`: between 1 and `IMPORT_MAX_ROWS` (500) entries, each matching `openLibraryWorkKey`. Anything else returns 400 `{ "error": "Invalid import" }` and saves nothing.
- Repeated keys in the request are treated as one. The server saves each remaining key for the signed-in user (never a client-supplied user ID) with the default reading status `to_be_read`, in a single insert that skips keys the user already saved.
- A successful call returns 200 `{ "added": number, "alreadySaved": number }`, where `added` is the number of new rows and `alreadySaved` is the number of unique requested keys the user already had. An unauthenticated call returns 401 and saves nothing.
- Other users' libraries are never read or changed. Two users may import the same key.
- Add `importBooks(bookKeys, signal?)` in a new `src/libraryApi.ts` that calls the endpoint and returns `{ added, alreadySaved }`. A 401 throws "Your session has expired. Please sign in again."; any other failure, including a network error, throws "Could not import these books. Please try again."
- In `src/pages/ImportBooksPage.tsx`, after validation:
  - Count the valid rows that have a `book_key` (importable) and the valid rows without one.
  - If any rows lack a key, show "<n> valid books have no book_key and cannot be imported until title matching is available." as plain text (singular: "1 valid book has no book_key and cannot be imported until title matching is available.").
  - Show an "Import <n> books" button (singular "Import 1 book") for the importable rows, disabled when there are none or while the request is running ("Importing…").
  - On success, replace the file result with a `role="status"` message "Imported <added> books. <alreadySaved> already in your library." (singular "Imported 1 book.") and a "Go to My Library" link to `/personal-library`.
  - On failure show the error in a `role="alert"` element and keep the button available to retry.

## Requirements

- Use the existing Express router, Drizzle schema (`saved_books` and its unique `(user_id, book_key)` index), and Zod conventions. Do not add dependencies or change the database schema.
- Never trust the client: the server revalidates every key and takes the user from the session.
- Preserve existing save, remove, reading-status, rating, and import-validation behavior.

## Acceptance criteria

1. `POST /api/library/import` without a session returns 401 and saves nothing.
2. A valid list saves each book for the signed-in user with status `to_be_read` and returns the `added` and `alreadySaved` counts.
3. Books the user already has are not duplicated or changed, repeated keys in one request count once, and two users can import the same key.
4. Invalid bodies (not an object, missing or empty `bookKeys`, more than 500 keys, an invalid key, extra fields such as `userId`) return 400 and save nothing.
5. The import page shows how many valid rows cannot be imported for lack of a `book_key`, and offers "Import <n> books" only for importable rows.
6. Importing shows the added and already-saved counts with a link to My Library; a failed request shows an error and can be retried.

## Tests

Server tests are in `server/backend_tests/libraryImport.test.ts` with `node:test` against the test database; frontend tests are in `src/libraryApi.test.ts` and `src/pages/ImportBooksPage.test.tsx`.

| Test name                                                   | Setup / Asserts                                                           | Criterion |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| `IMP-01-T-5 rejects an unauthenticated import`              | No cookie returns 401 and no row exists for the key                       | 1         |
| `IMP-01-T-5 imports books for the signed-in user`           | Two keys return `added: 2`; rows have the user's ID and `to_be_read`      | 2         |
| `IMP-01-T-5 skips books already in the library`             | One key saved first; the import returns `added: 1, alreadySaved: 1`       | 3         |
| `IMP-01-T-5 counts repeated keys once`                      | The same key twice returns `added: 1` and one row                         | 3         |
| `IMP-01-T-5 allows different users to import the same book` | Two users import one key; each has a row                                  | 3         |
| `IMP-01-T-5 rejects invalid bodies and saves nothing`       | Bad shapes, empty list, 501 keys, a bad key among good ones, extra fields | 4         |
| `IMP-01-T-5 does not accept a client-supplied user ID`      | Body with `userId` returns 400 and saves nothing                          | 4         |
| `IMP-01-T-5 importBooks posts the keys`                     | Success returns the counts and sends the keys as JSON                     | 6         |
| `IMP-01-T-5 importBooks maps failures`                      | 401, 500, and a network error return their messages                       | 6         |
| `IMP-01-T-5 page counts rows without a book key`            | Valid rows lacking `book_key` show the cannot-import message              | 5         |
| `IMP-01-T-5 page offers import for rows with a book key`    | Button reads "Import 2 books" and is absent when no row has a key         | 5         |
| `IMP-01-T-5 page imports and shows the result`              | Click import; the request is sent and the counts and link are shown       | 6         |
| `IMP-01-T-5 page shows an import error and can retry`       | A failed request shows the alert; a second click succeeds                 | 6         |
