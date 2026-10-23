import type z from "zod";

import {
  openLibrarySearchResponse,
  openLibraryWork,
  openLibraryEditionsResponse,
} from "../../../shared/openLibrary.ts";

import {
  openLibraryWorkKey,
  type BookDetails,
  type BookISBNs,
  type BookSearchResponse,
} from "../../../shared/books.ts";

const BASE_URL = "https://openlibrary.org";
const EDITIONS_PAGE_SIZE = 100;

export class OpenLibraryError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenLibraryError";
    this.status = status;
  }
}

async function fetchOpenLibrary<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.infer<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new OpenLibraryError(
      `Open Library request failed: ${response.status}`,
      response.status,
    );
  }

  const rawData: unknown = await response.json();

  return schema.parse(rawData);
}

export async function searchOpenLibrary(
  query: string,
): Promise<BookSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    fields: "key,title,author_name,first_publish_year,cover_i",
    limit: "20",
  });

  const data = await fetchOpenLibrary(
    `/search.json?${params.toString()}`,
    openLibrarySearchResponse,
  );

  return {
    books: data.docs,
    total: data.numFound ?? data.num_found ?? 0,
  };
}

async function getWork(key: string) {
  return fetchOpenLibrary(`${key}.json`, openLibraryWork);
}

async function getEditions(key: string, limit: number, offset: number) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return fetchOpenLibrary(
    `${key}/editions.json?${params.toString()}`,
    openLibraryEditionsResponse,
  );
}

export async function getISBNsForWork(workKey: string): Promise<BookISBNs> {
  const key = openLibraryWorkKey.parse(workKey);
  const isbn13Set = new Set<string>();
  const isbn10Set = new Set<string>();

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await getEditions(key, EDITIONS_PAGE_SIZE, offset);

    for (const edition of data.entries) {
      for (const isbn of edition.isbn_13 ?? []) {
        isbn13Set.add(isbn);
      }

      for (const isbn of edition.isbn_10 ?? []) {
        isbn10Set.add(isbn);
      }
    }

    offset += data.entries.length;

    hasMore = data.entries.length > 0 && offset < data.size;
  }

  return {
    isbn_13: Array.from(isbn13Set).sort(),
    isbn_10: Array.from(isbn10Set).sort(),
  };
}

export async function getBookDetails(workKey: string): Promise<BookDetails> {
  const key = openLibraryWorkKey.parse(workKey);
  const work = await getWork(key);

  return {
    key: work.key,
    title: work.title,
    description: work.description,
    first_publish_date: work.first_publish_date,
    covers: work.covers,
    subjects: work.subjects,
  };
}