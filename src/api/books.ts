import {
  ISBN_EDITIONS_PAGE_SIZE,
  bookISBNs,
  type BookDetails,
  type BookISBNs,
  type BookISBNsQuery,
  type BookSearchQuery,
  type BookSearchResponse,
} from "../../shared/books";
import { availabilityResponse } from "../../shared/availability";
import { titleSearchResponse, type BookFormat } from "../../shared/titleSearch";
import { apiRequest, userError } from "./client";

async function get<T>(
  path: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<T> {
  let data: T | null;
  try {
    data = await apiRequest<T | null>(`/api/books/${path}?${params}`, {
      signal,
    });
  } catch (err) {
    throw userError(err, {
      fallback: "Unable to load books.",
      byStatus: { 0: "Unable to connect." },
      useServerMessage: true,
    });
  }
  if (!data || typeof data !== "object") {
    throw new Error("Unable to read the response.");
  }
  return data;
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
  options: Partial<Omit<BookISBNsQuery, "key">> = {},
) {
  const {
    language = "eng",
    format = "all",
    offset = 0,
    limit = ISBN_EDITIONS_PAGE_SIZE,
  } = options;
  const data = await get<BookISBNs>(
    "isbns",
    new URLSearchParams({
      key,
      language,
      format,
      offset: String(offset),
      limit: String(limit),
    }),
    signal,
  );
  const parsed = bookISBNs.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.pagination.offset !== offset ||
    parsed.data.pagination.editionsChecked > limit
  ) {
    throw new Error("Unable to read ISBNs.");
  }
  return parsed.data;
}

export async function getBookAvailability(key: string, signal: AbortSignal) {
  const data = await get<unknown>(
    "availability",
    new URLSearchParams({ key }),
    signal,
  );
  const parsed = availabilityResponse.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unable to read library availability.");
  }
  return parsed.data;
}

export async function searchLibraryByTitle(
  title: string,
  format: BookFormat,
  signal: AbortSignal,
) {
  const data = await get<unknown>(
    "library-search",
    new URLSearchParams({ title, format }),
    signal,
  );
  const parsed = titleSearchResponse.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unable to read library search results.");
  }
  return parsed.data;
}
