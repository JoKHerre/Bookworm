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
