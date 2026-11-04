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

export type SaveRatingBody = z.infer<typeof saveRatingBody>;

export interface BookRatingResponse {
  bookKey: string;
  rating: number;
}
