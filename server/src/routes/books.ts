import { Router, type Response } from "express";
import type { ApiError } from "../../../shared/api.ts";
import {
  bookSuggestionsQuery,
  bookDetailsQuery,
  bookISBNsQuery,
  bookSearchQuery,
  contentWarningsQuery,
  MAX_SEARCH_PAGE,
  SEARCH_PAGE_SIZE,
  similarBooksQuery,
  type BookDetails,
  type BookISBNs,
  type BookSearchResponse,
  type SimilarBooksResponse,
} from "../../../shared/books.ts";

import { requireAuth } from "../auth/middleware.ts";
import {
  matchImportRequest,
  type MatchImportResponse,
} from "../../../shared/bookMatch.ts";
import { checkBookAvailability } from "../services/bookAvailability.ts";
import type { AvailabilityResponse } from "../../../shared/availability.ts";

import {
  searchOpenLibrarySuggestions,
  searchOpenLibrary,
  getBookDetails,
  getISBNsForWork,
  getSimilarBooks,
  matchImportRows,
  OpenLibraryError,
} from "../services/openLibrary.ts";

import {
  titleSearchQuery,
  type TitleSearchResponse,
} from "../../../shared/titleSearch.ts";
import { searchLibraryByTitle } from "../services/libraryCatalog.ts";
import {
  filterSearchWarnings,
  getContentWarningsForWork,
} from "../services/contentWarnings.ts";
import type { ContentWarningsResponse } from "../../../shared/contentWarnings.ts";

export const booksRouter: Router = Router();

booksRouter.get(
  "/content-warnings",
  async (req, res: Response<ContentWarningsResponse | ApiError>) => {
    const parsed = contentWarningsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid book key" });
      return;
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);
    try {
      const result = await getContentWarningsForWork(
        parsed.data.key,
        controller.signal,
      );
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      console.error("Book content warning lookup error:", error);
      if (error instanceof OpenLibraryError && error.status === 404) {
        res.status(404).json({ error: "Book not found" });
        return;
      }
      res
        .status(502)
        .json({ error: "Unable to retrieve book content warnings" });
    } finally {
      res.off("close", onClose);
    }
  },
);

booksRouter.get(
  "/suggestions",
  async (req, res: Response<BookSearchResponse | ApiError>) => {
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
  async (req, res: Response<BookSearchResponse | ApiError>) => {
    const query = { ...req.query };
    for (const name of ["genre", "excludeGenre", "excludeWarning"]) {
      let values = query[name];
      if (typeof values === "string") values = [values];
      if (Array.isArray(values))
        values = values.filter((value) => value !== "");
      query[name] = values;
    }

    const parsed = bookSearchQuery.safeParse(query);

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid search query",
      });
      return;
    }
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);

    try {
      const results = await searchOpenLibrary(
        parsed.data,
        parsed.data.excludeGenre,
        controller.signal,
      );
      const books = await filterSearchWarnings(
        results.books,
        parsed.data.excludeWarning,
        controller.signal,
      );
      const page = parsed.data.page ?? 1;
      if (!res.destroyed) {
        res.json({
          ...results,
          books,
          hasMore:
            page < MAX_SEARCH_PAGE && page * SEARCH_PAGE_SIZE < results.total,
          totalIsExact: parsed.data.excludeWarning.length === 0,
        });
      }
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      console.error("Book search error:", error);

      res.status(502).json({
        error: "Unable to retrieve books from Open Library",
      });
    } finally {
      res.off("close", onClose);
    }
  },
);

booksRouter.get(
  "/details",
  async (req, res: Response<BookDetails | ApiError>) => {
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
  "/similar",
  async (req, res: Response<SimilarBooksResponse | ApiError>) => {
    const parsed = similarBooksQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid book key" });
      return;
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);

    try {
      const result = await getSimilarBooks(parsed.data.key, controller.signal);
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      console.error("Similar books lookup error:", error);

      if (error instanceof OpenLibraryError && error.status === 404) {
        res.status(404).json({ error: "Book not found" });
        return;
      }
      res.status(502).json({ error: "Unable to retrieve similar books" });
    } finally {
      res.off("close", onClose);
    }
  },
);

// match imported rows to Open Library works (the book importer)
booksRouter.post(
  "/match",
  requireAuth,
  async (req, res: Response<MatchImportResponse | ApiError>) => {
    const parsed = matchImportRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid match request" });
      return;
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);

    try {
      const results = await matchImportRows(
        parsed.data.rows,
        controller.signal,
      );
      if (!res.destroyed) res.json({ results });
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    } finally {
      res.off("close", onClose);
    }
  },
);

booksRouter.get("/isbns", async (req, res: Response<BookISBNs | ApiError>) => {
  const parsed = bookISBNsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid ISBN query",
    });
    return;
  }

  try {
    res.json(await getISBNsForWork(parsed.data));
  } catch (error) {
    console.error("Book ISBN lookup error:", error);
    res.status(502).json({ error: "Unable to retrieve ISBNs" });
  }
});

booksRouter.get(
  "/availability",
  async (req, res: Response<AvailabilityResponse | ApiError>) => {
    const parsed = bookDetailsQuery.pick({ key: true }).safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid Request" });
      return;
    }

    const controller = new AbortController();
    // A normal response also emits close; only an unfinished response means the
    // caller disconnected and no longer needs upstream work to continue.
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);
    const started = Date.now();

    try {
      const result = await checkBookAvailability(
        parsed.data.key,
        controller.signal,
      );
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Availability check failed:", {
        workKey: parsed.data.key,
        durationMs: Date.now() - started,
        error,
      });
      if (!res.destroyed) {
        res.status(502).json({ error: "Could not check library availability" });
      }
    } finally {
      res.off("close", onClose);
    }
  },
);

booksRouter.get(
  "/library-search",
  async (req, res: Response<TitleSearchResponse | ApiError>) => {
    const parsed = titleSearchQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid library search",
      });
      return;
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);
    const started = Date.now();

    try {
      // 20 second limit for both requests
      const results = await searchLibraryByTitle(
        parsed.data.title,
        parsed.data.format,
        AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      );
      if (!res.destroyed) res.json({ results });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Library title search failed:", {
        title: parsed.data.title,
        format: parsed.data.format,
        durationMs: Date.now() - started,
        error,
      });
      if (!res.destroyed) {
        res.status(502).json({ error: "Could not search the library catalog" });
      }
    } finally {
      res.off("close", onClose);
    }
  },
);
