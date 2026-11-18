---
id: REF-01-T-3
story: REF-01
sprint: 3
assignee: Natalie Marks
estimate_hours: 3
---

# Fix the project layout found in the sprint 3 review

## Description

Serves REF-01 (keep the codebase maintainable as features land). Builds on REF-01-T-1 and REF-01-T-2. The sprint 3 review found that the frontend and backend were separate pnpm projects, that some modules sat far from the code that uses them, that tests for shared code ran in the database-backed backend suite, that route files followed different conventions, and that the header linked to a page that doesn't exist. This task fixes the layout. Apart from the header links, users see no change.

## Specs

### Header links

- Remove the Account link, which pointed to `/account`. No route exists for it, so the catch-all sent users home.
- Remove the Home link. It went to `/`, which redirects to `/search`, the same page as Discover. The Bookworm logo still links home.

### Module locations

- Move `AuthContext.tsx`, `useAuth.ts`, and `AuthContext.test.tsx` from the top of `src/` into `src/auth/`. `src/routes.ts` stays where it is because it holds routing helpers, not auth.
- Move `shared/openLibrary.ts` to `server/src/services/openLibrarySchemas.ts`. It describes Open Library's upstream responses and only the server uses it.

### Route conventions

- Library and ratings routers apply `requireAuth` once with `router.use`, as the collections router already did, instead of on each route. An unauthenticated request to an unknown path under `/api/library` or `/api/ratings` now gets `401` instead of `404`, as `/api/collections` already did.
- Strict request schemas use `z.strictObject` everywhere instead of `z.object(...).strict()`.
- Rename `server/src/services/searchlibrary.ts` to `libraryCatalog.ts`, matching the camelCase names of the other modules and saying what it searches.

### Tests for shared code

- Move the tests for pure `shared/` modules out of `server/backend_tests/` and next to their modules: `shared/bookImport.test.ts`, `shared/csvImport.test.ts`, `shared/tags.test.ts` (from `libraryTags.test.ts`), and `shared/isbn.test.ts`.
- Run them with Vitest through `pnpm test`, converting `node:assert` calls to `expect`. Add `shared/**/*.test.ts` to Vitest's `include` and `shared` to the root `tsconfig.json` so they are type-checked.
- Keep all 43 tests and their names.

### pnpm workspace

- Add a root `pnpm-workspace.yaml` listing `server`, and merge `server/pnpm-lock.yaml` into the root `pnpm-lock.yaml`. A single `pnpm install` at the root installs both packages.
- Move the `packageManager` pin, the `devEngines` pnpm requirement, and the `esbuild` build allowlist from `server/` to the root.
- In CI, install once per job with `pnpm install --frozen-lockfile`, cache on `pnpm-lock.yaml`, and let `pnpm/action-setup` read pnpm's version from `packageManager`.
- Update the README to say the repo is a workspace and to drop the separate server install.
- `shared/` stays a folder imported by relative path, not a workspace package.

## Requirements

- Keep every endpoint, response, page, and message the same, except for the header links and the `401` for unknown unauthenticated paths described above.
- Add no dependencies and no database schema changes. Resolved versions of direct dependencies stay the same, apart from what the merged lockfile deduplicates. Here that is only `@types/node` in the server, from 26.6.5 to 26.6.6, which matches the frontend's copy.
- Server scripts such as `pnpm --dir server test` and `pnpm --dir server db:push` work unchanged.
- `pnpm install --frozen-lockfile`, `pnpm --dir server test`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm build` pass from a clean checkout.

## Acceptance criteria

1. The header links only to pages that exist, with no two links to the same page.
2. Auth modules live in `src/auth/`, and Open Library's response schemas live in the server.
3. Library, ratings, and collections routers require auth the same way, strict schemas use `z.strictObject`, and no module is named `searchlibrary.ts`.
4. Tests for `shared/` code live beside it and run with `pnpm test`, without a database, and all 43 still pass.
5. One root install sets up the frontend and the backend from one lockfile, and CI installs that way.
6. All existing and new tests and the project checks pass.

## Tests

| Test name                                                     | Setup                                                                                                  | Asserts                                                                                           | Criteria |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------- |
| `REF-01-T-3 header links only to pages that exist`            | Render the header signed out                                                                           | The links are exactly Bookworm (`/`), Discover (`/search`), My Library, and Log In                | 1        |
| Existing `TST-01-T-1` header and app tests                    | Render the header and app routes                                                                       | Log in, Log out, and Discover still behave as before                                              | 1        |
| Existing auth provider tests                                  | Run `src/auth/AuthContext.test.tsx` from its new location                                              | Loading, login, register, and logout behave as before                                             | 2        |
| Existing books, similar books, and library availability tests | Run against the moved schemas and renamed catalog module                                               | Details, search, similar books, and availability pass unchanged                                   | 2, 3     |
| Existing library, ratings, and collections tests              | Run against `router.use(requireAuth)` and `z.strictObject` schemas                                     | Unauthenticated requests get `401`, extra fields get `400`, and other behavior is unchanged       | 3        |
| Moved `IMP-01-T-*`, `COL-06-T-*`, and `REF-01-T-2` ISBN tests | Run `pnpm test`, which now includes `shared/*.test.ts`                                                 | All 43 pass under Vitest with no database                                                         | 4        |
| Clean install                                                 | Delete `node_modules` and `server/node_modules`, then run `pnpm install --frozen-lockfile` at the root | Both packages install from the single lockfile, and the API starts with `pnpm --dir server start` | 5        |
| Existing suites and project checks                            | Run both test suites, lint, format check, type check, and build                                        | Everything passes                                                                                 | 6        |
