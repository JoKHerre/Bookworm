import { Router, type Response } from "express";
import {
  bookSuggestionsQuery,
  bookDetailsQuery,
  bookSearchQuery,
  type BookDetails,
  type BookISBNs,
  type BookSearchResponse,
  type BooksError,
} from "../../../shared/books.ts";

import { checkBookAvailability } from "../services/bookAvailability.ts";

import {
  searchOpenLibrarySuggestions,
  searchOpenLibrary,
  getBookDetails,
  getISBNsForWork,
  OpenLibraryError,
} from "../services/openLibrary.ts";

export const booksRouter: Router = Router();

booksRouter.get(
  "/suggestions",
  async (req, res: Response<BookSearchResponse | BooksError>) => {
    const parsed = bookSuggestionsQuery.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid suggestion query",
      });
      return;
    }

    try {
      const results = await searchOpenLibrarySuggestions(parsed.data.q);
      res.json(results);
    } catch (error) {
      console.error("Book suggestions error:", error);

      res.status(502).json({
        error: "Unable to retrieve book suggestions from Open Library",
      });
    }
  },
);

booksRouter.get(
  "/search",
  async (req, res: Response<BookSearchResponse | BooksError>) => {
    let genre = req.query.genre;
    if (typeof genre === "string") genre = [genre];
    if (Array.isArray(genre)) genre = genre.filter((value) => value !== "");

    const parsed = bookSearchQuery.safeParse({ ...req.query, genre });

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid search query",
      });
      return;
    }
    try {
      const results = await searchOpenLibrary(parsed.data);
      res.json(results);
    } catch (error) {
      console.error("Book search error:", error);

      res.status(502).json({
        error: "Unable to retrieve books from Open Library",
      });
    }
  },
);

booksRouter.get(
  "/details",
  async (req, res: Response<BookDetails | BooksError>) => {
    const parsed = bookDetailsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid book key",
      });
      return;
    }

    try {
      const includeAuthors = parsed.data.includeAuthors !== "false";
      const book = await getBookDetails(parsed.data.key, includeAuthors);
      res.json(book);
    } catch (error) {
      console.error("Book details error:", error);

      if (error instanceof OpenLibraryError && error.status === 404) {
        res.status(404).json({
          error: "Book not found",
        });
        return;
      }

      res.status(502).json({
        error: "Unable to retrieve book details",
      });
    }
  },
);

booksRouter.get(
  "/isbns",
  async (req, res: Response<BookISBNs | BooksError>) => {
    const parsed = bookDetailsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid book key" });
      return;
    }

    try {
      res.json(await getISBNsForWork(parsed.data.key));
    } catch (error) {
      console.error("Book ISBN lookup error:", error);
      res.status(502).json({ error: "Unable to retrieve ISBNs" });
    }
  },
);

booksRouter.get("/availability", async (req, res) => {
  const parsed = bookDetailsQuery.pick({ key: true }).safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Invalid Request" });
    return;
  }

  try {
    res.json({ availability: await checkBookAvailability(parsed.data.key) });
  } catch (error) {
    console.error("Availability check failed:", error);
    res.status(502).json({ error: "Could not check library availability" });
  }
});
