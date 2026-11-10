---
id: COL-06-T-1
story: COL-06
sprint: 3
assignee: Natalie Marks
estimate_hours: 0.5
---

# Derive automatic book tags from Open Library subjects

## Description

Serves COL-06 (books have automatic tags so users can organize them easily). This task turns the subjects Open Library already returns for a work into a clean list of tags on the book details API. Showing tags on the book details page and filtering the personal library by tag belong to COL-06-T-2, COL-06-T-3, and COL-06-T-4 and are out of scope.

## Specs

- Add a `tags` array of strings to the response of `GET /api/books/details`, derived from the `subjects` of the Open Library work. `subjects` stays in the response unchanged.
- Add `toTags(subjects)` in `shared/tags.ts`. It trims each subject, collapses internal whitespace, and lowercases it.
- Drop subjects that are empty, longer than 40 characters, or contain a `:` (Open Library machine tags such as `nyt:hardcover-fiction=2020-01-01`).
- Remove duplicates that differ only by case or spacing, keeping the first occurrence and Open Library's order.
- Return at most 10 tags. A work with no `subjects` returns `tags: []`.
- Open Library failures keep their existing responses (404 `Book not found`, 502 `Unable to retrieve book details`).

## Requirements

- Use the existing books router, Open Library service, and Zod schemas in `shared/books.ts`.
- Do not add dependencies, database tables, or authentication requirements.
- Preserve search, suggestions, ISBN lookup, availability, and personal-library behavior.

## Acceptance criteria

1. `toTags` trims, collapses whitespace, and lowercases subjects.
2. `toTags` drops empty, overlong, and colon-containing subjects and removes case-insensitive duplicates while keeping order.
3. `toTags` returns at most 10 tags and an empty array for missing or empty subjects.
4. `GET /api/books/details` returns `tags` derived from the work's subjects alongside the unchanged `subjects`.
5. A work without subjects returns `tags: []`; Open Library failures keep their existing status codes.

## Tests

Test file: `server/backend_tests/bookTags.test.ts`, using `node:test` and `node:assert/strict` with a stubbed `fetch` for Open Library.

| Test name                                                  | Asserts                                                                         | Criterion |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| `COL-06-T-1 normalizes subjects into lowercase tags`       | Whitespace is trimmed and collapsed and case is lowered                         | 1         |
| `COL-06-T-1 drops unusable subjects and duplicates`        | Empty, overlong, and colon subjects are removed; duplicates removed; order kept | 2         |
| `COL-06-T-1 limits tags to ten`                            | Twelve valid subjects produce the first ten tags                                | 3         |
| `COL-06-T-1 returns no tags without subjects`              | `undefined` and `[]` both return `[]`                                           | 3         |
| `COL-06-T-1 book details include tags from subjects`       | The route returns `tags` and the original `subjects`                            | 4         |
| `COL-06-T-1 book details without subjects have empty tags` | The route returns `tags: []`                                                    | 5         |
| `COL-06-T-1 book details keep upstream error responses`    | Upstream 404 returns 404 and an upstream 500 returns 502                        | 5         |
