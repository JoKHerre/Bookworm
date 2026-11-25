import z from "zod";
import { READING_STATUSES } from "../../shared/readingStatus";
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

const readingStatusResponse = z.object({
  id: z.number().int().positive(),
  readingStatus: z.enum(READING_STATUSES),
});

export async function updateReadingStatus(
  id: number,
  readingStatus: ReadingStatus,
) {
  const response = await apiRequest<ReadingStatusResponse>(
    `/api/library/${id}/reading-status`,
    { method: "PATCH", body: { readingStatus } },
  );
  const parsed = readingStatusResponse.safeParse(response);
  if (!parsed.success || parsed.data.id !== id)
    throw new Error("Could not update this book's reading status.");
  return parsed.data;
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
      byStatus: { 401: "Your session has expired. Please log in again." },
    });
  }
  const isKeys = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((key) => typeof key === "string");
  if (!isKeys(data?.added) || !isKeys(data.alreadySaved)) {
    throw new Error(IMPORT_ERROR);
  }
  return { added: data.added, alreadySaved: data.alreadySaved };
}
