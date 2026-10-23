import { Router } from "express";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { db } from "../db/index.ts"; // postgresql connection
import { savedBooks } from "../db/schema.ts"; // saved books table definition
import { requireAuth } from "../auth/middleware.ts"; // existing login check
import { openLibraryWorkKey } from "../../../shared/books.ts";

// define expected shape of request body for saving a book
// bookKey format using regex, reject extra fields (such as a userid) with .strict(), etc
const saveBookBody = z
  .object({
    bookKey: openLibraryWorkKey,
  })
  .strict();

// create an express router for library-related endpoints
export const libraryRouter: Router = Router();

// define GET /api/library endpoint for retrieving a user's saved books
libraryRouter.get("/", requireAuth, async (_req, res) => {
  // run requireAuth before handler to reject unauthenticated requests
  // from the saved_books table, for each row belonging to the user, get the id, bookKey, and createdAt fields
  const books = await db
    .select({
      id: savedBooks.id,
      bookKey: savedBooks.bookKey,
      createdAt: savedBooks.createdAt,
    })
    .from(savedBooks)
    .where(eq(savedBooks.userId, res.locals.user!.id));

  // return the array of saved books as json
  res.json({ books });
});

// define DELETE /api/library/:id endpoint for removing a saved book from the user's library
libraryRouter.delete("/:id", requireAuth, async (req, res) => {
  // requireAuth to check authentication/signed-in first before processing

  // accept only positive postgresql integer IDs; Number() alone would also accept decimals and exponents.
  // check that id param is a string of digits only first 
 const idParam = req.params.id;
  if (typeof idParam !== "string" || !/^\d+$/.test(idParam)) {
    res.status(400).json({ error: "Invalid saved book ID" });
    return;
  }

  // then convert to actual number, and check that it's a safe integer within postgresql's valid int range
  const id = Number(idParam);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    res.status(400).json({ error: "Invalid saved book ID" });
    return;
  }

  // from the saved_books table, delete the row with this book id and user id, and return the deleted row's id if success
  const [deletedBook] = await db
    .delete(savedBooks)
    .where(and(eq(savedBooks.id, id), eq(savedBooks.userId, res.locals.user!.id)))
    .returning({ id: savedBooks.id });

  // delete attempt unsuccessful: 404 row not found  
  if (!deletedBook) {
    res.status(404).json({ error: "Book not found in your library" });
    return;
  }

  // delete successful: return 204
  res.status(204).end();
});

// define the POST /api/library endpoint for saving a book to the user's library
libraryRouter.post("/", requireAuth, async (req, res) => {
  // check request body against the expected schema; if invalid, return 400 with error message
  const parsed = saveBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid book key" });
    return;
  }

  // insert into saved_books table with the authenticated user's ID and the provided bookKey
  const [savedBook] = await db
    .insert(savedBooks)
    .values({
      userId: res.locals.user!.id,
      bookKey: parsed.data.bookKey,
    })
    .onConflictDoNothing({
      // if duplicate conflict, do nothing
      target: [savedBooks.userId, savedBooks.bookKey],
    })
    .returning(); // return the new row if successfully inserted

  // no row returned == skipped insert due to duplicate; return 409 with error message
  if (!savedBook) {
    res.status(409).json({ error: "Book is already in your library" });
    return;
  }

  // return success: 201 with the newly created saved book row as json
  res.status(201).json(savedBook);
});
