import { Router } from "express";
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
