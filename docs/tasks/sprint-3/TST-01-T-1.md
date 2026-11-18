---
id: TST-01-T-1
story: TST-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 3
---

# Add a frontend test runner, first frontend tests, and a CI job

## Description

Supports every user story in the app (TST-01: frontend behavior is covered by automated tests that run in CI). The frontend has no test runner today; only `server/backend_tests` run in CI, so tag filtering, ratings, auth forms, and routing are verified by hand. This task adds the runner and a CI job, and covers existing frontend code. It is the base branch for later sprint 3 work, which adds its own frontend tests on top of it. Changing app behavior, end-to-end browser tests, and snapshot tests are out of scope.

## Specs

- Add Vitest, jsdom, `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom` as dev dependencies of the root `package.json`.
- Add `pnpm test` (`vitest run`) to the root `package.json`, and a `test` block in `vite.config.js` using the `jsdom` environment, `globals: false`, and `src/test/setup.ts` as the setup file. The setup file registers the jest-dom matchers and unmounts rendered components after each test.
- Add `src/test/renderWithProviders.tsx`, exporting `renderWithProviders(ui, { route, user })`. It renders `ui` inside a `MemoryRouter` at `route` and an `AuthContext` whose `user` defaults to `null` and whose `login`, `register`, and `logout` are `vi.fn()` mocks.
- Add test files next to the code under `src/` named `<module>.test.ts(x)` covering: `StarRating`, `StarDisplay`, `BookCard`, `Header`, `AuthForm`, `App` route guards, `ratingsApi`, `booksApi`, and `PersonalLibraryPage` (loading, error, empty library, reading status, removal, rating display, tag filtering), `SearchPage` (search, filters, layout, suggestions), `BookDetailsPage` (details, saving, rating, library availability), `BookISBNSection`, `AuthProvider`, and the `Header` login redirect. `fetch` is replaced with `vi.fn()`; no test uses the network or the database.
- Add a `frontend-test` job to `.github/workflows/ci.yml` that installs the frontend dependencies and runs `pnpm test`, on the same triggers as the existing jobs.
- Exclude `src/**/*.test.{ts,tsx}` and `src/test` from the production `pnpm build` output and keep them type-checked by `pnpm typecheck`.

## Requirements

- Do not change application behavior or add production dependencies; only dev dependencies, config, and tests.
- Tests query by role, label, and text (as a user would), not by CSS class.
- Each test name starts with `TST-01-T-1`. Every test is deterministic and independent of other tests.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass locally and in CI.

## Acceptance criteria

1. `pnpm test` runs the frontend tests with Vitest in a jsdom environment and exits non-zero when a test fails.
2. `renderWithProviders` renders a component with router and auth context, and its auth mocks are observable.
3. Component tests verify `StarRating` (selection, `onChange`, disabled), `StarDisplay`, and `BookCard` (labels, click, cover fallback).
4. `Header` shows "Log In" when signed out and "Log Out" when signed in, and logging out calls `logout`.
5. `AuthForm` submits the entered credentials in login and register modes, shows server errors, and links between the two modes.
6. `App` redirects a signed-out visit to `/personal-library` to the login page and a signed-in visit to `/login` away from it.
7. `ratingsApi` and `booksApi` map HTTP and network failures to the documented error messages.
8. `PersonalLibraryPage` tests verify loading, error with "Try again", empty library, reading-status update, book removal, rating display, and the COL-06-T-4 tag-filter behavior (narrowing, "Clear tags", "No books match these tags.", dropped tags).
9. `SearchPage`, `BookDetailsPage`, `BookISBNSection`, `AuthProvider`, and the `Header` login redirect are covered by tests of their loading, success, error, and retry behavior.
10. CI runs the frontend tests in a `frontend-test` job on pushes to `main` and on pull requests.

## Tests

