import { ISBN_EDITIONS_PAGE_SIZE } from "../../../shared/books.ts";
import type { AvailabilityResponse } from "../../../shared/availability.ts";
import { getISBNsForWork } from "./openLibrary.ts";
import { checkIsbnAvailability } from "./searchlibrary.ts";

// Reaching a search limit is an incomplete lookup, not a catalog miss.
const MAX_CATALOG_LOOKUPS = 10;
const LOOKUP_TIMEOUT_MS = 20_000;

export async function checkBookAvailability(
  workKey: string,
  callerSignal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const deadline = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, deadline])
    : deadline;
  const seen = new Set<string>();
  let offset = 0;

  const incomplete = (
    reason: "isbn_limit" | "deadline",
  ): AvailabilityResponse => ({
    status: "incomplete",
    availability: null,
    reason,
  });

  try {
    while (true) {
      signal.throwIfAborted();
      const page = await getISBNsForWork(
        {
          key: workKey,
          language: "all",
          format: "all",
          offset,
          limit: ISBN_EDITIONS_PAGE_SIZE,
        },
        signal,
      );
      // Prefer physical books, then unknown formats and ebooks, within each page.
      const { physical, other, ebook } = page.groups;
      const isbns = [physical, other, ebook].flatMap((group) => [
        ...group.isbn_13,
        ...group.isbn_10,
      ]);
      for (const value of isbns) {
        const isbn = value.replace(/[^0-9Xx]/g, "").toUpperCase();
        if (!/^(?:\d{13}|\d{9}[\dX])$/.test(isbn) || seen.has(isbn)) {
          continue;
        }
        if (seen.size >= MAX_CATALOG_LOOKUPS) {
          return incomplete("isbn_limit");
        }
        signal.throwIfAborted();
        seen.add(isbn);
        const result = await checkIsbnAvailability(isbn, signal);
        signal.throwIfAborted();
        if (result) {
          return { status: "matched", availability: result };
        }
      }

      if (page.pagination.nextOffset === null) {
        return {
          status: "not_found",
          availability: null,
          reason: seen.size === 0 ? "no_isbns" : "no_match",
        };
      }
      if (seen.size >= MAX_CATALOG_LOOKUPS) {
        return incomplete("isbn_limit");
      }
      offset = page.pagination.nextOffset;
    }
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (deadline.aborted) return incomplete("deadline");
    throw error;
  }
}
