import * as cheerio from "cheerio";
import {
  contentWarningId,
  contentWarningsResponse,
  shouldExcludeForWarnings,
  type ContentWarningId,
  type ContentWarningsResponse,
} from "../../../shared/contentWarnings.ts";
import type { BookSearchResult } from "../../../shared/books.ts";
import { PromiseCache } from "./cache.ts";
import { getBookDetails } from "./openLibrary.ts";

const CONTENT_WARNING_SOURCE_URL = "https://triggerwarningdatabase.com/";
const SOURCE_ORIGIN = new URL(CONTENT_WARNING_SOURCE_URL).origin;
const SOURCE_REQUEST_TIMEOUT_MS = 5_000;
const LOOKUP_TIMEOUT_MS = 20_000;
const WARNING_CACHE_TTL_MS = 60 * 60 * 1_000;
const WARNING_CACHE_MAX_ENTRIES = 500;

type CachedWarnings = Exclude<
  ContentWarningsResponse,
  { status: "unavailable" }
>;
interface BookMetadata {
  title: string;
  authors: readonly string[];
}

const warningCache = new PromiseCache<CachedWarnings>(
  WARNING_CACHE_TTL_MS,
  WARNING_CACHE_MAX_ENTRIES,
);
let sourceQueue: Promise<unknown> = Promise.resolve();

export function clearContentWarningsCache() {
  warningCache.clear();
}

class WarningSourceError extends Error {
  readonly sourceUrl: string | null;

  constructor(sourceUrl: string | null) {
    super("Unable to retrieve content warnings");
    this.sourceUrl = sourceUrl;
  }
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return clean(value).toLowerCase();
}

function normalizeAuthor(value: string) {
  return clean(normalize(value).replace(/\./g, " "));
}

function matchesBook(heading: string, book: BookMetadata) {
  const titleAndAuthor = clean(heading).match(/^(.*)\s+by\s+(.+)$/i);
  if (!titleAndAuthor?.[1] || !titleAndAuthor[2]) return undefined;
  const title = titleAndAuthor[1];
  const authorText = titleAndAuthor[2];
  if (normalize(title) !== normalize(book.title)) return false;

  const authors = authorText.split(/\s+(?:&|and)\s+/i).map(normalizeAuthor);
  return book.authors.some((author) =>
    authors.includes(normalizeAuthor(author)),
  );
}

function entryUrl(value: string) {
  const url = new URL(value, CONTENT_WARNING_SOURCE_URL);
  if (url.origin !== SOURCE_ORIGIN || url.search) {
    throw new Error("Unexpected warning source URL");
  }
  url.hash = "";
  return url;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

function fetchSourcePage(url: URL, signal: AbortSignal) {
  const request = sourceQueue.then(async () => {
    signal.throwIfAborted();

    const response = await fetch(url, {
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(SOURCE_REQUEST_TIMEOUT_MS),
      ]),
      redirect: "error",
      headers: { "User-Agent": "Bookworm" },
    });

    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      await response.body?.cancel();
      throw new Error("Unable to read warning source page");
    }
    return await response.text();
  });
  sourceQueue = request.catch(() => {});
  return abortable(request, signal);
}

function findEntryUrl(html: string, book: BookMetadata) {
  const $ = cheerio.load(html);
  const searchPage = $("main#main");
  if (searchPage.length !== 1) {
    throw new Error("Unrecognized warning search page");
  }

  const posts = searchPage.children("article.type-post");
  if (!posts.length) {
    if (searchPage.find(".no-results").length) return undefined;
    if (!searchPage.children("article.type-page").length) {
      throw new Error("Missing warning search results");
    }
  }

  let matchedUrl: string | undefined;
  let unreadableResult = false;
  for (const element of posts.toArray()) {
    const heading = $(element).find(".entry-header .entry-title").first();
    const matches = matchesBook(heading.text(), book);
    if (matches === undefined) {
      unreadableResult = true;
      continue;
    }
    if (!matches) continue;

    const href = heading.find("a[rel~=bookmark]").attr("href");
    if (!href) throw new Error("Missing warning entry URL");
    const url = entryUrl(href).href;
    if (matchedUrl && matchedUrl !== url) {
      throw new Error("Multiple warning entries match this book");
    }
    matchedUrl = url;
  }

  if (matchedUrl) return matchedUrl;
  if (unreadableResult) throw new Error("Unreadable warning search result");
  if (searchPage.find("a.next[href], a[rel~=next][href]").length) {
    throw new Error("Warning search has unchecked pages");
  }
  return undefined;
}

