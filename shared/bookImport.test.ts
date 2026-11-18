import { expect, test } from "vitest";
import {
  IMPORT_MAX_FILE_BYTES,
  checkImportFile,
  checkImportHeaders,
} from "./bookImport.ts";

test("IMP-01-T-1 accepts a csv file within the limit", () => {
  for (const name of ["books.csv", "BOOKS.CSV"]) {
    expect(checkImportFile({ name, size: 10 })).toStrictEqual({ ok: true });
  }
  expect(
    checkImportFile({ name: "big.csv", size: IMPORT_MAX_FILE_BYTES }),
  ).toStrictEqual({ ok: true });
});

test("IMP-01-T-1 rejects other file types", () => {
  for (const name of ["books.xlsx", "books.txt", "books"]) {
    expect(checkImportFile({ name, size: 10 })).toStrictEqual({
      ok: false,
      error: "Unsupported file type. Choose a .csv file.",
    });
  }
});

test("IMP-01-T-1 rejects empty files", () => {
  expect(checkImportFile({ name: "books.csv", size: 0 })).toStrictEqual({
    ok: false,
    error: "This file is empty.",
  });
});

test("IMP-01-T-1 rejects files over the size limit", () => {
  expect(
    checkImportFile({ name: "books.csv", size: IMPORT_MAX_FILE_BYTES + 1 }),
  ).toStrictEqual({
    ok: false,
    error: "This file is too large. The limit is 1 MB.",
  });
});

test("IMP-01-T-1 checks the file type before the size", () => {
  expect(checkImportFile({ name: "books.txt", size: 0 })).toStrictEqual({
    ok: false,
    error: "Unsupported file type. Choose a .csv file.",
  });
});

test("IMP-01-T-1 accepts and normalizes headers", () => {
  expect(checkImportHeaders([" Title ", "AUTHOR"])).toStrictEqual({
    ok: true,
    columns: ["title", "author"],
  });
  expect(checkImportHeaders(["book_key", "ISBN", "title"])).toStrictEqual({
    ok: true,
    columns: ["book_key", "isbn", "title"],
  });
});

test("IMP-01-T-1 ignores a byte-order mark on the first header", () => {
  expect(checkImportHeaders(["﻿title"])).toStrictEqual({
    ok: true,
    columns: ["title"],
  });
});

test("IMP-01-T-1 rejects a missing title column", () => {
  expect(checkImportHeaders(["author"])).toStrictEqual({
    ok: false,
    error: "Missing required column: title.",
  });
});

test("IMP-01-T-1 rejects an unknown column", () => {
  expect(checkImportHeaders(["title", "rating"])).toStrictEqual({
    ok: false,
    error: "Unknown column: rating.",
  });
});

test("IMP-01-T-1 rejects a duplicate column", () => {
  expect(checkImportHeaders(["title", "Title"])).toStrictEqual({
    ok: false,
    error: "Duplicate column: title.",
  });
});
