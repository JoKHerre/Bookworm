const MAX_POSTGRES_INTEGER = 2_147_483_647;

// A path ID: decimal digits naming an integer from 1 to PostgreSQL's integer
// limit. Anything else (negatives, decimals, exponents, overflow) gives null.
export function parsePositiveId(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= MAX_POSTGRES_INTEGER ? id : null;
}
