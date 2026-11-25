---
id: SRC-05-T-3
story: SRC-05
sprint: 4
assignee: Jonathan H
estimate_hours: 2
---

# Extend search API to exclude genres and content warnings

## Description

Extend submitted searches using the exclusion support from tasks 1 and 2. New filter controls and their navigation behavior belong to task 4.

## Specs

- Add `excludeGenre` and `excludeWarning` options to the search API and frontend wrapper. Omitted or empty selections exclude nothing; invalid values return 400.
- Apply genre exclusions before warning checks. Remove books matching any selected warning category using existing search metadata. Skip warning checks when no warning exclusions are selected.
- Keep books with unknown or unfinished warning information and preserve their status. Bound lookup work and support cancellation.
- Preserve upstream pagination without fetching replacement pages. Allow continuation after empty filtered pages and distinguish upstream totals from filtered counts.

## Requirements

- Reuse existing schemas, filtering rules, services, and caching. Preserve current filters and keep warning requests confined to submitted searches with warning exclusions.
- Add no dependencies, database changes, or new filtering UI.

## Acceptance criteria

1. Exclusion options validate and serialize correctly.
2. Genre and warning exclusions work separately and together, without unnecessary warning or detail requests.
3. Unknown or unchecked books remain identifiable when lookups fail or reach their limit; cancellation stops pending work.
4. Existing pagination behavior is preserved, with correct counts and continuation after empty filtered pages.
5. Existing filters, suggestions, and other consumers remain compatible.
