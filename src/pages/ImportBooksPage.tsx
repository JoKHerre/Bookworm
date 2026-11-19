import { useState } from "react";
import { Link } from "react-router";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  checkImportFile,
} from "../../shared/bookImport";
import {
  parseImportCsv,
  validateImportRows,
  type ValidateImportResult,
} from "../../shared/csvImport";
import type { ImportBooksResponse } from "../../shared/library";
import { importBooks } from "../api/library";
import "./ImportBooksPage.css";

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function ImportBooksPage() {
  const [file, setFile] = useState<File | null>(null); // the chosen file, only set when it passes the checks
  const [error, setError] = useState(""); // problem with the chosen file or reading it
  const [reading, setReading] = useState(false); // whether the file is being read
  const [parsed, setParsed] = useState<ValidateImportResult | null>(null); // the valid rows and row errors found in the file
  const [readyName, setReadyName] = useState(""); // name of the file that was read
  const [importing, setImporting] = useState(false); // whether the books are being saved to the library
  const [result, setResult] = useState<ImportBooksResponse | null>(null); // counts returned after importing

  // choosing (or clearing) a file replaces any previous result
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setParsed(null);
    setReadyName("");
    setResult(null);
    setError("");
    setFile(null);
    if (!chosen) return;

    const check = checkImportFile(chosen);
    if (check.ok) setFile(chosen);
    else setError(check.error);
  }

  const total = parsed ? parsed.valid.length + parsed.errors.length : 0;
  // only rows with an Open Library work key can be saved until title matching (IMP-02) exists
  const importable = parsed?.valid.filter((row) => row.book_key) ?? [];
  const unmatched = (parsed?.valid.length ?? 0) - importable.length;

  async function handleUpload() {
    if (!file) return;
    setReading(true);
    setError("");
    setReadyName("");
    setResult(null);
    try {
      const result = parseImportCsv(await file.text());
      if (result.ok) {
        setParsed(validateImportRows(result.rows));
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
  }

  async function handleImport() {
    setImporting(true);
    setError("");
    try {
      setResult(await importBooks(importable.map((row) => row.book_key)));
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
              {`Imported ${result.added} ${result.added === 1 ? "book" : "books"}. ${result.alreadySaved} already in your library.`}
            </p>
            <Link className="import-link" to="/personal-library">
              Go to My Library
            </Link>
          </>
        ) : (
          readyName &&
          parsed && (
            <p className="import-status" role="status">
              {parsed.valid.length} of {total}{" "}
              {total === 1 ? "book is" : "books are"} valid.
            </p>
          )
        )}

        {parsed && !result && unmatched > 0 && (
          <p>
            {`${unmatched} ${unmatched === 1 ? "book has" : "books have"} no book_key and will be skipped.`}
          </p>
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
            disabled={importable.length === 0 || importing}
            onClick={() => void handleImport()}
          >
            {importing
              ? "Importing…"
              : `Import ${importable.length} ${importable.length === 1 ? "book" : "books"}`}
          </button>
        )}
      </div>
    </main>
  );
}

export default ImportBooksPage;
