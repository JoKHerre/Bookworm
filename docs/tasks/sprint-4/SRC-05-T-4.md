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
