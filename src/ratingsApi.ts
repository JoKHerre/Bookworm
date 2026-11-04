import type { BookRatingResponse } from "../shared/ratings";

// save (or update) the signed-in user's rating of a book via PUT /api/ratings
export async function saveRating(
  bookKey: string,
  rating: number,
): Promise<BookRatingResponse> {
  let response: Response;
  try {
    response = await fetch("/api/ratings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookKey, rating }),
    });
  } catch (err) {
    throw new Error("Unable to connect. Please try again.", { cause: err });
  }

  if (response.status === 401) {
    throw new Error("Please sign in to rate books.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Could not save your rating. Please try again.",
    );
  }
  return data as BookRatingResponse;
}
