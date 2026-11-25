import z from "zod";
import { openLibraryWorkKey } from "./books.ts";

// GET /api/books/content-warnings?key=/works/OL...W
export const contentWarningsQuery = z.object({ key: openLibraryWorkKey });

// https://triggerwarningdatabase.com/masterlist-tw/
export const CONTENT_WARNINGS = [
  { id: "abandonment", label: "Abandonment" },
  { id: "alcohol-consumption-abuse", label: "Alcohol Consumption & Abuse" },
  { id: "alcoholism", label: "Alcoholism" },
  { id: "alzheimers-disease", label: "Alzheimer's Disease" },
  {
    id: "animal-cruelty-abuse-torture",
    label: "Animal Cruelty, Abuse & Torture",
  },
  { id: "animal-death-death-of-a-pet", label: "Animal Death & Death of a Pet" },
  { id: "anxiety-panic-attacks", label: "Anxiety & Panic Attacks" },
  { id: "blood-gore-depiction", label: "Blood & Gore Depiction" },
  { id: "bullying-hazing", label: "Bullying & Hazing" },
  { id: "car-accident", label: "Car Accident" },
  { id: "child-abuse-neglect", label: "Child Abuse & Neglect" },
  { id: "dead-bodies-body-parts", label: "Dead Bodies & Body Parts" },
  { id: "death-of-a-child", label: "Death of a Child" },
  { id: "death-of-a-parent-guardian", label: "Death of a Parent & Guardian" },
  { id: "death-of-a-partner-spouse", label: "Death of a Partner & Spouse" },
  { id: "death-of-a-sibling", label: "Death of a Sibling" },
  { id: "depression", label: "Depression" },
  { id: "domestic-abuse-violence", label: "Domestic Abuse & Violence" },
  { id: "drug-use-abuse", label: "Drug Use & Abuse" },
  { id: "drugging", label: "Drugging" },
  { id: "emotional-abuse-gaslighting", label: "Emotional Abuse & Gaslighting" },
  { id: "gun-violence", label: "Gun Violence" },
  { id: "homophobia", label: "Homophobia" },
  { id: "loss-of-autonomy", label: "Loss of Autonomy" },
  { id: "mental-illness", label: "Mental Illness" },
  { id: "miscarriage", label: "Miscarriage" },
  { id: "misogyny-sexism", label: "Misogyny & Sexism" },
  { id: "murder-attempted-murder", label: "Murder & Attempted Murder" },
  { id: "overdose", label: "Overdose" },
  { id: "paedophilia-grooming-csa", label: "Paedophilia, Grooming & CSA" },
  { id: "pregnancy", label: "Pregnancy" },
  { id: "racism", label: "Racism" },
  { id: "rape", label: "Rape" },
  { id: "self-harm", label: "Self-Harm" },
  { id: "sexual-assault", label: "Sexual Assault" },
  { id: "sexual-harassment", label: "Sexual Harassment" },
  { id: "stalking", label: "Stalking" },
  { id: "substance-addiction", label: "Substance Addiction" },
  { id: "suicide-attempted-suicide", label: "Suicide & Attempted Suicide" },
  { id: "terminal-illness", label: "Terminal Illness" },
  { id: "transphobia", label: "Transphobia" },
] as const;

export const contentWarningId = z.enum(
  CONTENT_WARNINGS.map((warning) => warning.id),
);
export type ContentWarningId = z.infer<typeof contentWarningId>;

export const contentWarningsResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    warnings: z.array(z.string()).nonempty(),
    categoryIds: z.array(contentWarningId),
    sourceUrl: z.url(),
  }),
  z.object({
    status: z.literal("not_found"),
    sourceUrl: z.url(),
  }),
  z.object({
    status: z.literal("unavailable"),
    sourceUrl: z.url().nullable(),
  }),
]);

export type ContentWarningsResponse = z.infer<typeof contentWarningsResponse>;

export function shouldExcludeForWarnings(
  result: ContentWarningsResponse,
  excludedIds: readonly ContentWarningId[],
): boolean {
  return (
    result.status === "found" &&
    result.categoryIds.some((id) => excludedIds.includes(id))
  );
}
