import { searchLibraryByTitle } from "../src/services/searchlibrary.ts";
import type { BookFormat } from "../../shared/titleSearch.ts";

const title = process.argv[2] ?? "harry potter";
const format = (process.argv[3] ?? "book") as BookFormat;
console.log(`Searching SCPL for: ${title} as ${format}`);

const start = Date.now();
try {
  const results = await searchLibraryByTitle(
    title,
    format,
    AbortSignal.timeout(40_000),
  );
  console.log(`${results.length} result(s) in ${Date.now() - start} ms:`);
  console.table(results);
} catch (error) {
  console.error(`Search failed after ${Date.now() - start} ms:`, error);
}