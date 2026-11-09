import z from "zod";

export const openLibraryWorkKey = z
  .string({ error: "Invalid book key" })
  .regex(/^\/works\/OL\d+W$/, "Invalid book key");

// GET /api/books/search?q=...&genre=...&language=...&year=...

export const bookSearchQuery = z.object({
  q: z
    .string({ error: "Please enter a book title or author" })
    .trim()
    .min(1, "Please enter a book title or author"),
  genre: z
    .array(
      z.enum([
        "Fantasy",
        "Sci-fi",
        "Mystery",
        "Romance",
        "Horror",
        "History",
        "Thriller",
        "Adventure",
        "Biography",
        "Non-fiction",
        "Poetry",
      ]),
    )
    .default([]),
  language: z.enum(["", "English", "Spanish", "French"]).default(""),
  year: z
    .enum([
      "",
      "2020-present",
      "2010-2019",
      "2000-2009",
      "1990-1999",
      "1980-1989",
      "1970-1979",
      "1950-1969",
      "1900-1949",
      "before-1900",
    ])
    .default(""),
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

// GET /api/books/isbns?key=/works/OL...W&language=eng|all

export const bookISBNsQuery = z.object({
  key: openLibraryWorkKey,
  language: z.enum(["eng", "all"]).default("eng"),
});

export type BookISBNsQuery = z.infer<typeof bookISBNsQuery>;

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
