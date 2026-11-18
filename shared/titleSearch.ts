import z from "zod";

export const titleSearchResult = z.object({
  bibid: z.string().regex(/^\d+$/),
  title: z.string().trim().min(1),
  author: z.string().optional(),
  format: z.string().optional(),
});

export type TitleSearchResult = z.infer<typeof titleSearchResult>;

export const titleSearchResponse = z.object({
  results: z.array(titleSearchResult),
});

export type TitleSearchResponse = z.infer<typeof titleSearchResponse>;

export const bookFormat = z.enum(["book", "ebook"]);
export type BookFormat = z.infer<typeof bookFormat>;

// GET /api/books/library-search?title=...&format=book|ebook
export const titleSearchQuery = z.object({
  title: z.string().trim().min(1).max(200),
  format: bookFormat,
});

export type TitleSearchQuery = z.infer<typeof titleSearchQuery>;