import { Router, type Response } from "express";
import { and, count, eq, sql } from "drizzle-orm";
import z from "zod";
import { openLibraryWorkKey } from "../../../shared/books.ts";
import { requireAuth } from "../auth/middleware.ts";
import { db } from "../db/index.ts";
import { collectionBooks, collections, savedBooks } from "../db/schema.ts";

// zod schemas
// collection name body: take name string, trim whitespace, check length and null character
// used for creating and renaming collections
const collectionNameBody = z.strictObject({
  name: z
    .string()
    .trim()
    .refine((name) => {
      const length = [...name].length;
      return length >= 1 && length <= 100 && !name.includes("\0");
    }),
});

// collection book body: bookKey string, must be a valid openLibraryWorkKey
// used for adding a book to a collection
const collectionBookBody = z.strictObject({ bookKey: openLibraryWorkKey });

// collection list query: optional bookKey
// used to list collections
const collectionListQuery = z.strictObject({
  bookKey: openLibraryWorkKey.optional(),
});

// constants
const COLLECTION_NOT_FOUND = "Collection not found";
const ADD_TARGET_NOT_FOUND = "Collection or saved book not found";
const INVALID_NAME = "Invalid collection name";
const INVALID_BOOK_KEY = "Invalid book key";
const MAX_POSTGRES_INTEGER = 2_147_483_647;

// fields to return from collections and savedBooks tables
const collectionFields = {
  id: collections.id,
  name: collections.name,
  createdAt: collections.createdAt,
};
const savedBookFields = {
  id: savedBooks.id,
  bookKey: savedBooks.bookKey,
  readingStatus: savedBooks.readingStatus,
  createdAt: savedBooks.createdAt,
};

// how to match collectionBooks to collections and savedBooks, respectively
const collectionMembership = and(
  eq(collectionBooks.collectionId, collections.id),
  eq(collectionBooks.userId, collections.userId),
);
const membershipSavedBook = and(
  eq(savedBooks.id, collectionBooks.savedBookId),
  eq(savedBooks.userId, collectionBooks.userId),
);

// helper functions
function parsePositivePostgresId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= MAX_POSTGRES_INTEGER ? id : null;
}

function ownedCollection(collectionId: number, userId: number) {
  return and(eq(collections.id, collectionId), eq(collections.userId, userId));
}

function matchesPgConstraint(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  // Drizzle wraps the PostgreSQL error in a cause.
  // check error code and constraint, or recurse into cause if present
  if (typeof error !== "object" || error === null) return false;
  if (
    "code" in error &&
    error.code === code &&
    "constraint" in error &&
    error.constraint === constraint
  )
    return true;
  return "cause" in error && matchesPgConstraint(error.cause, code, constraint);
}

function handleCollectionNameError(error: unknown, res: Response) {
  if (matchesPgConstraint(error, "23505", "collections_user_name_unique")) {
    res.status(409).json({ error: "Collection name already exists" });
  } else if (matchesPgConstraint(error, "23514", "collections_name_valid")) {
    res.status(400).json({ error: INVALID_NAME });
  } else {
    throw error;
  }
}

// router logic
export const collectionsRouter: Router = Router();
collectionsRouter.use(requireAuth);

// validate collectionId and savedBookId params to be positive integers within PostgreSQL range
collectionsRouter.param("collectionId", (_req, res, next, value: string) => {
  if (parsePositivePostgresId(value) === null) {
    res.status(400).json({ error: "Invalid collection ID" });
    return;
  }
  next();
});
collectionsRouter.param("savedBookId", (_req, res, next, value: string) => {
  if (parsePositivePostgresId(value) === null) {
    res.status(400).json({ error: "Invalid saved book ID" });
    return;
  }
  next();
});

// GET /api/collections: to list a user's collections, optionally filtered by a bookKey
collectionsRouter.get("/", async (req, res) => {
  // validate query parameters using zod
  const parsed = collectionListQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BOOK_KEY });
    return;
  }
  const userId = res.locals.user!.id;
  const { bookKey } = parsed.data;
  // build list query
  const query = db
    .select({
      ...collectionFields,
      bookCount: count(collectionBooks.savedBookId),
      ...(bookKey === undefined
        ? {}
        : {
            containsBook: sql<boolean>`coalesce(bool_or(${savedBooks.bookKey} = ${bookKey}), false)`,
          }),
    })
    .from(collections)
    .leftJoin(collectionBooks, collectionMembership) // to keep empty collections in the result set
    .$dynamic();
  if (bookKey !== undefined) query.leftJoin(savedBooks, membershipSavedBook);
  const summaries = await query
    .where(eq(collections.userId, userId))
    .groupBy(collections.id)
    .orderBy(collections.id);
  res.json({ collections: summaries });
});

// POST /api/collections: to create a new collection
collectionsRouter.post("/", async (req, res) => {
  const parsed = collectionNameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_NAME });
    return;
  }
  try {
    const [collection] = await db
      .insert(collections) // insert into the collections table
      .values({
        userId: res.locals.user!.id, // owner
        name: parsed.data.name, // collection name
      })
      .returning(collectionFields); // return the new collection's fields
    res.status(201).json({ ...collection, bookCount: 0 });
  } catch (error) {
    handleCollectionNameError(error, res);
  }
});

