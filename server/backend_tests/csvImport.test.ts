import assert from "node:assert/strict";
import { test } from "node:test";
import { IMPORT_MAX_ROWS } from "../../shared/bookImport.ts";
import { parseImportCsv } from "../../shared/csvImport.ts";

function rowsOf(text: string) {
  const result = parseImportCsv(text);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.rows;
}

const row = (n: number, fields: Partial<Record<string, string>>) => ({
  row: n,
  title: "",
  author: "",
  isbn: "",
  book_key: "",
  ...fields,
});

test("IMP-01-T-3 parses rows with trimmed values", () => {
  assert.deepEqual(
    rowsOf("title,author\n Dune , Frank Herbert \nEmma,Jane Austen\n"),
    [
      row(2, { title: "Dune", author: "Frank Herbert" }),
      row(3, { title: "Emma", author: "Jane Austen" }),
    ],
  );
});

test("IMP-01-T-3 supports any column order and missing columns", () => {
  assert.deepEqual(rowsOf("Author,TITLE,book_key\nX,Dune,/works/OL1W"), [
    row(2, { title: "Dune", author: "X", book_key: "/works/OL1W" }),
  ]);
});

test("IMP-01-T-3 parses quoted fields", () => {
  const text =
    'title,author\n"Dune, Part 1","Herbert ""Frank""\nSecond line"\n';
  assert.deepEqual(rowsOf(text), [
    row(2, { title: "Dune, Part 1", author: 'Herbert "Frank"\nSecond line' }),
  ]);
});

test("IMP-01-T-3 supports all line endings", () => {
  const expected = [row(2, { title: "A" }), row(3, { title: "B" })];
  for (const eol of ["\n", "\r\n", "\r"]) {
    assert.deepEqual(rowsOf(`title${eol}A${eol}B${eol}`), expected);
  }
});

test("IMP-01-T-3 ignores a byte-order mark", () => {
  assert.deepEqual(rowsOf("﻿title\nDune"), [row(2, { title: "Dune" })]);
});

test("IMP-01-T-3 skips blank records and trailing newline", () => {
  assert.deepEqual(rowsOf("title,author\nA,x\n\n , \nB,y\n\n"), [
    row(2, { title: "A", author: "x" }),
    row(5, { title: "B", author: "y" }),
  ]);
});

test("IMP-01-T-3 pads short records", () => {
  assert.deepEqual(rowsOf("title,author,isbn\nDune"), [
    row(2, { title: "Dune" }),
  ]);
});

test("IMP-01-T-3 returns header errors unchanged", () => {
  assert.deepEqual(parseImportCsv("author\nX"), {
    ok: false,
    error: "Missing required column: title.",
  });
});

test("IMP-01-T-3 rejects empty text", () => {
  for (const text of ["", "\n\n", "﻿"]) {
    assert.deepEqual(parseImportCsv(text), {
      ok: false,
      error: "This file is empty.",
    });
  }
});

test("IMP-01-T-3 rejects an unclosed quote", () => {
  assert.deepEqual(parseImportCsv('title\n"Dune'), {
    ok: false,
    error: "The file has an unclosed quote.",
  });
});

test("IMP-01-T-3 rejects a record with too many values", () => {
  assert.deepEqual(parseImportCsv("title\nA\nB,extra"), {
    ok: false,
    error: "Row 3 has more values than the header.",
  });
});

test("IMP-01-T-3 rejects a file with no books", () => {
  for (const text of ["title", "title\n\n \n"]) {
    assert.deepEqual(parseImportCsv(text), {
      ok: false,
      error: "This file has no books.",
    });
  }
});

test("IMP-01-T-3 rejects too many rows", () => {
  const body = (n: number) =>
    "title\n" + Array.from({ length: n }, (_, i) => `Book ${i}`).join("\n");

  assert.equal(rowsOf(body(IMPORT_MAX_ROWS)).length, IMPORT_MAX_ROWS);
  assert.deepEqual(parseImportCsv(body(IMPORT_MAX_ROWS + 1)), {
    ok: false,
    error: "Too many rows. The limit is 500.",
  });
});
