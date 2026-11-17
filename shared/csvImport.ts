import { IMPORT_MAX_ROWS, checkImportHeaders } from "./bookImport.ts";

// One book line from an import file. `row` is the spreadsheet row number
// (the header is row 1), so errors can point at the right line.
export interface ImportRow {
  row: number;
  title: string;
  author: string;
  isbn: string;
  book_key: string;
}

export type ParseImportResult =
  { ok: true; rows: ImportRow[] } | { ok: false; error: string };

// Split CSV text into records of fields (RFC 4180). Returns null when a quote is never closed.
function parseRecords(text: string): string[][] | null {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false; // whether the current record has any content yet

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
      touched = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
      touched = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      records.push([...record, field]); // blank lines still count as rows
      record = [];
      field = "";
      touched = false;
    } else {
      field += char;
      touched = true;
    }
  }

  if (inQuotes) return null;
  if (touched || field) records.push([...record, field]);
  return records;
}

export function parseImportCsv(text: string): ParseImportResult {
  const records = parseRecords(text.replace(/^\ufeff/, ""));
  if (records === null) {
    return { ok: false, error: "The file has an unclosed quote." };
  }

  // keep each record's original position so row numbers match a spreadsheet
  const numbered = records
    .map((fields, i) => ({ fields, row: i + 1 }))
    .filter(({ fields }) => fields.some((f) => f.trim() !== ""));
  const [header, ...bookRecords] = numbered;
  if (!header) return { ok: false, error: "This file is empty." };

  const headers = checkImportHeaders(header.fields);
  if (!headers.ok) return headers;

  const rows: ImportRow[] = [];
  for (const { fields, row } of bookRecords) {
    if (fields.length > headers.columns.length) {
      return {
        ok: false,
        error: `Row ${row} has more values than the header.`,
      };
    }
    const importRow: ImportRow = {
      row,
      title: "",
      author: "",
      isbn: "",
      book_key: "",
    };
    headers.columns.forEach((column, i) => {
      importRow[column as Exclude<keyof ImportRow, "row">] = (
        fields[i] ?? ""
      ).trim();
    });
    rows.push(importRow);
  }

  if (rows.length === 0) return { ok: false, error: "This file has no books." };
  if (rows.length > IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `Too many rows. The limit is ${IMPORT_MAX_ROWS}.`,
    };
  }
  return { ok: true, rows };
}
