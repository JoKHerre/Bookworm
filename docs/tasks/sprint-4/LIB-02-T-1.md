---
id: LIB-02-T-1
story: LIB-02
sprint: 4
assignee: Jonathan Villalobos
estimate_hours: 2
---
# Set a Prefered, Default Library Branch at SCPL

## Description
Users can choose a preferred branch within the SCPL system from a dropdown in the header bar. The choice persists across pages and reloads in the same browser. On a book's details page alongside the cover and title, availability for the preferred branch is dependent on the existing Polaris library ISBN search which fetches availability information. If no ISBN match is found at the SCPL, this section will also fail even if a match is found in the E/Book Title Search on bottom of page.

## Specs
Allows the user to filter between all 10 recognized branches in the SCPL system:
    "Aptos", "Boulder Creek", "Branciforte", "Capitola", "Downtown", "Felton", "Garfield Park", "La Selva Beach", "Live Oak", "Scotts Valley"
    - Only filters by physical branches, not the SCPL "Outreach" library van that may appear in full branches
- A generic "All Branches" default option exists in the dropdown, which ommits that section on the books detail page
- Branch list is defined in `shared/branches.ts`.
- The selection is stored in `localStorage` through the `useHomeBranch` hook, so the header and details page stay in sync

## Requirements

- Change `src/components/Header.tsx`, `src/library/useHomeBranch.ts`, `src/pages/BookDetailsPage.tsx`, and adding `shared/branches.ts`. Reading  the selected branch from the one shared hook instead of duplicating logic
- No API or DB changes needed
- Preserve the full Library Availability list, ISBN search, and E/Book title search sections

## Acceptance Criteria

1. The header shows the branch dropdown and remains persistent on home/search/book details pages
2. Selecting a branch updates the branch specific output immediately, with no refetch
3. The selection persists across navigation and page reloads in the same browser
4. With a branch selected, the details page shows the chosen branch output with one of the following:
    - X of Y available
    - Not held at this branch
    - No physical copies
    - Checking
    - Couldn’t check availability
    - Couldn’t finish checking availability
    - Not found in the library catalog
5. With all branches selected, the details page omits the branch specific output