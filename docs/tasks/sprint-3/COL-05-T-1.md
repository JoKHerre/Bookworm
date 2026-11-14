---
id: COL-05-T-1
story: COL-05
sprint: 3
assignee: Shruti Saini
estimate_hours: 2
---

# Create collection and book-membership tables

## Description

Serves COL-05 (organize books into different collections). This database slice stores user-owned collections and the membership of saved library books in those collections. It includes both the collection table and the membership table needed for a book to belong to multiple collections. It establishes naming, ownership, uniqueness, and deletion rules for the later collection features.

Collection endpoints belong to Task 5. Collection creation, renaming, and deletion controls belong to Task 2. Assignment from book details belongs to Task 3, and My Library presentation belongs to Task 4. Those interfaces and HTTP behavior are out of scope here. This task tests database behavior directly, including updates and deletes that later endpoints will perform.

## Specs

### Stored data

Define and export `collections` and `collectionBooks` in `server/src/db/schema.ts`, with inferred `Collection` and `CollectionBook` TypeScript types.

| Table              | Column          | Observable behavior                                                                       |
| ------------------ | --------------- | ----------------------------------------------------------------------------------------- |
| `collections`      | `id`            | Automatically generated integer primary key                                               |
| `collections`      | `user_id`       | Required integer referencing an existing `users.id`                                       |
| `collections`      | `name`          | Required text, stored without leading or trailing whitespace, containing 1–100 characters |
| `collections`      | `created_at`    | Required timestamp with time zone, defaulting to the insertion time                       |
| `collection_books` | `collection_id` | Required integer identifying the collection                                               |
| `collection_books` | `saved_book_id` | Required integer identifying an existing `saved_books` row                                |
| `collection_books` | `user_id`       | Required integer matching the owner of both referenced records                            |
| `collection_books` | `created_at`    | Required timestamp with time zone, defaulting to the insertion time                       |

- The membership pair `(collection_id, saved_book_id)` is the composite primary key. A book can appear once in each of several collections, and each collection can contain several books.
- Use composite foreign keys from membership `(collection_id, user_id)` to collection `(id, user_id)` and membership `(saved_book_id, user_id)` to saved book `(id, user_id)`. Add the supporting unique constraints to those parent pairs. These relationships reject cross-user memberships in the database.
- Names are unique per owner ignoring capitalization. `Favorites` and `favorites` conflict for one owner. Different owners can each have `Favorites`.
- The database rejects untrimmed names instead of silently rewriting input. Future endpoint validation will trim input before writing. Thus `Favorites` cannot create a second collection beside `Favorites`.
- For this task, boundary whitespace means PostgreSQL's `[[:space:]]` character class, including ordinary spaces, tabs, and line breaks. Reject a name starting or ending with such whitespace. Count the 1–100 limit in PostgreSQL characters, not bytes. Preserve capitalization, internal spaces, punctuation, and Unicode text. Case-insensitive uniqueness uses PostgreSQL `lower(name)` under the database locale, without accent folding or Unicode normalization.

### Inputs, outputs, states, and edge cases

| Operation         | Input                                                                                                              | Observable result                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Create collection | Existing owner ID and valid name                                                                                   | One stored collection with generated ID and timestamp, initially containing zero memberships |
| Rename collection | Existing collection ID and valid replacement name                                                                  | Updated name with the same ID, creation time, and memberships                                |
| Add membership    | Existing collection ID, saved-book ID, and matching owner ID                                                       | One stored membership with an automatic timestamp                                            |
| Remove membership | Existing collection/book pair                                                                                      | Membership removed, with both parents and other memberships preserved                        |
| Delete collection | Existing collection ID                                                                                             | Collection and its memberships removed, with all saved books preserved                       |
| Delete saved book | Existing saved-book ID                                                                                             | Saved book and its memberships removed, with all collections preserved                       |
| Delete user       | Existing user ID                                                                                                   | Their collections, saved books, and memberships removed                                      |
| Invalid write     | Missing required value, invalid name, duplicate name or membership, nonexistent reference, or mismatched ownership | Database constraint error, with no invalid row persisted                                     |

- Empty and nonempty collections are both valid states. Removing the final membership leaves an empty collection.
- Membership requires a saved-library row. Store its ID, and obtain the Open Library key and reading status from that row. Book metadata, reading status, counts, and cover previews are not duplicated into these tables.
- A rejected rename leaves the previous name and memberships intact. A case-only rename of the same collection is allowed.
- Uniqueness must be enforced by the database so concurrent duplicate inserts cannot create duplicate names or memberships.
- Deletion cleanup uses foreign-key cascades. Deleting a child membership never cascades upward into its parent records.

### Test touchpoints

