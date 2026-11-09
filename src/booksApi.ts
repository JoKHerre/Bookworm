import {
  bookISBNs,
  type BookDetails,
  type BookISBNs,
  type BookISBNsQuery,
  type BookSearchQuery,
  type BookSearchResponse,
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

export function searchBooks(
  query: string,
  signal: AbortSignal,
  filters: Partial<Omit<BookSearchQuery, "q">> = {},
) {
  const params = new URLSearchParams({ q: query });
  for (const genre of filters.genre ?? []) params.append("genre", genre);
  if (filters.language) params.set("language", filters.language);
  if (filters.year) params.set("year", filters.year);

  return get<BookSearchResponse>("search", params, signal);
}

export function getBookSuggestions(query: string, signal: AbortSignal) {
  return get<BookSearchResponse>(
    "suggestions",
    new URLSearchParams({ q: query }),
    signal,
  );
}

export function getBookDetails(
  key: string,
  signal: AbortSignal,
  includeAuthors = true,
) {
  return get<BookDetails>(
    "details",
    new URLSearchParams({ key, includeAuthors: String(includeAuthors) }),
    signal,
  );
}

export async function getBookISBNs(
  key: string,
  signal: AbortSignal,
  language: BookISBNsQuery["language"] = "eng",
  format: BookISBNsQuery["format"] = "all",
) {
  const data = await get<BookISBNs>(
    "isbns",
    new URLSearchParams({ key, language, format }),
    signal,
  );
  const parsed = bookISBNs.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unable to read ISBNs. Please try again.");
  }
  return parsed.data;
}
