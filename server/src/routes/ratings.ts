import { Router } from "express";
import { db } from "../db/index.ts"; // postgresql connection
import { bookRatings } from "../db/schema.ts"; // book ratings table definition
import { requireAuth } from "../auth/middleware.ts"; // existing login check
import { saveRatingBody } from "../../../shared/ratings.ts";

// create an express router for rating-related endpoints
export const ratingsRouter: Router = Router();

// define PUT /api/ratings endpoint for saving or updating the user's rating of a book
ratingsRouter.put("/", requireAuth, async (req, res) => {
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
});
