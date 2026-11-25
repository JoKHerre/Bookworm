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

## Tests

| Test name                                                                         | Setup                                                                                    | Asserts                                                                                                          | Criterion |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| SRC-05-T-3 frontend exclusion serialization tests                                 | Both exclusions with existing filters, or omitted/empty exclusions                       | Repeated parameters, filters, and page preserved; empty exclusions omitted with caller signal retained           | 1, 5      |
| SRC-05-T-3 applies genre exclusions with existing filters and no warning requests | Repeated exclusions, duplicates, an included/excluded conflict, language, year, and page | Correct genre constraints; one search request; upstream total preserved; no warning/detail calls                 | 2, 4, 5   |
| SRC-05-T-3 normalizes single and blank genre exclusions                           | Single, omitted, blank, and mixed selections; empty upstream results                     | Same normalization as included genres; empty pages returned without replacement requests                         | 1, 4      |
| SRC-05-T-3 rejects invalid genre exclusions without upstream requests             | Unknown genres alone or with valid genres                                                | 400 with an API error and zero upstream calls                                                                    | 1         |
| SRC-05-T-3 rejects invalid warning exclusions without upstream calls              | Unknown warning IDs alone or with valid IDs                                              | 400 with an API error and zero upstream calls                                                                    | 1         |
| SRC-05-T-3 combines exclusions using cached search metadata                       | Genre and warning exclusions; repeat a search using existing fixtures                    | Any selected matching category excludes; other books keep their status; cache reused without detail/author calls | 2         |
| SRC-05-T-3 keeps missing and unavailable warning information with its status      | Missing source entry, source failure, and missing authors                                | Books remain in order with their warning status                                                                  | 3         |
| SRC-05-T-3 lookup limit and cancellation tests                                    | Stalled source requests; disconnect during search or warning lookup                      | Work stays bounded; unfinished books remain identifiable; pending requests abort                                 | 3         |
| SRC-05-T-3 filtered pagination and count tests                                    | Empty filtered pages, page limit, and restored pages                                     | One upstream page per request; continuation follows upstream pages; counts and unchecked status remain accurate  | 3, 4      |
| SRC-05-T-3 live check (manual)                                              | Live Gatsby search and warning lookup, then alcohol exclusion using the cached result    | Matching books removed; unknown books kept; one upstream page; total marked inexact; continuation preserved      | 2, 3, 4   |

Live verification also retrieved warnings for Before the Coffee Gets Cold using its English title. Open Library returned its Japanese title, which cannot match the English warning entry. Matching translated titles remains a limitation of the existing lookup. Note that this limitation is also present in the public library cataloging implementation, and should be reviewed as well.
