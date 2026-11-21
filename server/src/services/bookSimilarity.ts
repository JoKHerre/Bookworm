import {
  openLibraryWorkKey,
  SIMILAR_BOOKS_LIMIT,
  type BookSearchResult,
} from "../../../shared/books.ts";
import { openLibrarySimilarBook } from "./openLibrarySchemas.ts";

const MAX_QUERY_SUBJECTS = 10;

const CATALOG_SUBJECTS = new Set([
  "new york times bestseller",
  "new york times reviewed",
  "open library staff picks",
  "open_syllabus_project",
]);

export function getSimilarityProfile(subjects: string[] = []) {
  const normalizedSubjects = normalizeSubjects(subjects);

  return {
    subjects: new Set(normalizedSubjects),
    querySubjects: normalizedSubjects.slice(0, MAX_QUERY_SUBJECTS),
  };
}

export function rankSimilarBooks(
  workKey: string,
  source: ReturnType<typeof getSimilarityProfile>,
  docs: unknown[],
): BookSearchResult[] {
  if (source.subjects.size === 0) return [];

  const seen = new Set<string>();
  const ranked: { book: BookSearchResult; score: number }[] = [];

  for (const doc of docs) {
    const result = toWorkResult(doc);
    if (!result) continue;

    const { book, subject: rawSubjects } = result;
    if (book.key === workKey || seen.has(book.key)) continue;

    const candidateSubjects = normalizeSubjects(rawSubjects);
    const sharedCount = candidateSubjects.filter((subject) =>
      source.subjects.has(subject),
    ).length;
    if (sharedCount === 0) continue;

    // Cosine similarity, independent of the other search results.
    const score =
      sharedCount / Math.sqrt(source.subjects.size * candidateSubjects.length);
    seen.add(book.key);
    ranked.push({ book, score });
  }

  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      normalizeText(left.book.title).localeCompare(
        normalizeText(right.book.title),
      ) ||
      left.book.key.localeCompare(right.book.key),
  );
  return ranked.slice(0, SIMILAR_BOOKS_LIMIT).map(({ book }) => book);
}

// A search record with a canonical work key, or null when it's unusable.
export function toWorkResult(doc: unknown) {
  const parsed = openLibrarySimilarBook.safeParse(doc);
  if (!parsed.success) return null;

  const { subject = [], ...book } = parsed.data;
  if (book.key.startsWith("OL")) book.key = `/works/${book.key}`;
  if (!openLibraryWorkKey.safeParse(book.key).success) return null;
  return { book, subject };
}

function normalizeSubjects(subjects: string[]) {
  const normalized = subjects
    .map(normalizeText)
    .filter((subject) => subject.length > 0 && !isNoiseSubject(subject));
  return [...new Set(normalized)];
}

function normalizeText(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function isNoiseSubject(subject: string) {
  return (
    subject.includes(":") ||
    CATALOG_SUBJECTS.has(subject) ||
    /^(accessible book|protected daisy|in library|large type|reading level)/.test(
      subject,
    )
  );
}
