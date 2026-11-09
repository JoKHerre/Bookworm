import type z from "zod";

import {
  openLibrarySearchResponse,
  openLibraryWork,
  openLibraryAuthor,
  openLibraryEditionsResponse,
} from "../../../shared/openLibrary.ts";

import {
  openLibraryWorkKey,
  type BookDetails,
  type BookISBNFormat,
  type BookISBNs,
  type BookISBNsQuery,
  type BookSearchQuery,
  type BookSearchResponse,
} from "../../../shared/books.ts";

const BASE_URL = "https://openlibrary.org";
const EDITIONS_PAGE_SIZE = 100;

const languageCodes = {
  English: "eng",
  Spanish: "spa",
  French: "fre",
};

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

  const filteredQuery = constraints.length
    ? `(${query.q}) AND ${constraints.join(" AND ")}`
    : query.q;
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
  workKey: string,
  language: BookISBNsQuery["language"] = "eng",
  format: BookISBNsQuery["format"] = "all",
): Promise<BookISBNs> {
  const key = openLibraryWorkKey.parse(workKey);
  const isbnSets = {
    physical: { isbn_13: new Set<string>(), isbn_10: new Set<string>() },
    ebook: { isbn_13: new Set<string>(), isbn_10: new Set<string>() },
    other: { isbn_13: new Set<string>(), isbn_10: new Set<string>() },
  };

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await getEditions(key, EDITIONS_PAGE_SIZE, offset);

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

    offset += data.entries.length;

    hasMore = data.entries.length > 0 && offset < data.size;
  }

  return {
    groups: {
      physical: sortedISBNs(isbnSets.physical),
      ebook: sortedISBNs(isbnSets.ebook),
      other: sortedISBNs(isbnSets.other),
    },
  };
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
            const data = await fetchOpenLibrary(
              `${author.key}.json`,
              openLibraryAuthor,
            );
            return data.name;
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
  };
}
