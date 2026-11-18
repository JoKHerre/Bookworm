import { IMPORT_MAX_ROWS, checkImportHeaders } from "./bookImport.ts";
import { openLibraryWorkKey } from "./books.ts";

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

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ValidateImportResult {
  valid: ImportRow[];
  errors: ImportRowError[];
}

const MAX_TITLE_LENGTH = 300;
const MAX_AUTHOR_LENGTH = 200;

// Strip hyphens and spaces and return the ISBN if its length, characters, and checksum are valid.
function normalizeIsbn(value: string): string | null {
  const isbn = value.replace(/[-\s]/g, "").toUpperCase();

  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0 ? isbn : null;
  }

  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, char, i) => total + (char === "X" ? 10 : Number(char)) * (10 - i),
      0,
    );
    return sum % 11 === 0 ? isbn : null;
  }

  return null;
}

// Check every row. Each row lands in exactly one list, in file order, and gets
// at most one error (the first rule it breaks).
export function validateImportRows(
  rows: readonly ImportRow[],
): ValidateImportResult {
  const valid: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const firstRowByIdentity = new Map<string, number>();

  for (const row of rows) {
    const fail = (message: string) =>
      errors.push({ row: row.row, message: `Row ${row.row}: ${message}` });

    if (!row.title) {
      fail("title is required.");
      continue;
    }
    if (row.title.length > MAX_TITLE_LENGTH) {
      fail(`title is longer than ${MAX_TITLE_LENGTH} characters.`);
      continue;
    }
    if (row.author.length > MAX_AUTHOR_LENGTH) {
      fail(`author is longer than ${MAX_AUTHOR_LENGTH} characters.`);
      continue;
    }

    let isbn = "";
    if (row.isbn) {
      const normalized = normalizeIsbn(row.isbn);
      if (!normalized) {
        fail("isbn is not a valid ISBN-10 or ISBN-13.");
        continue;
      }
      isbn = normalized;
    }
    if (row.book_key && !openLibraryWorkKey.safeParse(row.book_key).success) {
      fail("book_key is not a valid Open Library work key.");
      continue;
    }

    // a row's identity is its book key, else its ISBN, else its title and author
    const identity = row.book_key
      ? `key:${row.book_key}`
      : isbn
        ? `isbn:${isbn}`
        : `title:${row.title.toLowerCase()}|${row.author.toLowerCase()}`;
    const duplicateOf = firstRowByIdentity.get(identity);
    if (duplicateOf !== undefined) {
      fail(`duplicate of row ${duplicateOf}.`);
      continue;
    }

    firstRowByIdentity.set(identity, row.row);
    valid.push({ ...row, isbn });
  }

  return { valid, errors };
}
