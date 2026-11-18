// Which files and columns the book importer accepts. Shared by the upload UI,
// the CSV parser, and the server so they all agree.

export const IMPORT_MAX_FILE_BYTES = 1_048_576; // 1 MB
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_FILE_EXTENSIONS = [".csv"] as const;
export const IMPORT_COLUMNS = ["title", "author", "isbn", "book_key"] as const;
export const IMPORT_REQUIRED_COLUMNS = ["title"] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export type ImportCheck = { ok: true } | { ok: false; error: string };

// Judge a file by extension, then emptiness, then size. MIME types are not trusted.
export function checkImportFile(file: {
  name: string;
  size: number;
}): ImportCheck {
  const name = file.name.toLowerCase();
  if (!IMPORT_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return {
      ok: false,
      error: "Unsupported file type. Choose a .csv file.",
    };
  }
  if (file.size === 0) return { ok: false, error: "This file is empty." };
  if (file.size > IMPORT_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "This file is too large. The limit is 1 MB.",
    };
  }
  return { ok: true };
}

// Normalize the header row (trim, lowercase, drop a leading byte-order mark)
// and check it against the supported columns.
export function checkImportHeaders(
  headers: readonly string[],
): { ok: true; columns: string[] } | { ok: false; error: string } {
  const columns = headers.map((header, i) =>
    (i === 0 ? header.replace(/^\ufeff/, "") : header).trim().toLowerCase(),
  );

  const known: readonly string[] = IMPORT_COLUMNS;
  const seen = new Set<string>();
  for (const column of columns) {
    if (!known.includes(column)) {
      return { ok: false, error: `Unknown column: ${column}.` };
    }
    if (seen.has(column)) {
      return { ok: false, error: `Duplicate column: ${column}.` };
    }
    seen.add(column);
  }

  for (const required of IMPORT_REQUIRED_COLUMNS) {
    if (!seen.has(required)) {
      return { ok: false, error: `Missing required column: ${required}.` };
    }
  }

  return { ok: true, columns };
}
