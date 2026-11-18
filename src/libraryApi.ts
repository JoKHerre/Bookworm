const IMPORT_ERROR = "Could not import these books.";

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