- `server/src/db/schema.ts` supplies existing `users` and `savedBooks` and the new `collections` and `collectionBooks` exports. Existing `sessions` and `bookRatings` remain covered by regression checks.
- `server/src/db/index.ts` supplies `db` and `pool`. Tests use Drizzle `db.insert()`, `db.select()`, `db.update()`, `db.delete()`, `.values()`, `.set()`, `.where()`, `.returning()`, and raw `pool.query()` for metadata and invalid SQL inputs. Cleanup closes the connection through `pool.end()`.
- `server/backend_tests/schema.test.ts` contains the cases below. It uses `createCollectionFixture()`, `createTestUser()`, `hasPostgresErrorCode()`, and the existing `after()` cleanup hook.
- `server/backend_tests/test-utils.ts` supplies `assertTestDatabaseUrl()`, `createTestBookKey()`, and `eq`. Tests may import Drizzle `and` to identify a membership pair.
- Schema setup uses `server/drizzle.config.ts` and the existing `db:push` script in `server/package.json`. Regression validation uses the existing server `test` script and root `typecheck` script.
- `server/scripts/prepare-collection-ownership.ts` runs before Drizzle Kit through `db:push`. On existing parent tables it adds missing `(id, user_id)` unique constraints before Drizzle creates dependent foreign keys. Drizzle Kit 0.31 otherwise orders those foreign keys before the required constraints. On a fresh database the preparation skips absent tables, and Drizzle creates their constraints with the tables. The schema application check below covers this preparation and repeated pushes.
- New Task 1 tests call no HTTP endpoint, authentication middleware, external book service, or UI element. Existing regression tests continue to exercise their current entry points.

## Requirements

- Use the existing PostgreSQL database, Drizzle ORM, `pg` connection, and Drizzle Kit workflow. Apply the schema with `pnpm --dir server db:push`. Follow the existing direct schema-push approach without adding a migration system or dependencies.
- Enforce required values, name validity, name uniqueness, membership uniqueness, reference existence, and matching ownership through database constraints. Application-only checks are insufficient.
- Add indexes supporting collection lookup by owner and membership lookup by saved-book owner/ID for deletion cleanup. Reuse indexes supplied by primary keys and unique constraints where they already support the query.
- Preserve existing users, sessions, saved-book records, ratings, columns, defaults, indexes, reading-status values, and deletion rules. The supporting `(id, user_id)` constraint on `saved_books` is additive. Applying this task must preserve pre-existing data.
- Preserve `GET /api/library`, `POST /api/library`, `DELETE /api/library/:id`, and `PATCH /api/library/:id/reading-status` response contracts. Membership cleanup on saved-book deletion must follow automatically from the schema.
- Keep session handling and `requireAuth` in `server/src/auth/middleware.ts` intact. Database ownership constraints establish valid relationships. Task 5 must separately authenticate requests, derive the owner from the session, and restrict collection reads and writes to that owner.
- Use `node:test` and `node:assert/strict` for tests. Retain `assertTestDatabaseUrl()` and run database tests only against `bookworm_test`. Use unique temporary users and book keys, and clean up created records even if assertions fail.

## Acceptance criteria

1. PostgreSQL exposes both tables with the specified columns, required values, primary keys, foreign keys, supporting indexes, and automatic defaults.
2. Creating a valid collection returns a generated ID and timestamp and permits zero memberships.
3. The database accepts names of 1 and 100 characters, including internal spaces, punctuation, and Unicode text.
4. The database rejects missing, null, empty, whitespace-only, untrimmed, and over-100-character names on inserts and updates.
5. One owner cannot store case-insensitive duplicate collection names, while different owners can use the same name.
6. A valid rename preserves identity, creation time, and memberships, and a rejected rename preserves the prior record.
7. One collection can hold multiple saved books, and one saved book can belong to multiple collections.
8. A repeated collection/book pair is rejected without creating a second membership.
9. Missing required references, nonexistent references, and mismatched membership ownership are rejected by the database.
10. Removing a membership preserves both parents and unrelated memberships, including when the collection becomes empty.
11. Deleting a collection removes its memberships and preserves saved books and other collections' memberships.
12. Deleting a saved book removes its memberships and preserves collections and other books' memberships.
13. Deleting a user removes their collections and memberships while preserving another user's data.
14. Applying the schema through the existing push workflow preserves pre-existing users, sessions, saved books, and ratings.
15. The new database cases, existing backend tests, and project type checking pass.

## Tests

Each `COL-05-T-1` test in the table lives in `server/backend_tests/schema.test.ts`. Use `node:test` and `node:assert/strict` with the existing database helpers.

Shared setup applies the schema to the separate `bookworm_test` database, invokes `assertTestDatabaseUrl()` before connecting, and creates uniquely named temporary users as needed. Book fixtures use `createTestBookKey()` and real `savedBooks` inserts. Cleanup removes temporary users, allowing foreign-key cascades to remove their dependent rows, and closes `pool` in the existing cleanup hook. Inspect PostgreSQL errors using `hasPostgresErrorCode()` to distinguish not-null (`23502`), foreign-key (`23503`), check (`23514`), and unique (`23505`) violations.

