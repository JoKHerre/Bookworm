import { Router, type Response } from "express";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { db } from "../db/index.ts";
import { savedBooks } from "../db/schema.ts";
import { requireAuth } from "../auth/middleware.ts";
import { parsePositiveId } from "./params.ts";
import { IMPORT_MAX_ROWS } from "../../../shared/bookImport.ts";
import { openLibraryWorkKey } from "../../../shared/books.ts";
import { READING_STATUSES } from "../../../shared/readingStatus.ts";
import type { ApiError } from "../../../shared/api.ts";
import type {
  ImportBooksResponse,
  LibraryResponse,
  ReadingStatusResponse,
  SaveBookResponse,
} from "../../../shared/library.ts";

// .strict() rejects extra fields such as a userId
const saveBookBody = z
  .object({
    bookKey: openLibraryWorkKey,
  })
  .strict();

const updateReadingStatusBody = z
  .object({
    readingStatus: z.enum(READING_STATUSES),
  })
  .strict();

const importBooksBody = z
  .object({
    bookKeys: z.array(openLibraryWorkKey).min(1).max(IMPORT_MAX_ROWS),
  })
  .strict();

const INVALID_SAVED_BOOK_ID_ERROR = "Invalid saved book ID";

export const libraryRouter: Router = Router();

// GET /api/library: the signed-in user's saved books
libraryRouter.get(
  "/",
  requireAuth,
  async (_req, res: Response<LibraryResponse<Date>>) => {
    const books = await db
      .select({
        id: savedBooks.id,
        bookKey: savedBooks.bookKey,
        createdAt: savedBooks.createdAt,
        readingStatus: savedBooks.readingStatus,
      })
      .from(savedBooks)
      .where(eq(savedBooks.userId, res.locals.user!.id));

    res.json({ books });
  },
);

// DELETE /api/library/:id: remove a saved book
libraryRouter.delete(
  "/:id",
  requireAuth,
  async (req, res: Response<ApiError>) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: INVALID_SAVED_BOOK_ID_ERROR });
      return;
    }

    const [deletedBook] = await db
      .delete(savedBooks)
      .where(
        and(eq(savedBooks.id, id), eq(savedBooks.userId, res.locals.user!.id)),
      )
      .returning({ id: savedBooks.id });

    if (!deletedBook) {
      res.status(404).json({ error: "Book not found in your library" });
      return;
    }

    res.status(204).end();
  },
);

// PATCH /api/library/:id/reading-status
libraryRouter.patch(
  "/:id/reading-status",
  requireAuth,
  async (req, res: Response<ReadingStatusResponse | ApiError>) => {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: INVALID_SAVED_BOOK_ID_ERROR });
      return;
    }

    const parsed = updateReadingStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid reading status" });
      return;
    }

    const [updatedBook] = await db
      .update(savedBooks)
      .set({ readingStatus: parsed.data.readingStatus })
      .where(
        and(eq(savedBooks.id, id), eq(savedBooks.userId, res.locals.user!.id)),
      )
      .returning({
        id: savedBooks.id,
        readingStatus: savedBooks.readingStatus,
      });

    if (!updatedBook) {
      res.status(404).json({ error: "Book not found in your library" });
      return;
    }

    res.status(200).json(updatedBook);
  },
);

// POST /api/library: save a book
libraryRouter.post(
  "/",
  requireAuth,
  async (req, res: Response<SaveBookResponse<Date> | ApiError>) => {
    const parsed = saveBookBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid book key" });
      return;
    }

    const [savedBook] = await db
      .insert(savedBooks)
      .values({
        userId: res.locals.user!.id,
        bookKey: parsed.data.bookKey,
      })
      .onConflictDoNothing({
        target: [savedBooks.userId, savedBooks.bookKey],
      })
      .returning({
        id: savedBooks.id,
        userId: savedBooks.userId,
        bookKey: savedBooks.bookKey,
        createdAt: savedBooks.createdAt,
      });

    // no row returned means the book was already saved
    if (!savedBook) {
      res.status(409).json({ error: "Book is already in your library" });
      return;
    }

    res.status(201).json(savedBook);
  },
);

// POST /api/library/import: save many books at once (the book importer)
libraryRouter.post(
  "/import",
  requireAuth,
  async (req, res: Response<ImportBooksResponse | ApiError>) => {
    const parsed = importBooksBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid import" });
      return;
    }

    // a repeated key in one request counts once
    const bookKeys = [...new Set(parsed.data.bookKeys)];

    // one insert for the whole list; keys the user already saved are skipped
    const inserted = await db
      .insert(savedBooks)
      .values(
        bookKeys.map((bookKey) => ({ userId: res.locals.user!.id, bookKey })),
      )
      .onConflictDoNothing({ target: [savedBooks.userId, savedBooks.bookKey] })
      .returning({ id: savedBooks.id });

    res.json({
      added: inserted.length,
      alreadySaved: bookKeys.length - inserted.length,
    });
  },
);
