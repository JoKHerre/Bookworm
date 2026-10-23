import z from "zod";

import { bookSearchResult } from "./books.ts";

export const openLibrarySearchResponse = z.object({
  docs: z.array(bookSearchResult),
  numFound: z.number().optional(),
  num_found: z.number().optional(),
});

export const openLibraryWork = z.object({
  key: z.string(),
  title: z.string(),
  description: z
    .union([z.string(), z.object({ value: z.string() })])
    .optional(),
  first_publish_date: z.string().optional(),
  covers: z.array(z.number()).optional(),
  subjects: z.array(z.string()).optional(),
});

export const openLibraryEdition = z.object({
  key: z.string(),
  isbn_13: z.array(z.string()).optional(),
  isbn_10: z.array(z.string()).optional(),
});

export const openLibraryEditionsResponse = z.object({
  size: z.number(),
  entries: z.array(openLibraryEdition),
});
