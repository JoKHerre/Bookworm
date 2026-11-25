export const SCPL_BRANCHES = [
  "Aptos",
  "Boulder Creek",
  "Branciforte",
  "Capitola",
  "Downtown",
  "Felton",
  "Garfield Park",
  "La Selva Beach",
  "Live Oak",
  "Scotts Valley",
] as const;

export type BranchName = (typeof SCPL_BRANCHES)[number];

export function isBranchName(value: unknown): value is BranchName {
  return SCPL_BRANCHES.some((b) => b === value);
}
