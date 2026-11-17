import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IMPORT_MAX_FILE_BYTES,
  checkImportFile,
  checkImportHeaders,
} from "../../shared/bookImport.ts";

test("IMP-01-T-1 accepts a csv file within the limit", () => {
  for (const name of ["books.csv", "BOOKS.CSV"]) {
    assert.deepEqual(checkImportFile({ name, size: 10 }), { ok: true });
  }
  assert.deepEqual(
    checkImportFile({ name: "big.csv", size: IMPORT_MAX_FILE_BYTES }),
    { ok: true },
  );
});

test("IMP-01-T-1 rejects other file types", () => {
  for (const name of ["books.xlsx", "books.txt", "books"]) {
    assert.deepEqual(checkImportFile({ name, size: 10 }), {
      ok: false,
      error: "Unsupported file type. Choose a .csv file.",
    });
  }
});

test("IMP-01-T-1 rejects empty files", () => {
  assert.deepEqual(checkImportFile({ name: "books.csv", size: 0 }), {
    ok: false,
    error: "This file is empty.",
  });
});

test("IMP-01-T-1 rejects files over the size limit", () => {
  assert.deepEqual(
    checkImportFile({ name: "books.csv", size: IMPORT_MAX_FILE_BYTES + 1 }),
    { ok: false, error: "This file is too large. The limit is 1 MB." },
  );
});

test("IMP-01-T-1 checks the file type before the size", () => {
  assert.deepEqual(checkImportFile({ name: "books.txt", size: 0 }), {
    ok: false,
    error: "Unsupported file type. Choose a .csv file.",
  });
});

test("IMP-01-T-1 accepts and normalizes headers", () => {
  assert.deepEqual(checkImportHeaders([" Title ", "AUTHOR"]), {
    ok: true,
    columns: ["title", "author"],
  });
  assert.deepEqual(checkImportHeaders(["book_key", "ISBN", "title"]), {
    ok: true,
    columns: ["book_key", "isbn", "title"],
  });
});

test("IMP-01-T-1 ignores a byte-order mark on the first header", () => {
  assert.deepEqual(checkImportHeaders(["﻿title"]), {
    ok: true,
    columns: ["title"],
  });
});

test("IMP-01-T-1 rejects a missing title column", () => {
  assert.deepEqual(checkImportHeaders(["author"]), {
    ok: false,
    error: "Missing required column: title.",
  });
});

test("IMP-01-T-1 rejects an unknown column", () => {
  assert.deepEqual(checkImportHeaders(["title", "rating"]), {
    ok: false,
    error: "Unknown column: rating.",
  });
});

test("IMP-01-T-1 rejects a duplicate column", () => {
  assert.deepEqual(checkImportHeaders(["title", "Title"]), {
    ok: false,
    error: "Duplicate column: title.",
  });
});
