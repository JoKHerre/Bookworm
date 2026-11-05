import z from "zod";

export const openLibraryWorkKey = z
  .string({ error: "Invalid book key" })
  .regex(/^\/works\/OL\d+W$/, "Invalid book key");

// GET /api/books/search?q=...

export const bookSearchQuery = z.object({
  q: z
    .string({ error: "Please enter a book title or author" })
    .trim()
    .min(1, "Please enter a book title or author"),
});

export type BookSearchQuery = z.infer<typeof bookSearchQuery>;

const suggestionStopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "before",
  "being",
  "between",
  "could",
  "does",
  "during",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "over",
  "same",
  "since",
  "some",
  "than",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "until",
  "very",
  "were",
  "with",
  "would",
  "your",
]);

export const bookSuggestionsQuery = z.object({
  q: z
    .string({ error: "Please enter a book title or author" })
    .trim()
    .min(3, "Please enter at least three characters")
    .refine((query) => {
      const words = query.toLowerCase().split(/\s+/);
      return words.length > 1 || !suggestionStopWords.has(words[0] ?? "");
    }, "Please enter a more specific query"),
});

export type BookSuggestionsQuery = z.infer<typeof bookSuggestionsQuery>;

export const bookSearchResult = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().optional(),
  cover_i: z.number().optional(),
});

export type BookSearchResult = z.infer<typeof bookSearchResult>;

export const bookSearchResponse = z.object({
  books: z.array(bookSearchResult),
  total: z.number(),
});

export type BookSearchResponse = z.infer<typeof bookSearchResponse>;

// GET /api/books/details?key=/works/OL...W

export const bookDetailsQuery = z.object({
  key: openLibraryWorkKey,
  includeAuthors: z.enum(["true", "false"]).optional(),
});

export type BookDetailsQuery = z.infer<typeof bookDetailsQuery>;

export const bookDetails = z.object({
  key: z.string(),
  authors: z.array(z.string()),
  title: z.string(),
  description: z
    .union([z.string(), z.object({ value: z.string() })])
    .optional(),
  first_publish_date: z.string().optional(),
  covers: z.array(z.number()).optional(),
  subjects: z.array(z.string()).optional(),
});

export type BookDetails = z.infer<typeof bookDetails>;

export const bookISBNs = z.object({
  isbn_13: z.array(z.string()),
  isbn_10: z.array(z.string()),
});

export type BookISBNs = z.infer<typeof bookISBNs>;

// Error body returned by any books route on failure

export const booksError = z.object({
  error: z.string(),
});

export type BooksError = z.infer<typeof booksError>;
