import z from "zod";

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
