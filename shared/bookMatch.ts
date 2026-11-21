// When an imported row counts as a match for an Open Library book.
//
// Lookup order for a row:
// 1. A valid book_key is used as is.
// 2. A row with an ISBN takes the work of the first Open Library result for
//    that ISBN.
// 3. Otherwise, or if the ISBN finds nothing, the title and author search
//    results are matched with matchTitle.

import z from "zod";
import { bookSearchResult, type BookSearchResult } from "./books.ts";
import { MAX_AUTHOR_LENGTH, MAX_TITLE_LENGTH } from "./csvImport.ts";
import { hasValidIsbnChecksum } from "./isbn.ts";

export const MATCH_MAX_CANDIDATES = 5;
export const IMPORT_MATCH_BATCH_SIZE = 25;

// POST /api/books/match. Rows with a book_key are not sent.
export const matchImportRequest = z
  .object({
    rows: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
            author: z.string().trim().max(MAX_AUTHOR_LENGTH),
            isbn: z
              .string()
              .refine((isbn) => isbn === "" || hasValidIsbnChecksum(isbn)),
          })
          .strict(),
      )
      .min(1)
      .max(IMPORT_MATCH_BATCH_SIZE),
  })
  .strict();

export type MatchImportRow = z.infer<typeof matchImportRequest>["rows"][number];

export const importMatch = z.discriminatedUnion("status", [
  z.object({ status: z.literal("matched"), book: bookSearchResult }),
  z.object({
    status: z.literal("ambiguous"),
    candidates: z.array(bookSearchResult),
  }),
  z.object({ status: z.literal("none") }),
  // Open Library failed for this row
  z.object({ status: z.literal("failed") }),
]);

export type ImportMatch = z.infer<typeof importMatch>;

export const matchImportResponse = z.object({
  results: z.array(importMatch),
});

export type MatchImportResponse = z.infer<typeof matchImportResponse>;

export type TitleMatch =
  | { status: "matched"; book: BookSearchResult }
  | { status: "ambiguous"; candidates: BookSearchResult[] }
  | { status: "none" };

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return normalize(title).replace(/^(the|a|an) /, "");
}

export function titlesMatch(rowTitle: string, candidateTitle: string): boolean {
  const row = normalizeTitle(rowTitle);
  if (!row) return false;
  if (row === normalizeTitle(candidateTitle)) return true;

  const rowMain = normalizeTitle(rowTitle.split(":")[0]!);
  return (
    rowMain !== "" && rowMain === normalizeTitle(candidateTitle.split(":")[0]!)
  );
}

function normalizeAuthor(name: string): string {
  const parts = name.split(",");
  return normalize(parts.length === 2 ? `${parts[1]} ${parts[0]}` : name);
}

function surname(name: string): string {
  return name.slice(name.lastIndexOf(" ") + 1);
}

export function authorsMatch(
  rowAuthor: string,
  candidateAuthors: readonly string[],
): boolean {
  const row = normalizeAuthor(rowAuthor);
  if (!row) return false;
  return candidateAuthors.some((author) => {
    const candidate = normalizeAuthor(author);
    return (
      candidate !== "" &&
      (candidate === row || surname(candidate) === surname(row))
    );
  });
}

// candidates are in Open Library's search order
export function matchTitle(
  row: { title: string; author: string },
  candidates: readonly BookSearchResult[],
): TitleMatch {
  const passing = candidates.filter(
    (book) =>
      titlesMatch(row.title, book.title) &&
      (!row.author.trim() || authorsMatch(row.author, book.author_name ?? [])),
  );

  // Open Library often has several works for one book, so only books by
  // different authors make a row without an author ambiguous
  const byAuthor = new Map<string, BookSearchResult>();
  for (const book of passing) {
    // by surname, so "Herman Hesse" and "Hermann Hesse" are one author
    const author = surname(normalizeAuthor(book.author_name?.[0] ?? ""));
    if (!byAuthor.has(author)) byAuthor.set(author, book);
  }

  const [first] = passing;
  if (!first) return { status: "none" };
  if (row.author.trim() || byAuthor.size === 1) {
    return { status: "matched", book: first };
  }
  return {
    status: "ambiguous",
    candidates: [...byAuthor.values()].slice(0, MATCH_MAX_CANDIDATES),
  };
}