// GET /api/collections/:collectionId: to get a specific collection and its books
collectionsRouter.get("/:collectionId", async (req, res) => {
  // a left join keeps an empty collection distinguishable from a missing one.
  // start with requested collection, then left join to collectionBooks and savedBooks to get its books.
  const rows = await db
    .select({ collection: collectionFields, book: savedBookFields })
    .from(collections)
    .leftJoin(collectionBooks, collectionMembership)
    .leftJoin(savedBooks, membershipSavedBook)
    .where(
      ownedCollection(Number(req.params.collectionId), res.locals.user!.id),
    )
    .orderBy(savedBooks.id);
  // turn the rows into a collection summary and a list of books
  const first = rows[0];
  if (!first) {
    res.status(404).json({ error: COLLECTION_NOT_FOUND });
    return;
  }
  const books = rows.flatMap(({ book }) => (book ? [book] : []));
  res.json({
    collection: { ...first.collection, bookCount: books.length },
    books,
  });
});

// PATCH /api/collections/:collectionId: to rename a collection
collectionsRouter.patch("/:collectionId", async (req, res) => {
  // validate name in request body using zod
  const parsed = collectionNameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_NAME });
    return;
  }
  const collectionId = Number(req.params.collectionId);
  const userId = res.locals.user!.id;
  try {
    // update collection name in a transaction
    const summary = await db.transaction(async (tx) => {
      const [collection] = await tx
        .update(collections)
        .set({ name: parsed.data.name })
        .where(ownedCollection(collectionId, userId))
        .returning(collectionFields);
      if (!collection) return null;
      const [membershipCount] = await tx
        .select({ value: count() })
        .from(collectionBooks)
        .where(
          and(
            eq(collectionBooks.collectionId, collectionId),
            eq(collectionBooks.userId, userId),
          ),
        );
      return { ...collection, bookCount: membershipCount!.value };
    });
    if (!summary) {
      res.status(404).json({ error: COLLECTION_NOT_FOUND });
      return;
    }
    res.json(summary);
  } catch (error) {
    handleCollectionNameError(error, res);
  }
});

// DELETE /api/collections/:collectionId: to delete a collection
collectionsRouter.delete("/:collectionId", async (req, res) => {
  // delete from collections table, cascade deletes collectionBooks memberships, but not savedBooks
  const [deleted] = await db
    .delete(collections)
    .where(
      ownedCollection(Number(req.params.collectionId), res.locals.user!.id),
    )
    .returning({ id: collections.id });
  if (!deleted) {
    res.status(404).json({ error: COLLECTION_NOT_FOUND });
    return;
  }
  res.status(204).end();
});

// POST /api/collections/:collectionId/books: to add a book to a collection
collectionsRouter.post("/:collectionId/books", async (req, res) => {
  const parsed = collectionBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: INVALID_BOOK_KEY });
    return;
  }
  const collectionId = Number(req.params.collectionId);
  const userId = res.locals.user!.id;
  try {
    // save book to an existing collection in a transaction
    const result = await db.transaction(async (tx) => {
      const [book] = await tx
        .select(savedBookFields)
        .from(collections)
        .innerJoin(
          savedBooks,
          and(
            eq(savedBooks.userId, collections.userId),
            eq(savedBooks.bookKey, parsed.data.bookKey),
          ),
        )
        .where(ownedCollection(collectionId, userId));
      if (!book) return null;
      const [membership] = await tx
        .insert(collectionBooks)
        .values({ collectionId, savedBookId: book.id, userId })
        .onConflictDoNothing({
          target: [collectionBooks.collectionId, collectionBooks.savedBookId],
        })
        .returning({ savedBookId: collectionBooks.savedBookId });
      return { book, membership };
    });
    // interpret result
    if (!result) {
      res.status(404).json({ error: ADD_TARGET_NOT_FOUND });
    } else if (!result.membership) {
      res.status(409).json({ error: "Book is already in this collection" });
    } else {
      res.status(201).json(result.book);
    }
  } catch (error) {
    // a parent row may be deleted after the lookup but before insertion.
    if (
      matchesPgConstraint(
        error,
        "23503",
        "collection_books_collection_owner_fk",
      ) ||
      matchesPgConstraint(
        error,
        "23503",
        "collection_books_saved_book_owner_fk",
      )
    ) {
      res.status(404).json({ error: ADD_TARGET_NOT_FOUND });
      return;
    }
    throw error;
  }
});

// DELETE /api/collections/:collectionId/books/:savedBookId: to remove a book from a collection
collectionsRouter.delete(
  "/:collectionId/books/:savedBookId",
  async (req, res) => {
    const [deleted] = await db
      .delete(collectionBooks)
      .where(
        and(
          eq(collectionBooks.collectionId, Number(req.params.collectionId)),
          eq(collectionBooks.savedBookId, Number(req.params.savedBookId)),
          eq(collectionBooks.userId, res.locals.user!.id),
        ),
      )
      .returning({ savedBookId: collectionBooks.savedBookId });
    if (!deleted) {
      res.status(404).json({ error: "Collection membership not found" });
      return;
    }
    res.status(204).end();
  },
);
