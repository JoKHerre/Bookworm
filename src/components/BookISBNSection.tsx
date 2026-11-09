import { useEffect, useMemo, useRef, useState } from "react";
import {
  bookISBNFormat,
  bookISBNsQuery,
  type BookISBNFormat,
  type BookISBNs,
  type BookISBNsQuery,
} from "../../shared/books";
import { getBookISBNs } from "../booksApi";
import "./BookISBNSection.css";

const isbnFormatLabels: Record<BookISBNFormat, string> = {
  physical: "Physical books",
  ebook: "Ebooks",
  other: "Other / unknown",
};

const isbnTypes = [
  ["isbn_13", "ISBN-13"],
  ["isbn_10", "ISBN-10"],
] as const;
const isbnFilters = bookISBNsQuery.pick({ language: true, format: true });
type ISBNFilters = Pick<BookISBNsQuery, "language" | "format">;

function mergeISBNPages(pages: BookISBNs[]) {
  return bookISBNFormat.options
    .map((format) => ({
      format,
      types: isbnTypes
        .map(([key, label]) => ({
          key,
          label,
          values: [
            ...new Set(pages.flatMap((page) => page.groups[format][key])),
          ].sort(),
        }))
        .filter((type) => type.values.length > 0),
    }))
    .filter((group) => group.types.length > 0);
}

export default function BookISBNSection({ bookKey }: { bookKey: string }) {
  const [filters, setFilters] = useState<ISBNFilters>({
    language: "eng",
    format: "all",
  });
  const [pages, setPages] = useState<BookISBNs[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{
    controller: AbortController;
    offset: number;
    pending: boolean;
  } | null>(null);

  useEffect(() => () => request.current?.controller.abort(), [bookKey]);

  async function loadPage(offset: number, selectedFilters = filters) {
    // Abort immediately so an old response cannot update the new filter results.
    request.current?.controller.abort();
    const controller = new AbortController();
    const currentRequest = { controller, offset, pending: true };
    request.current = currentRequest;
    setLoading(true);
    setError("");

    try {
      const page = await getBookISBNs(bookKey, controller.signal, {
        ...selectedFilters,
        offset,
      });
      if (!controller.signal.aborted) {
        setPages((previous) => (offset === 0 ? [page] : [...previous, page]));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Unable to load ISBNs");
      }
    } finally {
      if (!controller.signal.aborted) {
        currentRequest.pending = false;
        setLoading(false);
      }
    }
  }

  function changeFilter(name: keyof ISBNFilters, value: string) {
    if (filters[name] === value) return;
    const parsed = isbnFilters.safeParse({ ...filters, [name]: value });
    if (!parsed.success) return;
    setFilters(parsed.data);
    setPages([]);
    void loadPage(0, parsed.data);
  }

  const groups = useMemo(() => mergeISBNPages(pages), [pages]);
  const nextOffset = pages.at(-1)?.pagination.nextOffset ?? null;
  const editionsChecked = pages.reduce(
    (total, page) => total + page.pagination.editionsChecked,
    0,
  );

  function requestPage() {
    if (request.current?.pending) return;
    const offset = error ? request.current?.offset : nextOffset;
    if (offset != null) void loadPage(offset);
  }

  return (
    <section className="book-isbns">
      <details
        onToggle={(event) => {
          // Closing keeps this component and any pending request alive.
          if (event.currentTarget.open && !request.current) void loadPage(0);
        }}
      >
        <summary>
          <h2>ISBNs</h2>
        </summary>
        <div className="isbn-filters">
          <label className="isbn-filter">
            Language
            <select
              value={filters.language}
              onChange={(event) => changeFilter("language", event.target.value)}
            >
              <option value="eng">English</option>
              <option value="all">All languages</option>
            </select>
          </label>
          <label className="isbn-filter">
            Format
            <select
              value={filters.format}
              onChange={(event) => changeFilter("format", event.target.value)}
            >
              <option value="all">All formats</option>
              {bookISBNFormat.options.map((format) => (
                <option key={format} value={format}>
                  {isbnFormatLabels[format]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="isbn-help">
          <summary>About these filters</summary>
          <p>
            English includes editions marked as English. All languages includes
            missing language information. Formats use edition metadata, not
            online scans; Other / unknown includes audio and missing or
            unrecognized formats.
          </p>
        </details>

        {groups.length > 0 && (
          <div
            className="isbn-results"
            role="region"
            aria-label="ISBN results"
            tabIndex={0}
          >
            {groups.map(({ format, types }) => (
              <section className="isbn-format-group" key={format}>
                <h3>{isbnFormatLabels[format]}</h3>
                <div className="isbn-columns">
                  {types.map(({ key, label, values }) => (
                    <div className="isbn-group" key={key}>
                      <h4>
                        {label} ({values.length})
                      </h4>
                      <ul role="list">
                        {values.map((isbn) => (
                          <li key={isbn}>{isbn}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {pages.length > 0 && groups.length === 0 && (
          <p className="isbn-empty">
            {nextOffset !== null
              ? "No matching ISBNs found in the editions checked so far."
              : "No ISBNs found for these filters."}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="isbn-status-bar">
          <p role="status">
            {pages.length > 0 &&
              `${editionsChecked} editions checked. ${nextOffset !== null ? "More editions remain." : "No more editions remain."} `}
            {loading && "Loading ISBNs..."}
          </p>
          {(error || nextOffset !== null) && (
            <button
              className="isbn-page-button"
              type="button"
              onClick={requestPage}
              disabled={loading}
            >
              {loading ? "Loading..." : error ? "Retry" : "Load more"}
            </button>
          )}
        </div>
      </details>
    </section>
  );
}
