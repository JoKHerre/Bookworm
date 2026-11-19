import { expect, test } from "vitest";
import { IMPORT_MAX_ROWS } from "./bookImport.ts";
import {
  parseImportCsv,
  validateImportRows,
  type ImportRow,
} from "./csvImport.ts";

function rowsOf(text: string) {
  const result = parseImportCsv(text);
  if (!result.ok) throw new Error(result.error);
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
  expect(
    rowsOf("title,author\n Dune , Frank Herbert \nEmma,Jane Austen\n"),
  ).toStrictEqual([
    row(2, { title: "Dune", author: "Frank Herbert" }),
    row(3, { title: "Emma", author: "Jane Austen" }),
  ]);
});

test("IMP-01-T-3 supports any column order and missing columns", () => {
  expect(rowsOf("Author,TITLE,book_key\nX,Dune,/works/OL1W")).toStrictEqual([
    row(2, { title: "Dune", author: "X", book_key: "/works/OL1W" }),
  ]);
});

test("IMP-01-T-3 parses quoted fields", () => {
  const text =
    'title,author\n"Dune, Part 1","Herbert ""Frank""\nSecond line"\n';
  expect(rowsOf(text)).toStrictEqual([
    row(2, { title: "Dune, Part 1", author: 'Herbert "Frank"\nSecond line' }),
  ]);
});

test("IMP-01-T-3 supports all line endings", () => {
  const expected = [row(2, { title: "A" }), row(3, { title: "B" })];
  for (const eol of ["\n", "\r\n", "\r"]) {
    expect(rowsOf(`title${eol}A${eol}B${eol}`)).toStrictEqual(expected);
  }
});

test("IMP-01-T-3 ignores a byte-order mark", () => {
  expect(rowsOf("﻿title\nDune")).toStrictEqual([row(2, { title: "Dune" })]);
});

test("IMP-01-T-3 skips blank records and trailing newline", () => {
  expect(rowsOf("title,author\nA,x\n\n , \nB,y\n\n")).toStrictEqual([
    row(2, { title: "A", author: "x" }),
    row(5, { title: "B", author: "y" }),
  ]);
});

test("IMP-01-T-3 pads short records", () => {
  expect(rowsOf("title,author,isbn\nDune")).toStrictEqual([
    row(2, { title: "Dune" }),
  ]);
});

test("IMP-01-T-3 returns header errors unchanged", () => {
  expect(parseImportCsv("author\nX")).toStrictEqual({
    ok: false,
    error: "Missing required column: title.",
  });
});

test("IMP-01-T-3 rejects empty text", () => {
  for (const text of ["", "\n\n", "﻿"]) {
    expect(parseImportCsv(text)).toStrictEqual({
      ok: false,
      error: "This file is empty.",
    });
  }
});

test("IMP-01-T-3 rejects an unclosed quote", () => {
  expect(parseImportCsv('title\n"Dune')).toStrictEqual({
    ok: false,
    error: "The file has an unclosed quote.",
  });
});

test("IMP-01-T-3 rejects a record with too many values", () => {
  expect(parseImportCsv("title\nA\nB,extra")).toStrictEqual({
    ok: false,
    error: "Row 3 has more values than the header.",
  });
});

test("IMP-01-T-3 rejects a file with no books", () => {
  for (const text of ["title", "title\n\n \n"]) {
    expect(parseImportCsv(text)).toStrictEqual({
      ok: false,
      error: "This file has no books.",
    });
  }
});

test("IMP-01-T-3 rejects too many rows", () => {
  const body = (n: number) =>
    "title\n" + Array.from({ length: n }, (_, i) => `Book ${i}`).join("\n");

  expect(rowsOf(body(IMPORT_MAX_ROWS)).length).toBe(IMPORT_MAX_ROWS);
  expect(parseImportCsv(body(IMPORT_MAX_ROWS + 1))).toStrictEqual({
    ok: false,
    error: "Too many rows. The limit is 500.",
  });
});

const book = (n: number, fields: Partial<ImportRow> = {}): ImportRow => ({
  row: n,
  title: `Book ${n}`,
  author: "",
  isbn: "",
  book_key: "",
  ...fields,
});

test("IMP-01-T-4 accepts rows with only a title", () => {
  const rows = [book(2), book(3), book(4)];
  expect(validateImportRows(rows)).toStrictEqual({ valid: rows, errors: [] });
});

test("IMP-01-T-4 requires a title", () => {
  expect(validateImportRows([book(2, { title: "" })]).errors).toStrictEqual([
    { row: 2, message: "Row 2: title is required." },
  ]);
});

