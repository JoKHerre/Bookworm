---
id: REF-01-T-1
story: REF-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 2
---

# Remove unused files, exports, and narration comments

## Description

Serves REF-01 (keep the codebase maintainable as features land). A review of the project at the end of sprint 3 found files left over from the Vite scaffold, a stray npm lockfile, a test route, exports and settings nothing uses, and comments that restate each line of code. This task removes them without changing any behavior. REF-01-T-2 fixes the structural problems from the same review.

## Specs

### Files and routes

- Delete `package-lock.json`. The repo uses pnpm, and the README says not to commit npm or Yarn lockfiles.
- Delete the unused scaffold assets `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, and `public/icons.svg`. `public/favicon.svg` stays.
- Delete the `GET /api/test` route from `server/src/index.ts`. `GET /api/health` stays.

### Exports

- Delete `filterByTag` from `shared/tags.ts`. The library page uses `filterByTags`, which gives the same result for a single tag.
- Delete the unused types `BookSuggestionsQuery` and `BookDetailsQuery` from `shared/books.ts` and `SaveRatingBody` from `shared/ratings.ts`.
- Replace the `booksError` and `publicUser` Zod schemas, which nothing parses with, by plain `BooksError` and `PublicUser` interfaces with the same shape.

### Configuration

- Remove `sourceMap`, `declaration`, and `declarationMap` from `server/tsconfig.json`, which have no effect with `noEmit`, along with its commented-out boilerplate.
- Remove the empty `description`, `keywords`, and `author` fields from `server/package.json`, and its `"license": "ISC"`, which contradicts the repository's `LICENSE`.
- Rename the scaffold's `<title>frontend</title>` in `index.html` and the root `package.json` name `frontend` to `Bookworm` and `bookworm`.
- Remove the commented-out color in `src/App.css`.
- Add `.claude` to ESLint's global ignores in `eslint.config.js`. The folder is gitignored, but ESLint linted local files in it, such as leftover worktrees, and failed `pnpm lint`.

### Comments

- Remove line-by-line narration comments, such as `// return success code`, from `server/src/routes/library.ts`, `src/pages/PersonalLibraryPage.tsx`, and `server/backend_tests/schema.test.ts`.
- Keep comments that explain behavior the code doesn't show: each route's method and path, why a request is rejected, optimistic updates and rollbacks, optional ratings, ignored stale tags, and the PostgreSQL error code each schema test expects.

## Requirements

- Change no behavior: every endpoint, response, page, and message stays the same.
- Add no dependencies, database schema changes, or new files other than this spec.
- Change existing tests only to drop references to deleted code. The `COL-06-T-3` single-tag test uses `filterByTags` with one tag; its empty-tag and missing-details cases are already covered by the `COL-06-T-4` tests.

## Acceptance criteria

1. The deleted files, route, exports, and settings are gone, and nothing in the repository references them.
2. The page title and root package name are `Bookworm` and `bookworm`.
3. The edited files no longer narrate individual lines, and comments explaining non-obvious behavior remain.
4. `pnpm lint` passes even when the local `.claude` folder contains other projects' files.
5. All existing tests and the project checks pass.

## Tests

No new tests. This task deletes code and changes no behavior, so the existing suites cover it. Run `pnpm --dir server db:push` against `bookworm_test` before the backend suite.

| Test name                              | Setup                                                                      | Asserts                                                                          | Criteria   |
| -------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `COL-06-T-3 filters books by one tag`  | Filter the fixture library by `["magic"]` with `filterByTags`              | Only the two books tagged `magic` remain                                         | 1          |
| Existing `COL-06-T-4` tag filter tests | Filter by an empty selection and by tags absent from books without details | Every book is kept for an empty selection, and books without details never match | 1          |
| Existing backend and frontend suites   | Run `pnpm --dir server test` and `pnpm test`                               | All tests pass                                                                   | 1, 5       |
| Project checks                         | Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm build`   | All succeed, including lint with files present under `.claude`                   | 1, 2, 4, 5 |
| Comment review                         | Read the three edited files                                                | No line-by-line narration remains; explanatory comments are intact               | 3          |
