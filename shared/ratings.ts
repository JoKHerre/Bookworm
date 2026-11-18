import z from "zod";
import { openLibraryWorkKey } from "./books.ts";

export const MIN_RATING = 1;
export const MAX_RATING = 5;

// PUT /api/ratings body: save or update the signed-in user's rating of a book
export const saveRatingBody = z
  .object({
    bookKey: openLibraryWorkKey,
    rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  })
  .strict();

export interface BookRatingResponse {
  bookKey: string;
  rating: number;
}

// GET /api/ratings?bookKey=... query: optionally just one book's rating
export const ratingsQuery = z.strictObject({
  bookKey: openLibraryWorkKey.optional(),
});

// GET /api/ratings response: all of the signed-in user's ratings
export interface BookRatingsResponse {
  ratings: BookRatingResponse[];
}
