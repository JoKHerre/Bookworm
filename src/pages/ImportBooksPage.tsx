import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  checkImportFile,
} from "../../shared/bookImport";
import {
  IMPORT_MATCH_BATCH_SIZE,
  matchNeedsCheck,
  normalizeTitle,
  type ImportMatch,
} from "../../shared/bookMatch";
import type { BookSearchResult } from "../../shared/books";
import {
  parseImportCsv,
  validateImportRows,
  type ImportRow,
  type ValidateImportResult,
} from "../../shared/csvImport";
import type { ImportBooksResponse } from "../../shared/library";
import { matchImportRows, searchBooks } from "../api/books";
import { ApiRequestError } from "../api/client";
import { importBooks } from "../api/library";
import { bookDetailsPath } from "../routes";
import "./ImportBooksPage.css";

const IMPORT_SEARCH_RESULTS = 5;
const IMPORT_RESULTS_SHOWN = 10;

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function books(n: number) {
  return `${n} ${n === 1 ? "book" : "books"}`;
}

function rowLabel(row: ImportRow) {
  return row.author ? `${row.title} by ${row.author}` : row.title;
}

// the row's title is already the select's label, so only show a candidate's
// title when it says something new
function candidateLabel(book: BookSearchResult, rowTitle: string) {
  const author = book.author_name?.join(", ") || "Unknown author";
  let label =
    normalizeTitle(book.title) === normalizeTitle(rowTitle)
      ? author
      : `${book.title} by ${author}`;
  if (book.first_publish_year) label += ` (${book.first_publish_year})`;
  return label;
}

function bookLabel(book: BookSearchResult) {
  let label = book.title;
  if (book.author_name?.length) label += ` by ${book.author_name.join(", ")}`;
  if (book.first_publish_year) label += ` (${book.first_publish_year})`;
  return label;
}

function isExpiredSession(err: unknown) {
  return (
    err instanceof Error &&
    err.cause instanceof ApiRequestError &&
    err.cause.status === 401
  );
}

function searchFormId(row: ImportRow) {
  return `import-search-form-${row.row}`;
}

// search Open Library by hand for a row's book
function RowSearch({
  row,
  onChoose,
}: {
  row: ImportRow;
  onChoose: (book: BookSearchResult) => void;
}) {
  const [query, setQuery] = useState(
    row.author ? `${row.title} ${row.author}` : row.title,
  );
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BookSearchResult[] | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setSearching(true);
    setResults(null);
    setError("");
    try {
      const data = await searchBooks(query, current.signal);
      if (current.signal.aborted) return;
      setResults(data.books.slice(0, IMPORT_SEARCH_RESULTS));
    } catch (err) {
      if (current.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not search.");
    }
    setSearching(false);
  }

  const inputId = `import-search-${row.row}`;
  return (
    <form
      id={searchFormId(row)}
      className="import-search"
      aria-label={`Search for ${rowLabel(row)}`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label htmlFor={inputId}>Search Open Library</label>
      <div className="import-search-bar">
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="import-secondary"
          type="submit"
          disabled={searching || !query.trim()}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      {results &&
        (results.length === 0 ? (
          <p>No books found.</p>
        ) : (
          <ul className="import-results">
            {results.map((book) => (
              <li key={book.key}>
                <span>{bookLabel(book)}</span>
                <button
                  className="import-secondary import-small"
                  type="button"
                  onClick={() => onChoose(book)}
                >
                  Choose
                </button>
              </li>
            ))}
          </ul>
        ))}
    </form>
  );
}

// imported books, linked to their pages; a long list shows its first few
// until expanded
function ResultList({
  id,
  title,
  books,
}: {
  id: string;
  title: string;
  books: BookSearchResult[];
}) {
  const [showAll, setShowAll] = useState(false);
  if (books.length === 0) return null;
  const long = books.length > IMPORT_RESULTS_SHOWN;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="import-list" aria-labelledby={id}>
        {(showAll ? books : books.slice(0, IMPORT_RESULTS_SHOWN)).map(
          (book) => (
            <li key={book.key}>
              <Link to={bookDetailsPath(book.key)}>{bookLabel(book)}</Link>
            </li>
          ),
        )}
      </ul>
      {long && (
        <button
          className="import-secondary import-small"
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer" : `Show all ${books.length}`}
        </button>
      )}
    </section>
  );
}

// a valid row's match, or "pending" while it hasn't been looked up
type RowMatch = ImportMatch | { status: "pending" };

