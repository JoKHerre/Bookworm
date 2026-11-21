---
id: SRC-05-T-2
story: SRC-05
sprint: 4
assignee: Jonathan H
estimate_hours: 1
---

# Add filtering logic for excluding trigger warnings

## Description

Serves SRC-05. Add warning and genre exclusion rules for search to use in task 3. Builds on SRC-05-T-1; endpoint parameters and UI controls belong to later tasks.

## Specs

- Add a small function using the shared warning IDs and response type. Exclude a book when any selected ID matches its `categoryIds`. An empty selection keeps every book. Selection order and duplicates do not affect the result.
- Keep books with `not_found` or `unavailable` warning information and preserve their status; do not describe them as having no warnings. Keep parsing and network requests outside this function.
- Extend internal Open Library query construction to support excluded genres, reusing the existing genre choices and subject mapping. Apply every exclusion outside the included-genre OR group; an exclusion takes precedence when the same genre is also included.
- Preserve existing query escaping, language/year filters, and pagination. Do not add public search parameters or change existing search behavior in this task.

## Requirements

- Reuse existing types and conventions. Add no dependencies, scraping changes, database changes, or UI.
- Keep genre exclusions separate from warning exclusions.

## Acceptance criteria

1. Any selected matching warning ID excludes the book; empty selections and nonmatching IDs keep it. Order and duplicates make no difference.
2. Missing or unavailable warning information keeps the book with its status unchanged.
3. Genre exclusions use valid Open Library syntax, apply together, and take precedence over included genres without changing other search constraints or pagination.
4. Existing searches behave as before; no warning requests or new public parameters are introduced.
