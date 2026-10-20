import z from "zod";

// GET /api/books/search?q=...

export const bookSearchQuery = z.object({
  q: z
    .string({ error: "Please enter a book title or author" })
    .trim()
    .min(1, "Please enter a book title or author"),
});

export type BookSearchQuery = z.infer<typeof bookSearchQuery>;

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
  key: z
    .string({ error: "Invalid book key" })
    .regex(/^\/works\/OL\d+W$/, "Invalid book key"),
});

export type BookDetailsQuery = z.infer<typeof bookDetailsQuery>;

export const bookDetails = z.object({
  key: z.string(),
  title: z.string(),
  description: z
    .union([z.string(), z.object({ value: z.string() })])
    .optional(),
  authors: z.array(z.string()),
  first_publish_date: z.string().optional(),
  covers: z.array(z.number()).optional(),
  subjects: z.array(z.string()).optional(),
});

export type BookDetails = z.infer<typeof bookDetails>;

// Error body returned by any books route on failure

export const booksError = z.object({
  error: z.string(),
});

export type BooksError = z.infer<typeof booksError>;