function ImportBooksPage() {
  const [file, setFile] = useState<File | null>(null); // the chosen file, only set when it passes the checks
  const [error, setError] = useState(""); // problem with the chosen file or reading it
  const [reading, setReading] = useState(false); // whether the file is being read
  const [parsed, setParsed] = useState<ValidateImportResult | null>(null); // the valid rows and row errors found in the file
  const [readyName, setReadyName] = useState(""); // name of the file that was read
  const [matches, setMatches] = useState<RowMatch[]>([]); // one per valid row
  const [progress, setProgress] = useState<{ done: number; total: number }>(); // set while rows are being matched
  const [picks, setPicks] = useState<Record<number, string>>({}); // row number → book key chosen for an ambiguous row
  const [excluded, setExcluded] = useState<Set<string>>(new Set()); // book keys unchecked in the preview
  const [searchRow, setSearchRow] = useState<number | null>(null); // row number whose search form is open
  const [chosen, setChosen] = useState<Set<number>>(new Set()); // row numbers matched by a search the user ran
  const [expired, setExpired] = useState(false); // the session expired while matching, so retrying can't work
  const [importing, setImporting] = useState(false); // whether the books are being saved to the library
  const [result, setResult] = useState<ImportBooksResponse | null>(null); // counts returned after importing
  const matchController = useRef<AbortController | null>(null);
  const focusKey = useRef<string | null>(null); // preview book to focus once a search result is chosen

  useEffect(() => () => matchController.current?.abort(), []);

  function stopMatching() {
    matchController.current?.abort();
    matchController.current = null;
    setProgress(undefined);
  }

  // choosing (or clearing) a file replaces any previous result
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    stopMatching();
    setParsed(null);
    setReadyName("");
    setMatches([]);
    setPicks({});
    setExcluded(new Set());
    setSearchRow(null);
    setChosen(new Set());
    setExpired(false);
    setResult(null);
    setError("");
    setFile(null);
    if (!chosen) return;

    const check = checkImportFile(chosen);
    if (check.ok) setFile(chosen);
    else setError(check.error);
  }

  // look up the valid rows at these indexes, one batch at a time
  async function matchRows(rows: ImportRow[], indexes: number[]) {
    stopMatching();
    if (indexes.length === 0) return;
    const controller = new AbortController();
    matchController.current = controller;
    setError("");
    setMatches((prev) => {
      const next = [...prev];
      for (const i of indexes) next[i] = { status: "pending" };
      return next;
    });
    setProgress({ done: 0, total: indexes.length });

    for (
      let start = 0;
      start < indexes.length;
      start += IMPORT_MATCH_BATCH_SIZE
    ) {
      const batch = indexes.slice(start, start + IMPORT_MATCH_BATCH_SIZE);
      let results: ImportMatch[];
      let expired = false;
      try {
        results = await matchImportRows(
          batch.map((i) => {
            const { title, author, isbn } = rows[i]!;
            return { title, author, isbn };
          }),
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        expired = isExpiredSession(err);
        if (expired) {
          setError((err as Error).message);
          setExpired(true);
        }
        results = batch.map(() => ({ status: "failed" }));
      }
      if (controller.signal.aborted) return;

      // after an expired session, the rest of the rows are left failed too
      const settled = expired ? indexes.slice(start) : batch;
      setMatches((prev) => {
        const next = [...prev];
        settled.forEach((i, j) => {
          next[i] = results[j] ?? { status: "failed" };
        });
        return next;
      });
      if (expired) break;
      setProgress({ done: start + batch.length, total: indexes.length });
    }

    matchController.current = null;
    setProgress(undefined);
  }

  async function handleUpload() {
    if (!file) return;
    stopMatching();
    setReading(true);
    setError("");
    setReadyName("");
    setMatches([]);
    setPicks({});
    setExcluded(new Set());
    setSearchRow(null);
    setChosen(new Set());
    setExpired(false);
    setResult(null);
    let valid: ImportRow[] = [];
    try {
      const result = parseImportCsv(await file.text());
      if (result.ok) {
        const validated = validateImportRows(result.rows);
        valid = validated.valid;
        setParsed(validated);
        setReadyName(file.name);
      } else {
        setParsed(null);
        setError(result.error);
      }
    } catch {
      setError("Could not read this file.");
    } finally {
      setReading(false);
    }

    // rows with a book_key are already matched
    setMatches(
      valid.map((row) =>
        row.book_key
          ? {
              status: "matched",
              book: {
                key: row.book_key,
                title: row.title,
                ...(row.author && { author_name: [row.author] }),
              },
            }
          : { status: "pending" },
      ),
    );
    const unkeyed = valid.flatMap((row, i) => (row.book_key ? [] : [i]));
    await matchRows(valid, unkeyed);
  }

  const valid = parsed?.valid ?? [];
  const total = parsed ? valid.length + parsed.errors.length : 0;
  const matching = progress !== undefined;
  const indexesWith = (status: RowMatch["status"]) =>
    matches.flatMap((match, i) => (match.status === status ? [i] : []));
  const failed = indexesWith("failed");
  const missing = indexesWith("none");
  const ambiguous = indexesWith("ambiguous");

  // each matched book once, flagged when any of its rows needs a check
  const previewByKey = new Map<
    string,
    { index: number; row: ImportRow; book: BookSearchResult; check: boolean }
  >();
  matches.forEach((match, i) => {
    if (match.status !== "matched") return;
    const row = valid[i]!;
    const check =
      !row.book_key && !chosen.has(row.row) && matchNeedsCheck(row, match.book);
    const item = previewByKey.get(match.book.key);
    // a book_key row only has the file's title, so keep Open Library's book
    const book =
      item && (row.book_key || !item.row.book_key) ? item.book : match.book;
    previewByKey.set(
      match.book.key,
      !item || (check && !item.check)
        ? { index: i, row, book, check }
        : { ...item, book },
    );
  });
  const preview = [...previewByKey.values()].sort(
    (a, b) => Number(b.check) - Number(a.check),
  );

  // a book left out in the preview stays out when a picker also picks it
  const bookKeys = [
    ...new Set(
      matches.flatMap((match, i) => {
        const key =
          match.status === "matched"
            ? match.book.key
            : match.status === "ambiguous"
              ? picks[valid[i]?.row ?? -1]
              : undefined;
        return key && !excluded.has(key) ? [key] : [];
      }),
    ),
  ];
  const previewKeys = preview.map((item) => item.book.key);
  const allIncluded = previewKeys.every((key) => !excluded.has(key));

  function setIncluded(keys: string[], included: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (included) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function searchToggle(row: ImportRow) {
    const open = searchRow === row.row;
    return (
      <button
        className="import-secondary import-small"
        type="button"
        aria-expanded={open}
        aria-controls={open ? searchFormId(row) : undefined}
        onClick={() => setSearchRow(open ? null : row.row)}
      >
        <span aria-hidden="true">{open ? "Close" : "Search"}</span>
        <span className="import-hidden">
          {open ? "Close search for" : "Search for"} {rowLabel(row)}
        </span>
      </button>
    );
  }

  function rowSearch(index: number) {
    const row = valid[index]!;
    return (
      searchRow === row.row && (
        <RowSearch row={row} onChoose={(book) => chooseBook(index, book)} />
      )
    );
  }

  function chooseBook(index: number, book: BookSearchResult) {
    const row = valid[index]!;
    setMatches((prev) => {
      const next = [...prev];
      next[index] = { status: "matched", book };
      return next;
    });
    setChosen((prev) => new Set(prev).add(row.row));
    setIncluded([book.key], true);
    setSearchRow(null);
    focusKey.current = book.key;
  }

  // the book the page matched, picked or chose for each key, preferring
  // Open Library's book to a book_key row's
  const bookByKey = new Map(preview.map(({ book }) => [book.key, book]));
  for (const match of matches) {
    if (match.status !== "ambiguous") continue;
    for (const book of match.candidates) {
      if (!bookByKey.has(book.key)) bookByKey.set(book.key, book);
    }
  }
  const resultBooks = (keys: string[]) =>
    keys.map((key) => bookByKey.get(key) ?? { key, title: key });

  async function handleImport() {
    setImporting(true);
    setError("");
    try {
      setResult(await importBooks(bookKeys));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="import-page">
      <h1>Import books</h1>
      <p>
        CSV with a header row. Supported columns: {IMPORT_COLUMNS.join(", ")}{" "}
        (only title is required). Up to {IMPORT_MAX_ROWS} rows and 1 MB.
      </p>

      <div className="import-card">
        <label className="import-field">
          <span>Choose a CSV file</span>
          <input type="file" accept=".csv" onChange={handleChange} />
        </label>

        {file && (
          <p className="import-file">
            {file.name} ({formatSize(file.size)})
          </p>
        )}

        {!result && (
          <button
            className={parsed ? "import-secondary" : "import-upload"}
            type="button"
            disabled={!file || reading}
            onClick={() => void handleUpload()}
          >
            {reading ? "Reading…" : "Upload"}
          </button>
        )}

        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}

        {result ? (
          <>
            <p className="import-status" role="status">
              {`Imported ${books(result.added.length)}. ${result.alreadySaved.length} already in your library.`}
            </p>
            <ResultList
              id="import-added-title"
              title="Added"
              books={resultBooks(result.added)}
            />
            <ResultList
              id="import-saved-title"
              title="Already in your library"
              books={resultBooks(result.alreadySaved)}
            />
            <Link className="import-link" to="/personal-library">
              Go to My Library
            </Link>
          </>
        ) : (
          readyName &&
          parsed && (
            <div className="import-status" role="status">
              <p>
                {valid.length} of {total}{" "}
                {total === 1 ? "book is" : "books are"} valid.
              </p>
              {progress && (
                <p>
                  Matching books… {progress.done} of {progress.total}
                </p>
              )}
            </div>
          )
        )}

        {parsed && !result && !matching && (
          <>
            {preview.length > 0 && (
              <section aria-labelledby="import-ready-title">
                <div className="import-section-head">
                  <h2 id="import-ready-title">Ready to import</h2>
                  {preview.length > 1 && (
                    <button
                      className="import-secondary import-small"
                      type="button"
                      onClick={() => setIncluded(previewKeys, !allIncluded)}
                    >
                      {allIncluded ? "Leave out all" : "Include all"}
                    </button>
                  )}
                </div>
                <ul
                  className="import-preview"
                  aria-labelledby="import-ready-title"
                >
                  {preview.map(({ index, row, book, check }) => (
                    <li key={book.key}>
                      <label className="import-include">
                        <input
                          ref={(input) => {
                            if (input && focusKey.current === book.key) {
                              focusKey.current = null;
                              input.focus();
                            }
                          }}
                          type="checkbox"
                          checked={!excluded.has(book.key)}
                          onChange={(event) =>
                            setIncluded([book.key], event.target.checked)
                          }
                        />
                        <span>{bookLabel(book)}</span>
                      </label>
                      {check && (
                        <>
                          <div className="import-source">
                            <span className="import-flag">
                              Check this match
                            </span>
                            <span>In your file: {rowLabel(row)}</span>
                            {searchToggle(row)}
                          </div>
                          {rowSearch(index)}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ambiguous.length > 0 && (
              <section aria-labelledby="import-pick-title">
                <h2 id="import-pick-title">Pick the right book</h2>
                <ul className="import-picks">
                  {ambiguous.map((i) => {
                    const row = valid[i]!;
                    const match = matches[i] as Extract<
                      RowMatch,
                      { status: "ambiguous" }
                    >;
                    const id = `import-pick-${row.row}`;
                    return (
                      <li key={row.row} className="import-pick">
                        <label htmlFor={id}>{rowLabel(row)}</label>
                        <div className="import-pick-bar">
                          <select
                            id={id}
                            value={picks[row.row] ?? ""}
                            onChange={(event) => {
                              const key = event.target.value;
                              setPicks((prev) => ({ ...prev, [row.row]: key }));
                              if (key) setIncluded([key], true);
                            }}
                          >
                            <option value="">Skip this book</option>
                            {match.candidates.map((book) => (
                              <option key={book.key} value={book.key}>
                                {candidateLabel(book, row.title)}
                              </option>
                            ))}
                          </select>
                          {searchToggle(row)}
                        </div>
                        {rowSearch(i)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {missing.length > 0 && (
              <section aria-labelledby="import-list-title">
                <h2 id="import-list-title">No match found</h2>
                <ul
                  className="import-missing"
                  aria-labelledby="import-list-title"
                >
                  {missing.map((i) => (
                    <li key={valid[i]!.row}>
                      <span>{rowLabel(valid[i]!)}</span>
                      {searchToggle(valid[i]!)}
                      {rowSearch(i)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {failed.length > 0 && (
              <section aria-labelledby="import-failed-title">
                <h2 id="import-failed-title">
                  Could not look up {books(failed.length)}
                </h2>
                <ul
                  className="import-missing"
                  aria-labelledby="import-failed-title"
                >
                  {failed.map((i) => (
                    <li key={valid[i]!.row}>
                      <span>{rowLabel(valid[i]!)}</span>
                      {searchToggle(valid[i]!)}
                      {rowSearch(i)}
                    </li>
                  ))}
                </ul>
                {!expired && (
                  <button
                    className="import-secondary"
                    type="button"
                    onClick={() => void matchRows(valid, failed)}
                  >
                    Try again
                  </button>
                )}
              </section>
            )}
          </>
        )}

        {parsed && !result && parsed.errors.length > 0 && (
          <section aria-labelledby="import-problems-title">
            <h2 id="import-problems-title">Rows with problems</h2>
            <ul
              className="import-problems"
              aria-labelledby="import-problems-title"
            >
              {parsed.errors.map(({ row, message }) => (
                <li key={row}>{message}</li>
              ))}
            </ul>
          </section>
        )}

        {!result && bookKeys.length > 0 && (
          <button
            className="import-upload"
            type="button"
            disabled={importing || matching}
            onClick={() => void handleImport()}
          >
            {importing ? "Importing…" : `Import ${books(bookKeys.length)}`}
          </button>
        )}
      </div>
    </main>
  );
}

export default ImportBooksPage;
