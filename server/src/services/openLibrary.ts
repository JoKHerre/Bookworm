import type z from "zod";

import {
  openLibrarySearchResponse,
  openLibrarySimilarSearchResponse,
  openLibraryWork,
  openLibraryAuthor,
  openLibraryEditionsResponse,
} from "./openLibrarySchemas.ts";

import {
  bookISBNs,
  openLibraryWorkKey,
  similarBooksResponse,
  type BookDetails,
  type BookISBNFormat,
  type BookISBNs,
  type BookISBNsQuery,
  type BookSearchQuery,
  type BookSearchResponse,
  type SimilarBooksResponse,
} from "../../../shared/books.ts";
import { toTags } from "../../../shared/tags.ts";
import { PromiseCache } from "./cache.ts";
import { getSimilarityProfile, rankSimilarBooks } from "./bookSimilarity.ts";

const BASE_URL = "https://openlibrary.org";
const MAX_SIMILAR_CANDIDATES = 100;

const languageCodes = {
  English: "eng",
  Spanish: "spa",
  French: "fre",
};

// Works and authors rarely change, and the library page asks for every saved
// book's details on each load, so keep them for an hour.
const CACHE_TTL_MS = 60 * 60 * 1000;
const workCache = new PromiseCache<z.infer<typeof openLibraryWork>>(
  CACHE_TTL_MS,
  2000,
);
const authorNameCache = new PromiseCache<string | undefined>(
  CACHE_TTL_MS,
  2000,
);

// For tests that stub fetch with different responses for the same key.
export function clearOpenLibraryCache() {
  workCache.clear();
  authorNameCache.clear();
}

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
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
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

async function searchOpenLibraryQuery(
  query: string,
  limit: number,
): Promise<BookSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    fields: "key,title,author_name,first_publish_year,cover_i",
    limit: String(limit),
  });

  const data = await fetchOpenLibrary(
    `/search.json?${params.toString()}`,
    openLibrarySearchResponse,
  );

  return {
    books: data.docs.slice(0, limit),
    total: data.numFound ?? data.num_found ?? 0,
  };
}

export function searchOpenLibrary(
  query: BookSearchQuery,
): Promise<BookSearchResponse> {
  const constraints: string[] = [];

  if (query.genre.length) {
    const subjects = [...new Set(query.genre)].map((genre) => {
      let subject = genre.toLowerCase();
      if (genre === "Sci-fi") subject = "science fiction";
      if (genre === "Non-fiction") subject = "nonfiction";
      return `"${subject}"`;
    });
    constraints.push(`subject:(${subjects.join(" OR ")})`);
  }
  if (query.language) {
    constraints.push(`language:${languageCodes[query.language]}`);
  }
  if (query.year) {
    let range: string;
    if (query.year === "before-1900") {
      range = "* TO 1899";
    } else if (query.year === "2020-present") {
      range = `2020 TO ${new Date().getUTCFullYear()}`;
    } else {
      range = query.year.replace("-", " TO ");
    }
    constraints.push(`first_publish_year:[${range}]`);
  }

  // Escape the user's text so characters like ")" can't break out of the
  // group and skip the filters. Words such as OR still work as operators.
  const q = escapeOpenLibraryQueryText(query.q);
  const filteredQuery = constraints.length
    ? `(${q}) AND ${constraints.join(" AND ")}`
    : q;
  return searchOpenLibraryQuery(filteredQuery, 20);
}

const openLibraryQuerySpecialCharacters = new Set('+-&|!(){}[]^"~*?:\\/');

function escapeOpenLibraryQueryText(value: string): string {
  return Array.from(value)
    .map((character) =>
      openLibraryQuerySpecialCharacters.has(character)
        ? `\\${character}`
        : character,
    )
    .join("");
}

function toSuggestionQuery(query: string): string {
  const words = query.trim().split(/\s+/).map(escapeOpenLibraryQueryText);
  const lastIndex = words.length - 1;
  const lastWord = words[lastIndex];

  if (lastWord === undefined) {
    throw new Error("Please enter a book title or author");
  }

  words[lastIndex] = `${lastWord}*`;
  return words.join(" ");
}

export async function searchOpenLibrarySuggestions(
  query: string,
): Promise<BookSearchResponse> {
  return searchOpenLibraryQuery(toSuggestionQuery(query), 5).then(
    (results) => ({
      ...results,
      books: results.books.slice(0, 5),
    }),
  );
}

