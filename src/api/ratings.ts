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
        401: "Please log in to rate books.",
      },
      useServerMessage: true,
    });
  }
}

// fetch the signed-in user's ratings: all of them, or only bookKey's
export async function getRatings(
  signal?: AbortSignal,
  bookKey?: string,
): Promise<BookRatingResponse[]> {
  const query = bookKey ? `?${new URLSearchParams({ bookKey })}` : "";
  try {
    const data = await apiRequest<BookRatingsResponse>(`/api/ratings${query}`, {
      signal,
    });
    return data.ratings;
  } catch (err) {
    throw userError(err, { fallback: "Could not load your ratings." });
  }
}
