import type {
  ImportBooksResponse,
  LibraryResponse,
  ReadingStatusResponse,
  SaveBookResponse,
} from "../../shared/library";
import type { ReadingStatus } from "../../shared/readingStatus";
import { apiRequest, userError } from "./client";

// These throw ApiRequestError; callers word the error for the book involved.

export function getLibrary(signal?: AbortSignal) {
  return apiRequest<LibraryResponse>("/api/library", { signal });
}

export function saveBook(bookKey: string) {
  return apiRequest<SaveBookResponse>("/api/library", {
    method: "POST",
    body: { bookKey },
  });
}

export async function removeSavedBook(id: number) {
  await apiRequest<null>(`/api/library/${id}`, { method: "DELETE" });
}

export function updateReadingStatus(id: number, readingStatus: ReadingStatus) {
  return apiRequest<ReadingStatusResponse>(
    `/api/library/${id}/reading-status`,
    { method: "PATCH", body: { readingStatus } },
  );
}

const IMPORT_ERROR = "Could not import these books.";

// save many books to the signed-in user's library
export async function importBooks(
  bookKeys: string[],
  signal?: AbortSignal,
): Promise<ImportBooksResponse> {
  let data: Partial<ImportBooksResponse> | null;
  try {
    data = await apiRequest<Partial<ImportBooksResponse> | null>(
      "/api/library/import",
      { method: "POST", body: { bookKeys }, signal },
    );
  } catch (err) {
    throw userError(err, {
      fallback: IMPORT_ERROR,
      byStatus: { 401: "Your session has expired. Please sign in again." },
    });
  }
  if (
    typeof data?.added !== "number" ||
    typeof data.alreadySaved !== "number"
  ) {
    throw new Error(IMPORT_ERROR);
  }
  return { added: data.added, alreadySaved: data.alreadySaved };
}
