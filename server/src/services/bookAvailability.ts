import { getISBNsForWork } from "./openLibrary.ts";
import { checkIsbnAvailability } from "./searchlibrary.ts";

export async function checkBookAvailability(workKey: string, maxLookups = 10) {
  const { isbn_13, isbn_10 } = await getISBNsForWork(workKey);

  for (const isbn of [...isbn_13, ...isbn_10].slice(0, maxLookups)) {
    const result = await checkIsbnAvailability(isbn);
    if (result) return result;
  }

  return null;
}