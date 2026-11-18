import type {
  BookRatingResponse,
  BookRatingsResponse,
} from "../../shared/ratings";
import { apiRequest, userError } from "./client";

// save (or update) the signed-in user's rating of a book
export async function saveRating(
  bookKey: string,
  rating: number,
): Promise<BookRatingResponse> {
  try {
    return await apiRequest<BookRatingResponse>("/api/ratings", {
      method: "PUT",
      body: { bookKey, rating },
    });
  } catch (err) {
    throw userError(err, {
      fallback: "Could not save your rating.",
      byStatus: {
        0: "Unable to connect.",
        401: "Please sign in to rate books.",
      },
      useServerMessage: true,
    });
  }
}

// fetch all of the signed-in user's ratings
export async function getRatings(
  signal?: AbortSignal,
): Promise<BookRatingResponse[]> {
  try {
    const data = await apiRequest<BookRatingsResponse>("/api/ratings", {
      signal,
    });
    return data.ratings;
  } catch (err) {
    throw userError(err, { fallback: "Could not load your ratings." });
  }
}
