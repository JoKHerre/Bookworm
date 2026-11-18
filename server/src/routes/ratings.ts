import { and, eq } from "drizzle-orm";
import { Router, type Response } from "express";
import { db } from "../db/index.ts";
import { bookRatings } from "../db/schema.ts";
import { requireAuth } from "../auth/middleware.ts";
import type { ApiError } from "../../../shared/api.ts";
import {
  ratingsQuery,
  saveRatingBody,
  type BookRatingResponse,
  type BookRatingsResponse,
} from "../../../shared/ratings.ts";

// create an express router for rating-related endpoints
export const ratingsRouter: Router = Router();

// GET /api/ratings: the signed-in user's ratings, or with ?bookKey= just that book's
ratingsRouter.get(
  "/",
  requireAuth,
  async (req, res: Response<BookRatingsResponse | ApiError>) => {
    const parsed = ratingsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid book key" });
      return;
    }
    const { bookKey } = parsed.data;

    const ratings = await db
      .select({ bookKey: bookRatings.bookKey, rating: bookRatings.rating })
      .from(bookRatings)
      .where(
        and(
          eq(bookRatings.userId, res.locals.user!.id),
          bookKey === undefined ? undefined : eq(bookRatings.bookKey, bookKey),
        ),
      );

    res.json({ ratings });
  },
);

// define PUT /api/ratings endpoint for saving or updating the user's rating of a book
ratingsRouter.put(
  "/",
  requireAuth,
  async (req, res: Response<BookRatingResponse | ApiError>) => {
    // validate bookKey format and rating (integer 1-5); .strict() rejects extra fields such as a userId
    const parsed = saveRatingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid rating" });
      return;
    }

    // insert a new rating, or update the existing one for this (user, book) pair
    const [savedRating] = await db
      .insert(bookRatings)
      .values({
        userId: res.locals.user!.id,
        bookKey: parsed.data.bookKey,
        rating: parsed.data.rating,
      })
      .onConflictDoUpdate({
        target: [bookRatings.userId, bookRatings.bookKey],
        set: { rating: parsed.data.rating, updatedAt: new Date() },
      })
      .returning({ bookKey: bookRatings.bookKey, rating: bookRatings.rating });

    res.status(200).json(savedRating);
  },
);
