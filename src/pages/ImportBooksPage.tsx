import { useState } from "react";
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

  // choosing (or clearing) a file replaces any previous result
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setParsed(null);
    setReadyName("");
    setError("");
    setFile(null);
    if (!chosen) return;

    const check = checkImportFile(chosen);
    if (check.ok) setFile(chosen);
    else setError(check.error);
  }

  const total = parsed ? parsed.valid.length + parsed.errors.length : 0;

  async function handleUpload() {
    if (!file) return;
    setReading(true);
    setError("");
    setReadyName("");
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
      setError("Could not read this file. Please try again.");
    } finally {
      setReading(false);
    }
  }

  return (
    <main className="import-page">
      <h1>Import books</h1>
      <p>
        Upload a CSV file with a header row. Supported columns:{" "}
        {IMPORT_COLUMNS.join(", ")} (only title is required). Files can have up
        to {IMPORT_MAX_ROWS} rows and be up to 1 MB.
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

        {readyName && parsed && (
          <p className="import-status" role="status">
            {readyName} is ready to import. {total}{" "}
            {total === 1 ? "book" : "books"} found. {parsed.valid.length} valid,{" "}
            {parsed.errors.length} with problems.
          </p>
        )}

        {parsed && parsed.errors.length > 0 && (
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
      </div>
    </main>
  );
}

export default ImportBooksPage;
