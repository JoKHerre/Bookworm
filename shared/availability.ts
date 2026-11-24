import z from "zod";

// Santa Cruz Public Libraries' catalog, which availability is checked against
export const LIBRARY_CATALOG_SEARCH_URL =
  "https://catalog.santacruzpl.org/polaris/search/";
export const LIBRARY_CATALOG_CTX = "1.1033.0.0.1";

export function libraryCatalogRecordUrl(bibid: string): string {
  const url = new URL("title.aspx", LIBRARY_CATALOG_SEARCH_URL);
  url.searchParams.set("ctx", LIBRARY_CATALOG_CTX);
  url.searchParams.set("pos", "1");
  url.searchParams.set("cn", bibid);
  return url.toString();
}

export const availability = z.object({
  bibid: z.string().regex(/^\d+$/),
  title: z.string().trim().min(1),
  author: z.string().optional(),
  format: z.string().optional(),
  branches: z.record(
    z.string(),
    z.object({
      available: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  ),
});

export type Availability = z.infer<typeof availability>;

export const availabilityResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("matched"),
    availability,
  }),
  z.object({
    status: z.literal("not_found"),
    availability: z.null(),
    reason: z.enum(["no_isbns", "no_match"]),
  }),
  z.object({
    status: z.literal("incomplete"),
    availability: z.null(),
    reason: z.enum(["isbn_limit", "deadline"]),
  }),
]);

export type AvailabilityResponse = z.infer<typeof availabilityResponse>;
