import type {
  BookDetails,
  BookISBNs,
  BookSearchResponse,
} from "../shared/books";

async function get<T>(
  path: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/books/${path}?${params}`, { signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error("Unable to connect. Please try again.", { cause: err });
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Unable to load books. Please try again.",
    );
  }
  if (!data || typeof data !== "object") {
    throw new Error("Unable to read the response. Please try again.");
  }
  return data as T;
}

export function searchBooks(query: string, signal: AbortSignal) {
  return get<BookSearchResponse>(
    "search",
    new URLSearchParams({ q: query }),
    signal,
  );
}

export function getBookDetails(key: string, signal: AbortSignal) {
  return get<BookDetails>("details", new URLSearchParams({ key }), signal);
}

export function getBookISBNs(key: string, signal: AbortSignal) {
  return get<BookISBNs>("isbns", new URLSearchParams({ key }), signal);
}
