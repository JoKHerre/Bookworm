import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  checkImportFile,
} from "../../shared/bookImport";
import {
  IMPORT_MATCH_BATCH_SIZE,
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
import { matchImportRows } from "../api/books";
import { ApiRequestError } from "../api/client";
import { importBooks } from "../api/library";
import "./ImportBooksPage.css";

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function books(n: number) {
  return `${n} ${n === 1 ? "book" : "books"}`;
}

function rowLabel(row: ImportRow) {
  return row.author ? `${row.title} by ${row.author}` : row.title;
}

function candidateLabel(book: BookSearchResult) {
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
  const [importing, setImporting] = useState(false); // whether the books are being saved to the library
  const [result, setResult] = useState<ImportBooksResponse | null>(null); // counts returned after importing
  const matchController = useRef<AbortController | null>(null);

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
        if (expired) setError((err as Error).message);
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
          ? { status: "matched", book: { key: row.book_key, title: row.title } }
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
  const matchedCount = indexesWith("matched").length;
  const failed = indexesWith("failed");
  const missing = indexesWith("none");
  const ambiguous = indexesWith("ambiguous");

  const bookKeys = [
    ...new Set(
      matches.flatMap((match, i) => {
        if (match.status === "matched") return [match.book.key];
        const pick = picks[valid[i]?.row ?? -1];
        return match.status === "ambiguous" && pick ? [pick] : [];
      }),
    ),
  ];

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

        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}

        {result ? (
          <>
            <p className="import-status" role="status">
              {`Imported ${books(result.added)}. ${result.alreadySaved} already in your library.`}
            </p>
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
              {progress ? (
                <p>
                  Matching books… {progress.done} of {progress.total}
                </p>
              ) : (
                valid.length > 0 && <p>{books(matchedCount)} matched.</p>
              )}
            </div>
          )
        )}

        {parsed && !result && !matching && (
          <>
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
                    return (
                      <li key={row.row}>
                        <label className="import-pick">
                          <span>{rowLabel(row)}</span>
                          <select
                            value={picks[row.row] ?? ""}
                            onChange={(event) =>
                              setPicks((prev) => ({
                                ...prev,
                                [row.row]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Skip this book</option>
                            {match.candidates.map((book) => (
                              <option key={book.key} value={book.key}>
                                {candidateLabel(book)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {missing.length > 0 && (
              <section aria-labelledby="import-missing-title">
                <h2 id="import-missing-title">No match found</h2>
                <ul
                  className="import-missing"
                  aria-labelledby="import-missing-title"
                >
                  {missing.map((i) => (
                    <li key={valid[i]!.row}>{rowLabel(valid[i]!)}</li>
                  ))}
                </ul>
              </section>
            )}

            {failed.length > 0 && (
              <div className="import-failed">
                <p>Could not look up {books(failed.length)}.</p>
                <button
                  className="import-secondary"
                  type="button"
                  onClick={() => void matchRows(valid, failed)}
                >
                  Try again
                </button>
              </div>
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

        <button
          className="import-upload"
          type="button"
          disabled={!file || reading}
          onClick={() => void handleUpload()}
        >
          {reading ? "Reading…" : "Upload"}
        </button>

        {parsed && !result && (
          <button
            className="import-upload"
            type="button"
            disabled={bookKeys.length === 0 || importing || matching}
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
