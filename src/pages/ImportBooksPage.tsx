import { useState } from "react";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  checkImportFile,
} from "../../shared/bookImport";
import "./ImportBooksPage.css";

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function ImportBooksPage() {
  const [file, setFile] = useState<File | null>(null); // the chosen file, only set when it passes the checks
  const [error, setError] = useState(""); // problem with the chosen file or reading it
  const [reading, setReading] = useState(false); // whether the file is being read
  const [, setFileText] = useState<string | null>(null); // the file's contents once read, parsed by IMP-01-T-3
  const [readyName, setReadyName] = useState(""); // name of the file that was read

  // choosing (or clearing) a file replaces any previous result
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setFileText(null);
    setReadyName("");
    setError("");
    setFile(null);
    if (!chosen) return;

    const check = checkImportFile(chosen);
    if (check.ok) setFile(chosen);
    else setError(check.error);
  }

  async function handleUpload() {
    if (!file) return;
    setReading(true);
    setError("");
    setReadyName("");
    try {
      setFileText(await file.text());
      setReadyName(file.name);
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

        {readyName && (
          <p className="import-status" role="status">
            {readyName} is ready to import.
          </p>
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
