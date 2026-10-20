import z from "zod";

export const credentials = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
});

export type Credentials = z.infer<typeof credentials>;

export const publicUser = z.object({
  id: z.number(),
  email: z.string(),
});

export type PublicUser = z.infer<typeof publicUser>;
