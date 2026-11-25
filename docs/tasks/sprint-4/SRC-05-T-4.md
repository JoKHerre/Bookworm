---
id: SRC-05-T-4
story: SRC-05
sprint: 4
assignee: Jonathan H
estimate_hours: 2
---

# Add genre and content warning exclusion controls

## Description

Connect the existing search page to task 3's exclusion API.

## Specs

- Add separate genre and content warning exclusion selectors using the existing shared choices and `excludeGenre` and `excludeWarning` parameters.
- Show removable exclusion chips. Clear all clears exclusions along with the existing filters. Filter changes reset pagination.
- Keep exclusions in the search URL. Restore them on reload and Back, retain them for new queries and Show more, and ignore unsupported URL values.
- Preserve existing filters, suggestions, filtered counts, pagination, and warning-status messaging.

## Requirements

- Reuse the existing search page, styles, URL handling, and API wrapper. Add no dependencies, backend changes, or database changes.
- Use labeled, keyboard-accessible controls. Clearly distinguish included genres from excluded genres and warnings.

## Acceptance criteria

1. Users can select multiple excluded genres and warning categories, and searches receive those selections.
2. Removing a chip keeps the other filters; Clear all clears every filter. Filter changes restart pagination.
3. Valid exclusions survive reload, Back, new queries, and Show more; unsupported URL values are ignored.
4. Existing search behavior, count messaging, unknown warning information, and empty-page continuation remain correct.

## Tests

| Test name                                                               | Setup                                                                                       | Asserts                                                                                                         | Criterion |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| SRC-05-T-4 selects and clears exclusions while preserving other filters | Existing filters and a later page; select genres and warnings, remove chips, then clear all | Both exclusions reach search; other filters stay; pagination resets; controls and chips clear                   | 1, 2, 4   |
| SRC-05-T-4 restores valid exclusions from the URL                       | Included genres and both exclusions, repeated values, and unsupported values                | Valid selections restored once; chips distinguish inclusion, exclusion, and warning labels                      | 1, 3      |
| SRC-05-T-4 retains exclusions through pagination, new queries, and Back | Both exclusions; empty first page and unchecked book on the next page; new query, then Back | Selections and pages restored; typing does not search; filtered counts, status, and continuation remain correct | 3, 4      |
