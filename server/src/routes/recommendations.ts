import { Router, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { bookRatings, savedBooks, userGenres } from "../db/schema.ts";
import { requireAuth } from "../auth/middleware.ts";
import { getGenreBooks } from "../services/openLibrary.ts";
import type { ApiError } from "../../../shared/api.ts";
import {
  MAX_RECOMMENDATIONS,
  recommendationsResponse,
  type BookSearchResult,
  type RecommendationsResponse,
} from "../../../shared/books.ts";
import { sortGenres } from "../../../shared/interests.ts";

export const recommendationsRouter: Router = Router();
recommendationsRouter.use(requireAuth);

// Take each genre's first book, then each genre's second, and so on, so one
// genre doesn't crowd out the rest.
function mergeGenreBooks(
  lists: BookSearchResult[][],
  excludedKeys: Set<string>,
): BookSearchResult[] {
  const books: BookSearchResult[] = [];
  const seen = new Set(excludedKeys);
  const longest = Math.max(...lists.map((list) => list.length));

  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const book = list[i];
      if (!book || seen.has(book.key)) continue;
      seen.add(book.key);
      books.push(book);
      if (books.length === MAX_RECOMMENDATIONS) return books;
    }
  }
  return books;
}

// GET /api/recommendations: books from the genres the signed-in user likes,
// leaving out books they saved or rated
recommendationsRouter.get(
  "/",
  async (_req, res: Response<RecommendationsResponse | ApiError>) => {
    const userId = res.locals.user!.id;
    const [genreRows, savedRows, ratedRows] = await Promise.all([
      db
        .select({ genre: userGenres.genre })
        .from(userGenres)
        .where(eq(userGenres.userId, userId)),
      db
        .select({ bookKey: savedBooks.bookKey })
        .from(savedBooks)
        .where(eq(savedBooks.userId, userId)),
      db
        .select({ bookKey: bookRatings.bookKey })
        .from(bookRatings)
        .where(eq(bookRatings.userId, userId)),
    ]);

    const genres = sortGenres(genreRows.map(({ genre }) => genre));
    if (genres.length === 0) {
      res.json({ books: [] });
      return;
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);

    try {
      const results = await Promise.allSettled(
        genres.map((genre) => getGenreBooks(genre, controller.signal)),
      );
      if (controller.signal.aborted || res.destroyed) return;

      const lists: BookSearchResult[][] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") lists.push(result.value);
        else console.error(`${genres[i]} books error:`, result.reason);
      });
      if (lists.length === 0) {
        res.status(502).json({ error: "Unable to retrieve recommendations" });
        return;
      }

      const excludedKeys = new Set(
        [...savedRows, ...ratedRows].map(({ bookKey }) => bookKey),
      );
      res.json(
        recommendationsResponse.parse({
          books: mergeGenreBooks(lists, excludedKeys),
        }),
      );
    } finally {
      res.off("close", onClose);
    }
  },
);
