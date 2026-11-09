---
id: SRC-04-T-3
story: SRC-04
sprint: 3
assignee: Jonathan H
estimate_hours: 2
---

# Connect search filters to the UI

## Description

Serves SRC-04 (filter search results to narrow down the books shown). This task connects the existing filter controls to the API from SRC-04-T-2, shows active selections, and supports removing selections or resetting all filters. Creating a new control layout and implementing backend filtering are out of scope.

## Specs

- Connect the controls in `src/pages/SearchPage.tsx` through `searchBooks` in `src/booksApi.ts` to `GET /api/books/search`, sending the submitted query and selected filters.
- Changing a selection updates Grid and List results and the matching total. Show active selections in the existing checkboxes and dropdowns.
- Removing one selection updates results while keeping the query and remaining selections.
- Reset clears all selections and restores unfiltered results for the same query. Disable Reset when no filters are active.
- Show loading, no-results, and error messages while keeping filters usable. Only the latest search can update the displayed results.

## Requirements

- Reuse the existing SRC-04 controls, React components, and CSS conventions. Do not add runtime or test dependencies.
- Use the filter values and API behavior defined by SRC-04-T-2; do not implement backend filtering in this task.
- Preserve search suggestions, book navigation, and personal-library behavior.
- Keep filter controls and Reset keyboard accessible, with labels and visible focus.

## Acceptance criteria

1. Changing filters sends the selected values to the API and updates Grid and List results and the matching total.
2. Active selections remain visible in the controls after results update.
3. Removing one selection updates results without changing the query or remaining selections.
4. Reset clears all filters and restores unfiltered results for the same search query.
5. A search with no matches or an error shows a message and leaves filters usable.

## Tests

The repository has no frontend test runner, so this task is verified with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and manual checks in the running app:

| Test name                             | Setup                                                                                                                        | Asserts                                                                                                      | Criterion |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| Applying filters updates results      | Submit a search, select two genres, a language, and a year; inspect the request in DevTools and switch between List and Grid | Request includes the query and all selected filters; both layouts show the returned books and matching total | 1         |
| Active selections stay visible        | Wait for filtered results, reopen Genres, and inspect the dropdowns                                                          | Selected genres stay checked; language and year selections remain visible                                    | 2         |
| Removing a selection preserves others | Uncheck one selected genre, then choose "Any language" or "Any year"                                                         | Results refresh after each change; query and remaining selections stay intact                                | 3         |
| Reset clears filters                  | With filters active, click Reset                                                                                             | All selections clear; unfiltered results return for the same query; Reset becomes disabled                   | 4         |
| Keyboard use                          | Tab through the controls; use Space to toggle a genre and Enter to activate Reset                                            | Controls work with the keyboard; focus ring is visible                                                       | 4         |
| No matches shows a message            | Choose a query and filters that return no matches                                                                            | "No results." appears; filters remain usable                                                                 | 5         |
| Failed search shows an error          | Stop the API server and change a filter; restart it and change a filter again                                                | An error appears while unavailable; filters stay usable and results return after recovery                    | 5         |