export async function getSimilarBooks(
  workKey: string,
  signal?: AbortSignal,
): Promise<SimilarBooksResponse> {
  const key = openLibraryWorkKey.parse(workKey);

  const controller = new AbortController();
  const requestSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  // One timer covers both requests and their body reads, rather than restarting
  // the budget when the candidate search begins.
  const timeout = setTimeout(() => {
    controller.abort(new Error("Similar books lookup timed out"));
  }, 10000);

  try {
    const work = await getWork(key, requestSignal);
    if (work.key !== key || !work.title.trim()) {
      throw new OpenLibraryError("Invalid source work", 502);
    }

    const profile = getSimilarityProfile(work.subjects);
    if (profile.subjects.size === 0) return { books: [] };

    const terms = profile.querySubjects.map(
      (subject) => `"${escapeOpenLibraryQueryText(subject)}"`,
    );
    const params = new URLSearchParams({
      q: `subject:(${terms.join(" OR ")})`,
      fields: "key,title,author_name,first_publish_year,cover_i,subject",
      limit: String(MAX_SIMILAR_CANDIDATES),
    });

    let data;
    try {
      data = await fetchOpenLibrary(
        `/search.json?${params.toString()}`,
        openLibrarySimilarSearchResponse,
        requestSignal,
      );
    } catch (error) {
      // A search endpoint's 404 is an upstream failure, not a missing source work.
      if (error instanceof OpenLibraryError && error.status === 404) {
        throw new OpenLibraryError("Similar book search failed", 502);
      }
      throw error;
    }

    return similarBooksResponse.parse({
      books: rankSimilarBooks(key, profile, data.docs),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getWork(key: string, signal?: AbortSignal) {
  return workCache.get(
    key,
    (shared) => fetchOpenLibrary(`${key}.json`, openLibraryWork, shared),
    signal,
  );
}

function getAuthorName(key: string) {
  return authorNameCache.get(key, (shared) =>
    fetchOpenLibrary(`${key}.json`, openLibraryAuthor, shared).then(
      ({ name }) => name,
    ),
  );
}

async function getEditions(
  key: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return fetchOpenLibrary(
    `${key}/editions.json?${params.toString()}`,
    openLibraryEditionsResponse,
    signal,
  );
}

const physicalBookFormats = new Set([
  "hardcover",
  "hardback",
  "paperback",
  "softcover",
  "softback",
  "mass market paperback",
  "trade paperback",
  "board book",
  "library binding",
  "school & library binding",
]);

const ebookFormats = new Set([
  "ebook",
  "e-book",
  "epub",
  "kindle",
  "kindle edition",
]);

function classifyEditionFormat(physicalFormat?: string): BookISBNFormat {
  const format =
    physicalFormat?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";

  // Only explicit book formats qualify. Missing, mixed, and audio formats stay other.
  if (physicalBookFormats.has(format)) return "physical";
  if (ebookFormats.has(format)) return "ebook";
  return "other";
}

function sortedISBNs(group: { isbn_13: Set<string>; isbn_10: Set<string> }) {
  return {
    isbn_13: Array.from(group.isbn_13).sort(),
    isbn_10: Array.from(group.isbn_10).sort(),
  };
}

export async function getISBNsForWork(
  query: BookISBNsQuery,
  signal?: AbortSignal,
): Promise<BookISBNs> {
  const { language, format, offset, limit } = query;
  const key = openLibraryWorkKey.parse(query.key);
  const isbnSets = {
    physical: { isbn_13: new Set<string>(), isbn_10: new Set<string>() },
    ebook: { isbn_13: new Set<string>(), isbn_10: new Set<string>() },
    other: { isbn_13: new Set<string>(), isbn_10: new Set<string>() },
  };

  const data = await getEditions(key, limit, offset, signal);
  if (data.entries.length > limit) {
    throw new OpenLibraryError("Invalid Open Library edition page", 502);
  }

  for (const edition of data.entries) {
    if (
      language === "eng" &&
      !edition.languages?.some(({ key }) => key === "/languages/eng")
    ) {
      continue;
    }

    const editionFormat = classifyEditionFormat(edition.physical_format);
    if (format !== "all" && format !== editionFormat) continue;
    const group = isbnSets[editionFormat];

    for (const isbn of edition.isbn_13 ?? []) {
      group.isbn_13.add(isbn);
    }

    for (const isbn of edition.isbn_10 ?? []) {
      group.isbn_10.add(isbn);
    }
  }

  const end = offset + data.entries.length;

  return bookISBNs.parse({
    groups: {
      physical: sortedISBNs(isbnSets.physical),
      ebook: sortedISBNs(isbnSets.ebook),
      other: sortedISBNs(isbnSets.other),
    },
    pagination: {
      offset,
      editionsChecked: data.entries.length,
      totalEditions: data.size,
      nextOffset: end < data.size ? end : null,
    },
  });
}

export async function getBookDetails(
  workKey: string,
  includeAuthors = true,
): Promise<BookDetails> {
  const key = openLibraryWorkKey.parse(workKey);
  const work = await getWork(key);

  const authors = includeAuthors
    ? await Promise.all(
        (work.authors ?? []).slice(0, 5).map(async ({ author }) => {
          try {
            return await getAuthorName(author.key);
          } catch (error) {
            console.error(`Failed to retrieve author ${author.key}:`, error);
            return undefined;
          }
        }),
      )
    : [];

  return {
    key: work.key,
    authors: authors.filter((name): name is string => Boolean(name)),
    title: work.title,
    description: work.description,
    first_publish_date: work.first_publish_date,
    covers: work.covers,
    subjects: work.subjects,
    tags: toTags(work.subjects),
  };
}