| Test name                                                            | Setup / Asserts                                                     | Criterion |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| `TST-01-T-1 render helper provides auth`                             | Render a consumer of `useAuth`; it sees the supplied user and mocks | 2         |
| `TST-01-T-1 star rating selects a star`                              | Click "4 stars"; `onChange` called with 4                           | 3         |
| `TST-01-T-1 star rating reflects its value`                          | `value=3` checks "3 stars"; `null` checks none                      | 3         |
| `TST-01-T-1 star rating can be disabled`                             | `disabled` disables every radio                                     | 3         |
| `TST-01-T-1 star display describes rating`                           | `rating=4` has label "Rated 4 out of 5 stars"                       | 3         |
| `TST-01-T-1 book card labels and clicks`                             | Button label has title and authors; click calls `onClick`           | 3         |
| `TST-01-T-1 book card without a cover`                               | No `cover_i` renders no image and "Unknown author" when no authors  | 3         |
| `TST-01-T-1 header when signed out`                                  | "Log In" link is shown, "Log Out" is absent                         | 4         |
| `TST-01-T-1 header when signed in`                                   | "Log Out" calls `logout`                                            | 4         |
| `TST-01-T-1 login form submits credentials`                          | Fill email and password, submit; `login` called with both           | 5         |
| `TST-01-T-1 register form submits`                                   | Register mode calls `register`                                      | 5         |
| `TST-01-T-1 auth form shows server error`                            | Rejected `login` shows the message in an alert                      | 5         |
| `TST-01-T-1 auth form switches modes`                                | "Need an account?" navigates to the sign-up form                    | 5         |
| `TST-01-T-1 signed-out library redirects`                            | Visit `/personal-library` signed out; the login form is shown       | 6         |
| `TST-01-T-1 signed-in login redirects`                               | Visit `/login` signed in; the login form is not shown               | 6         |
| `TST-01-T-1 signed-in user reaches the library`                      | Visit `/personal-library` signed in; the library page is shown      | 6         |
| `TST-01-T-1 saveRating sends a PUT`                                  | Success returns the body and sends `bookKey` and `rating`           | 7         |
| `TST-01-T-1 saveRating maps failures`                                | 401, server error, and network failure give their messages          | 7         |
| `TST-01-T-1 getRatings returns ratings`                              | Returns the `ratings` array; a non-OK response throws               | 7         |
| `TST-01-T-1 searchBooks builds its query`                            | Genre, language, and year become query parameters                   | 7         |
| `TST-01-T-1 books api maps failures`                                 | Non-OK, invalid JSON, and network failure give their messages       | 7         |
| `TST-01-T-1 library shows saved books`                               | Loading text, then books with title and reading status              | 8         |
| `TST-01-T-1 library shows load error`                                | Failed fetch shows an error; "Try again" reloads                    | 8         |
| `TST-01-T-1 library empty state`                                     | Empty list shows the empty message                                  | 8         |
| `TST-01-T-1 library updates reading status`                          | Change the select; PATCH sent with the new status                   | 8         |
| `TST-01-T-1 library removes a book`                                  | Click Remove; DELETE sent and the book disappears                   | 8         |
| `TST-01-T-1 library shows ratings`                                   | A rated book shows its star display                                 | 8         |
| `TST-01-T-1 library tags narrow the list`                            | Check two tags, then uncheck one                                    | 8         |
| `TST-01-T-1 library clear tags`                                      | "Clear tags" restores the list and becomes disabled                 | 8         |
| `TST-01-T-1 library no tag match message`                            | Tags with no common book show "No books match these tags."          | 8         |
| `TST-01-T-1 library drops removed tags`                              | Remove the only book with a selected tag; the tag disappears        | 8         |
| `TST-01-T-1 search page shows nothing before a search`               | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page lists results for a query`                   | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page searches the query in the URL`               | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page says when nothing matches`                   | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page shows a search error`                        | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page applies and resets filters`                  | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page switches between list and grid`              | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page opens a result's details`                    | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page suggests books while typing`                 | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page picks a suggestion with the keyboard`        | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page closes suggestions on escape`                | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 search page does not suggest for short input`            | See `SearchPage.test.tsx`                                           | 9         |
| `TST-01-T-1 details page shows the book`                             | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page handles a missing summary and tags`         | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page reads a summary object`                     | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page shows a load error`                         | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page uses the search result it came from`        | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page goes back to search without history`        | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page asks signed-out users to log in`            | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page save responds to status %i`                 | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page save reports a network failure`             | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page shows the existing rating`                  | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page saves a new rating`                         | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page rolls back a failed rating`                 | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page shows branch availability`                  | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page explains a catalog record without branches` | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page explains a missing catalog match`           | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page explains a book without ISBNs`              | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page retries a timed-out availability check`     | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 details page shows an availability error`                | See `BookDetailsPage.test.tsx`                                      | 9         |
| `TST-01-T-1 isbns are not loaded until opened`                       | See `BookISBNSection.test.tsx`                                      | 9         |
| `TST-01-T-1 isbns load and are grouped when opened`                  | See `BookISBNSection.test.tsx`                                      | 9         |
| `TST-01-T-1 isbn filters reload the first page`                      | See `BookISBNSection.test.tsx`                                      | 9         |
| `TST-01-T-1 isbns load more pages and merge duplicates`              | See `BookISBNSection.test.tsx`                                      | 9         |
| `TST-01-T-1 isbns show an error and can retry`                       | See `BookISBNSection.test.tsx`                                      | 9         |
| `TST-01-T-1 isbns explain when none match`                           | See `BookISBNSection.test.tsx`                                      | 9         |
| `TST-01-T-1 auth provider restores the signed-in user`               | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 auth provider is signed out without a session`           | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 auth provider is signed out when the check fails`        | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 auth provider logs in and out`                           | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 auth provider registers a user`                          | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 auth provider surfaces login errors`                     | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 useAuth requires a provider`                             | See `AuthContext.test.tsx`                                          | 9         |
| `TST-01-T-1 header remembers the page to return to after login`      | See `HeaderLogin.test.tsx`                                          | 9         |
| `TST-01-T-1 header marks the current page`                           | See `HeaderLogin.test.tsx`                                          | 9         |
| CI runs frontend tests (manual)                                      | The `frontend-test` job appears and passes on the pull request      | 9         |
