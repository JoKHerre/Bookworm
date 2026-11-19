import z from "zod";
import { BOOK_GENRES, type BookGenre } from "./books.ts";

// PUT /api/interests body: the full list of genres the signed-in user likes
export const saveInterestsBody = z.strictObject({
  genres: z.array(z.enum(BOOK_GENRES)),
});

// GET and PUT /api/interests response, in BOOK_GENRES order
export interface InterestsResponse {
  genres: BookGenre[];
}

export function sortGenres(genres: readonly BookGenre[]): BookGenre[] {
  return BOOK_GENRES.filter((genre) => genres.includes(genre));
}
