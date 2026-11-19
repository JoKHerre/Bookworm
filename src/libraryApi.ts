import z from "zod";
import { READING_STATUSES, type ReadingStatus } from "../shared/readingStatus";

const IMPORT_ERROR = "Could not import these books. Please try again.";

export interface ImportBooksResult {
  added: number;
  alreadySaved: number;
}

// save many books to the signed-in user's library via POST /api/library/import
export async function importBooks(
  bookKeys: string[],
  signal?: AbortSignal,
): Promise<ImportBooksResult> {
  let response: Response;
  try {
    response = await fetch("/api/library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookKeys }),
      signal,
    });
  } catch (err) {
    throw new Error(IMPORT_ERROR, { cause: err });
  }

  if (response.status === 401) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok) throw new Error(IMPORT_ERROR);

  const data = (await response
    .json()
    .catch(() => null)) as Partial<ImportBooksResult> | null;
  if (
    typeof data?.added !== "number" ||
    typeof data.alreadySaved !== "number"
  ) {
    throw new Error(IMPORT_ERROR);
  }
  return { added: data.added, alreadySaved: data.alreadySaved };
}

export class LibraryApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const readingStatusResponse = z.object({
  id: z.number().int().positive(),
  readingStatus: z.enum(READING_STATUSES),
});

export async function updateBookReadingStatus(
  id: number,
  readingStatus: ReadingStatus,
): Promise<ReadingStatus> {
  const message =
    "Could not update this book's reading status. Please try again.";
  let response: Response;
  try {
    response = await fetch(`/api/library/${id}/reading-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingStatus }),
    });
  } catch (error) {
    throw new Error(message, { cause: error });
  }
  if (!response.ok) {
    throw new LibraryApiError(
      response.status,
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : response.status === 404
          ? "This book is no longer in your library."
          : message,
    );
  }
  const parsed = readingStatusResponse.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success || parsed.data.id !== id) throw new Error(message);
  return parsed.data.readingStatus;
}
