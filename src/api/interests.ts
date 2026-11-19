import type { BookGenre } from "../../shared/books";
import { interestsResponse } from "../../shared/interests";
import { apiRequest, userError } from "./client";

const CONNECTION_ERROR = "Unable to connect.";

// the genres the signed-in user likes
export async function getInterests(signal?: AbortSignal) {
  const fallback = "Could not load your genres.";
  let data: unknown;
  try {
    data = await apiRequest<unknown>("/api/interests", { signal });
  } catch (err) {
    throw userError(err, { fallback, byStatus: { 0: CONNECTION_ERROR } });
  }
  const parsed = interestsResponse.safeParse(data);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data.genres;
}

// replace the genres the signed-in user likes
export async function saveInterests(genres: BookGenre[]) {
  const fallback = "Could not save your genres.";
  let data: unknown;
  try {
    data = await apiRequest<unknown>("/api/interests", {
      method: "PUT",
      body: { genres },
    });
  } catch (err) {
    throw userError(err, { fallback, byStatus: { 0: CONNECTION_ERROR } });
  }
  const parsed = interestsResponse.safeParse(data);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data.genres;
}
