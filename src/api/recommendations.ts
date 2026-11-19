import { recommendationsResponse } from "../../shared/books";
import { apiRequest, userError } from "./client";

const FALLBACK = "Could not load recommendations.";

// books picked from the genres the signed-in user likes
export async function getRecommendations(signal?: AbortSignal) {
  let data: unknown;
  try {
    data = await apiRequest<unknown>("/api/recommendations", { signal });
  } catch (err) {
    throw userError(err, {
      fallback: FALLBACK,
      byStatus: { 0: "Unable to connect." },
    });
  }
  const parsed = recommendationsResponse.safeParse(data);
  if (!parsed.success) throw new Error(FALLBACK);
  return parsed.data.books;
}
