import z from "zod";

export const availability = z.object({
  bibid: z.string(),
  title: z.string(),
  author: z.string().optional(),
  format: z.string().optional(),
  systemAvailable: z.number().optional(),
  systemTotal: z.number().optional(),
  branches: z.record(
    z.string(),
    z.object({ available: z.number(), total: z.number() }),
  ),
});

export type Availability = z.infer<typeof availability>;

export const availabilityResponse = z.object({
  availability: availability.nullable(),
});

export type AvailabilityResponse = z.infer<typeof availabilityResponse>;
