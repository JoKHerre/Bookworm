---
id: IMP-01-T-2
story: IMP-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 1
---

# Add file selection and upload UI for book imports

## Description

Serves IMP-01 (import a list of books so users do not add them one at a time). This task adds an Import books page where a signed-in user chooses a CSV file, sees it checked against the rules from IMP-01-T-1, and reads it into the browser. Parsing rows (IMP-01-T-3), validating them (IMP-01-T-4), and saving them to the library (IMP-01-T-5) are out of scope.

## Specs

- Add `src/pages/ImportBooksPage.tsx` and `ImportBooksPage.css`, and register the route `/import` in `src/App.tsx` inside the existing `RequireAuth` group, so signed-out visitors are sent to the login page.
- In `src/pages/PersonalLibraryPage.tsx`, add an "Import books" link to `/import` beside the "My Library" heading.
- The page has an `h1` "Import books", a short description of the format, and a labelled file input "Choose a CSV file" that only offers `.csv` files (`accept=".csv"`).
- When a file is chosen, run `checkImportFile` from `shared/bookImport.ts` on it:
  - If it fails, show the error in an element with `role="alert"` and keep "Upload" disabled.
  - If it passes, show the file's name and size (for example "books.csv (2 KB)") and enable "Upload".
- Choosing another file, or cancelling the picker so no file is selected, replaces the previous result and clears any error.
- Clicking "Upload" reads the file text in the browser (no network request is sent). While reading, the button is disabled and shows "Reading…". When done, a `role="status"` message says `<name> is ready to import.` and the file text is kept in component state for IMP-01-T-3.
- If reading fails, show "Could not read this file. Please try again." in a `role="alert"` element and let the user try again.

## Requirements

- Use the existing page, CSS variables, and routing conventions. The file input, "Upload" button, and messages must be keyboard accessible with visible labels and focus rings.
- Do not add dependencies, API endpoints, or database tables, and do not send the file anywhere.
- Preserve existing library, search, and auth behavior.

## Acceptance criteria

1. A signed-out visit to `/import` redirects to the login page; a signed-in visit shows the Import books page.
2. The My Library page links to `/import`.
3. Choosing an unsupported, empty, or oversized file shows the matching error from `checkImportFile` and leaves "Upload" disabled.
4. Choosing a valid `.csv` file shows its name and size and enables "Upload".
5. Choosing a different file or clearing the selection replaces the previous result and error.
6. Clicking "Upload" reads the file and shows `<name> is ready to import.`; a failed read shows the error and allows another attempt.

## Tests

Frontend tests run with Vitest and Testing Library in `src/pages/ImportBooksPage.test.tsx`, `src/App.test.tsx`, and `src/pages/PersonalLibraryPage.test.tsx`.

| Test name                                              | Setup / Asserts                                                      | Criterion |
| ------------------------------------------------------ | -------------------------------------------------------------------- | --------- |
| `IMP-01-T-2 signed-out import page redirects`          | Visit `/import` signed out; the login form is shown                  | 1         |
| `IMP-01-T-2 signed-in user reaches the import page`    | Visit `/import` signed in; the "Import books" heading is shown       | 1         |
| `IMP-01-T-2 library links to the import page`          | The My Library page has an "Import books" link to `/import`          | 2         |
| `IMP-01-T-2 rejects an unsupported file type`          | Choose `books.txt`; alert shown and "Upload" disabled                | 3         |
| `IMP-01-T-2 rejects an empty file`                     | Choose an empty `.csv`; alert shown and "Upload" disabled            | 3         |
| `IMP-01-T-2 rejects an oversized file`                 | Choose a `.csv` over 1 MB; alert shown and "Upload" disabled         | 3         |
| `IMP-01-T-2 accepts a csv file`                        | Choose `books.csv`; name and size shown, "Upload" enabled            | 4         |
| `IMP-01-T-2 choosing another file replaces the result` | Choose a bad file then a good one; the error disappears              | 5         |
| `IMP-01-T-2 clearing the selection resets the page`    | Choose a file, then clear the input; "Upload" disabled, no message   | 5         |
| `IMP-01-T-2 upload reads the file`                     | Click "Upload"; "books.csv is ready to import." shown, no fetch made | 6         |
| `IMP-01-T-2 failed read shows an error and can retry`  | A rejecting `text()` shows the alert; a second click succeeds        | 6         |