function readEntry(html: string, book: BookMetadata, sourceUrl: string) {
  const $ = cheerio.load(html);
  const post = $("main#main > article.type-post");
  if (
    post.length !== 1 ||
    !matchesBook(
      post.children(".entry-header").find(".entry-title").text(),
      book,
    )
  ) {
    throw new Error("Warning entry does not identify the requested book");
  }

  const content = post.children(".entry-content");
  const warningHeadings = content.children().filter((_, element) => {
    const text = normalize($(element).text())
      .replace("&", "and")
      .replace(/:$/, "");
    return text === "trigger and content warnings";
  });
  if (warningHeadings.length !== 1) {
    throw new Error("Missing or repeated warning heading");
  }
  const list = warningHeadings.next("ul,ol");
  if (!list.length) {
    throw new Error("Missing warning list");
  }
  // Keep spaces between nested list items when reading their text.
  list.find("li").prepend(" ").append(" ");
  const warnings = list
    .children("li")
    .toArray()
    .map((item) => clean($(item).text()));
  if (!warnings.length || warnings.some((warning) => !warning)) {
    throw new Error("Unreadable warning list");
  }

  const links = post.children(".entry-footer").find(".tags-links a[rel~=tag]");
  if (!links.length) throw new Error("Missing warning tags");
  const categoryIds = new Set<ContentWarningId>();
  for (const element of links.toArray()) {
    const href = $(element).attr("href");
    if (!href) throw new Error("Missing warning tag URL");
    const tag = new URL(href, sourceUrl);
    const slug = tag.pathname.match(/^\/tag\/([^/]+)\/$/)?.[1];
    if (tag.origin !== SOURCE_ORIGIN || !slug) {
      throw new Error("Unrecognized warning tag link");
    }
    const parsed = contentWarningId.safeParse(slug);
    if (parsed.success) categoryIds.add(parsed.data);
  }
  // Readable warnings may have no tags in our supported category list.
  return { warnings, categoryIds: [...categoryIds] };
}

async function loadWarnings(
  book: BookMetadata,
  signal: AbortSignal,
): Promise<CachedWarnings> {
  // Bound the shared load independently of callers joining or leaving it.
  const requestSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  ]);
  let sourceUrl: string | null = null;

  try {
    const searchUrl = new URL(CONTENT_WARNING_SOURCE_URL);
    searchUrl.searchParams.set("s", book.title);
    const search = await fetchSourcePage(searchUrl, requestSignal);
    sourceUrl = searchUrl.href;
    const url = findEntryUrl(search, book);
    if (!url) {
      return {
        status: "not_found",
        sourceUrl,
      };
    }

    const entry = await fetchSourcePage(new URL(url), requestSignal);
    sourceUrl = url;
    const match: CachedWarnings = {
      status: "found",
      ...readEntry(entry, book, sourceUrl),
      sourceUrl,
    };
    contentWarningsResponse.parse(match);
    return match;
  } catch {
    signal.throwIfAborted();
    // PromiseCache evicts rejected loads so source failures can be tried again.
    throw new WarningSourceError(sourceUrl);
  }
}

export async function lookupContentWarnings(
  book: BookMetadata,
  signal?: AbortSignal,
): Promise<ContentWarningsResponse> {
  signal?.throwIfAborted();
  const title = clean(book.title);
  const authors = book.authors.map(clean).filter(Boolean);
  if (!title || !authors.length) {
    return {
      status: "unavailable",
      sourceUrl: null,
    };
  }
  const key = JSON.stringify([
    normalize(title),
    [...new Set(authors.map(normalizeAuthor))].sort(),
  ]);
  try {
    return await warningCache.get(
      key,
      (shared) => loadWarnings({ title, authors }, shared),
      signal,
    );
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof WarningSourceError) {
      return { status: "unavailable", sourceUrl: error.sourceUrl };
    }
    throw error;
  }
}

export async function filterSearchWarnings(
  books: BookSearchResult[],
  excludedIds: readonly ContentWarningId[],
  signal: AbortSignal,
): Promise<BookSearchResult[]> {
  signal.throwIfAborted();
  if (!excludedIds.length || !books.length) return books;

  const controller = new AbortController();
  const lookupSignal = AbortSignal.any([signal, controller.signal]);
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const results: (BookSearchResult | null)[] = books.map((book) => ({
    ...book,
    warningStatus: "not_checked",
  }));
  let next = 0;

  async function worker() {
    while (!lookupSignal.aborted) {
      const index = next++;
      const book = books[index];
      if (!book) return;

      try {
        const warnings = await lookupContentWarnings(
          { title: book.title, authors: book.author_name ?? [] },
          lookupSignal,
        );
        if (lookupSignal.aborted) return;
        results[index] = shouldExcludeForWarnings(warnings, excludedIds)
          ? null
          : { ...book, warningStatus: warnings.status };
      } catch {
        if (lookupSignal.aborted) return;
        results[index] = { ...book, warningStatus: "unavailable" };
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(3, books.length) }, worker),
    );
    signal.throwIfAborted();
    return results.filter((book) => book !== null);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getContentWarningsForWork(
  key: string,
  signal?: AbortSignal,
): Promise<ContentWarningsResponse> {
  const deadline = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  // Keep Open Library errors separate from warning-source failures.
  const book = await getBookDetails(key, true, requestSignal);
  try {
    return await lookupContentWarnings(book, requestSignal);
  } catch (error) {
    signal?.throwIfAborted();
    if (deadline.aborted) {
      return {
        status: "unavailable",
        sourceUrl: null,
      };
    }
    throw error;
  }
}