| Test name                                                                | Setup                                                                                                                                                                  | Asserts                                                                                                                                    | Criterion |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `COL-05-T-1 creates collection and membership tables`                    | Apply the schema and inspect PostgreSQL column, constraint, and index metadata                                                                                         | Both table structures, default expressions, composite keys, ownership foreign keys, cascade actions, and supporting indexes match the spec | 1         |
| `COL-05-T-1 creates an empty collection with defaults`                   | Create a user and insert a collection using only owner ID and name                                                                                                     | A generated ID and valid creation timestamp are returned, and the membership count is zero                                                 | 2         |
| `COL-05-T-1 accepts valid collection names at the length boundaries`     | Insert distinct 1-character and 100-character names, a 100-character multibyte name, and names with internal spaces and punctuation                                    | Every valid name is stored unchanged and the limit counts characters rather than bytes                                                     | 3         |
| `COL-05-T-1 rejects invalid collection names on insert and update`       | Attempt omitted and null names, an empty string, spaces/tabs/newlines alone, boundary whitespace, and 101-character names, both on insert and on update of a valid row | Every invalid write fails, and the existing row retains its valid name                                                                     | 4, 6      |
| `COL-05-T-1 enforces collection name uniqueness per owner`               | Create `Favorites`, attempt `favorites` for the same user, then create `Favorites` for another user                                                                    | Same-owner duplicate fails and different-owner name succeeds                                                                               | 5         |
| `COL-05-T-1 renames a collection without changing its memberships`       | Create two named collections and a membership, rename one, perform a case-only rename, then attempt a conflicting rename                                               | Valid changes preserve ID, timestamp, and membership, and a conflict preserves the last valid name                                         | 5, 6      |
| `COL-05-T-1 supports multiple books and multiple collections`            | Give one user two saved books and two collections, add both books to the first collection and one book to both                                                         | All three distinct memberships persist and each links to the original saved-book row                                                       | 7         |
| `COL-05-T-1 rejects duplicate memberships`                               | Insert a membership and repeat the same pair                                                                                                                           | Duplicate write fails and exactly one membership remains                                                                                   | 8         |
| `COL-05-T-1 rejects missing required references`                         | Omit or explicitly null `collections.user_id` and each membership reference in separate inserts                                                                        | Each write fails with a not-null violation                                                                                                 | 9         |
| `COL-05-T-1 rejects nonexistent references`                              | Attempt a collection with a nonexistent user and memberships with nonexistent collection, saved-book, and owner IDs                                                    | Each write fails with a foreign-key violation and creates no row                                                                           | 9         |
| `COL-05-T-1 rejects cross-user memberships`                              | Create collections and saved books for two users, including saved rows for the same Open Library key, and try mixed-owner memberships using each possible owner ID     | Neither user's ID can validate a collection/book ownership mismatch                                                                        | 9         |
| `COL-05-T-1 removes membership without deleting parents`                 | Create several memberships and delete one, then remove the final membership from a collection                                                                          | Parents and unrelated memberships survive, and the emptied collection still exists                                                         | 10        |
| `COL-05-T-1 cascades membership deletion from a collection`              | Put one saved book into two collections and delete one collection                                                                                                      | Only its memberships disappear, with saved books and the other collection's memberships preserved                                          | 11        |
| `COL-05-T-1 cascades membership deletion from a saved book`              | Put two saved books into collections, then delete one saved-book row                                                                                                   | All memberships for that book disappear, with collections and other books' memberships preserved                                           | 12        |
| `COL-05-T-1 cascades collections and memberships when a user is deleted` | Give two users saved books, collections, and memberships, then delete one user                                                                                         | The deleted user's dependent rows disappear and the other user's rows survive                                                              | 13        |

### Schema application and regression checks

| Check                                                                           | File or entry point                                                                                                                                                                  | Setup                                                                                                                                                                                                                                                    | Asserts                                                                                                                                     | Criterion |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `COL-05-T-1 preserves existing data during schema push` (manual database check) | `server/src/db/schema.ts`, `server/drizzle.config.ts`, and `server/package.json` through `db:push`                                                                                   | In a disposable `bookworm_test` database with the pre-task schema, seed a user, session, saved book with a nondefault reading status, and rating. Record their full rows, apply the updated schema, compare rows using direct SQL, then repeat `db:push` | Schema application succeeds, both new tables exist, all seeded records retain their original values, and the second push reports no changes | 1, 14     |
| Existing backend regression suite and new Task 1 cases                          | `server/backend_tests/schema.test.ts`, `auth.test.ts`, `library.test.ts`, `ratings.test.ts`, `bookSuggestions.test.ts`, and `bookSearchFilters.test.ts` via `pnpm --dir server test` | Point `DATABASE_URL` to the schema-synced `bookworm_test` database and run the existing server test script                                                                                                                                               | All tests pass, including existing auth, library, reading-status, rating, book-suggestion, and book-search coverage                         | 15        |
| Project type checking                                                           | Root and server `package.json` through `pnpm typecheck`                                                                                                                              | Run with existing project dependencies installed                                                                                                                                                                                                         | Frontend and backend type checking exit successfully                                                                                        | 15        |

The pre-task schema application check is separate from the automated cases because ordinary tests run after schema synchronization. Existing regression test names and touchpoints remain defined in their respective test files. No additional API or UI test is introduced by this task.