test("IMP-01-T-4 limits title and author length", () => {
  const { valid, errors } = validateImportRows([
    book(2, { title: "x".repeat(300) }),
    book(3, { title: "x".repeat(301) }),
    book(4, { author: "y".repeat(200) }),
    book(5, { author: "y".repeat(201) }),
  ]);
  expect(valid.map((r) => r.row)).toStrictEqual([2, 4]);
  expect(errors).toStrictEqual([
    { row: 3, message: "Row 3: title is longer than 300 characters." },
    { row: 5, message: "Row 5: author is longer than 200 characters." },
  ]);
});

test("IMP-01-T-4 accepts valid ISBNs and normalizes them", () => {
  const { valid, errors } = validateImportRows([
    book(2, { isbn: "978-0-306-40615-7" }),
    book(3, { isbn: "0306406152" }),
    book(4, { isbn: "0 8044 2957 X" }),
  ]);
  expect(errors).toStrictEqual([]);
  expect(valid.map((r) => r.isbn)).toStrictEqual([
    "9780306406157",
    "0306406152",
    "080442957X",
  ]);
});

test("IMP-01-T-4 rejects invalid ISBNs", () => {
  const message = (n: number) =>
    `Row ${n}: isbn is not a valid ISBN-10 or ISBN-13.`;
  const { valid, errors } = validateImportRows([
    book(2, { isbn: "12345" }), // wrong length
    book(3, { isbn: "97803064O6157" }), // letter in the digits
    book(4, { isbn: "9780306406158" }), // bad ISBN-13 checksum
    book(5, { isbn: "0306406153" }), // bad ISBN-10 checksum
    book(6, { isbn: "03064X6152" }), // X is only allowed in the check digit
  ]);
  expect(valid).toStrictEqual([]);
  expect(errors).toStrictEqual(
    [2, 3, 4, 5, 6].map((n) => ({ row: n, message: message(n) })),
  );
});

test("IMP-01-T-4 checks the book key", () => {
  const { valid, errors } = validateImportRows([
    book(2, { book_key: "/works/OL45883W" }),
    book(3, { book_key: "/books/OL1M" }),
    book(4, { book_key: "OL1W" }),
  ]);
  expect(valid.map((r) => r.row)).toStrictEqual([2]);
  expect(errors).toStrictEqual([
    {
      row: 3,
      message: "Row 3: book_key is not a valid Open Library work key.",
    },
    {
      row: 4,
      message: "Row 4: book_key is not a valid Open Library work key.",
    },
  ]);
});

test("IMP-01-T-4 reports duplicate book keys", () => {
  const { valid, errors } = validateImportRows([
    book(2, { book_key: "/works/OL1W" }),
    book(3, { title: "Other", book_key: "/works/OL1W" }),
  ]);
  expect(valid.length).toBe(1);
  expect(errors).toStrictEqual([
    { row: 3, message: "Row 3: duplicate of row 2." },
  ]);
});

test("IMP-01-T-4 reports duplicate ISBNs and titles", () => {
  const { errors } = validateImportRows([
    book(2, { isbn: "9780306406157" }),
    book(3, { title: "Different", isbn: "978-0-306-40615-7" }),
    book(4, { title: "Dune", author: "Frank Herbert" }),
    book(5, { title: "DUNE", author: "frank herbert" }),
  ]);
  expect(errors).toStrictEqual([
    { row: 3, message: "Row 3: duplicate of row 2." },
    { row: 5, message: "Row 5: duplicate of row 4." },
  ]);
});

test("IMP-01-T-4 does not treat different books as duplicates", () => {
  const { valid, errors } = validateImportRows([
    book(2, { title: "Emma", author: "Jane Austen" }),
    book(3, { title: "Emma", author: "Someone Else" }),
  ]);
  expect(valid.length).toBe(2);
  expect(errors).toStrictEqual([]);
});

test("IMP-01-T-4 reports only the first error per row", () => {
  const { errors } = validateImportRows([
    book(2, { title: "", isbn: "12345", book_key: "nope" }),
  ]);
  expect(errors).toStrictEqual([
    { row: 2, message: "Row 2: title is required." },
  ]);
});

test("IMP-01-T-4 keeps every row in exactly one list", () => {
  const rows = [
    book(2),
    book(3, { title: "" }),
    book(4),
    book(5, { isbn: "1" }),
    book(7),
  ];
  const { valid, errors } = validateImportRows(rows);
  expect(valid.map((r) => r.row)).toStrictEqual([2, 4, 7]);
  expect(errors.map((e) => e.row)).toStrictEqual([3, 5]);
  expect(valid.length + errors.length).toBe(rows.length);
});
