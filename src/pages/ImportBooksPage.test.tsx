import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_MAX_FILE_BYTES } from "../../shared/bookImport";
import type { ImportMatch, MatchImportRow } from "../../shared/bookMatch";
import type { BookSearchResult } from "../../shared/books";
import { matchImportRows } from "../api/books";
import { ApiRequestError } from "../api/client";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import ImportBooksPage from "./ImportBooksPage";

vi.mock("../api/books");
const matchMock = vi.mocked(matchImportRows);

const choose = (file: File) =>
  userEvent.upload(screen.getByLabelText("Choose a CSV file"), file, {
    applyAccept: false,
  });
const upload = () => screen.getByRole("button", { name: "Upload" });
const csv = (name = "books.csv", content = "title\nDune\n") =>
  new File([content], name, { type: "text/csv" });

function setup() {
  return renderWithProviders(<ImportBooksPage />, {
    route: "/import",
    user: { id: 1, email: "a@b.co" },
  });
}

// matches each row by its title: "match:<n>" is matched to /works/OL<n>W,
// "pick:<n>" offers OL<n>W to OL<n+3>W, and anything else has no match
function byTitle(rows: MatchImportRow[]): ImportMatch[] {
  return rows.map(({ title }) => {
    const [kind, n] = title.split(":");
    if (kind === "match") {
      return { status: "matched", book: book(Number(n), title) };
    }
    if (kind === "pick") {
      return {
        status: "ambiguous",
        candidates: [
          book(Number(n), title, "Jane Austen", 1815),
          book(Number(n) + 1, title, "Emma Tennant"),
          book(Number(n) + 2, `${title}: Annotated`, "Jane Austen"),
          book(Number(n) + 3, title.toUpperCase(), undefined, 2014),
        ],
      };
    }
    return { status: "none" };
  });
}

function book(
  n: number,
  title: string,
  author?: string,
  year?: number,
): BookSearchResult {
  return {
    key: `/works/OL${n}W`,
    title,
    ...(author && { author_name: [author] }),
    ...(year && { first_publish_year: year }),
  };
}

const sentTitles = () =>
  matchMock.mock.calls.map(([rows]) => rows.map((row) => row.title));

const importButton = (count: string) =>
  screen.findByRole("button", { name: `Import ${count}` });

async function uploadCsv(content: string) {
  await choose(csv("books.csv", content));
  await userEvent.click(upload());
}

describe("ImportBooksPage", () => {
  beforeEach(() => {
    matchMock.mockReset();
    matchMock.mockImplementation((rows) => Promise.resolve(byTitle(rows)));
  });

  it("IMP-01-T-2 rejects an unsupported file type", async () => {
    setup();
    await choose(new File(["title"], "books.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unsupported file type. Choose a .csv file.",
    );
    expect(upload()).toBeDisabled();
  });

  it("IMP-01-T-2 rejects an empty file", async () => {
    setup();
    await choose(csv("empty.csv", ""));
    expect(screen.getByRole("alert")).toHaveTextContent("This file is empty.");
    expect(upload()).toBeDisabled();
  });

  it("IMP-01-T-2 rejects an oversized file", async () => {
    setup();
    await choose(csv("big.csv", "x".repeat(IMPORT_MAX_FILE_BYTES + 1)));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file is too large. The limit is 1 MB.",
    );
    expect(upload()).toBeDisabled();
  });

  it("IMP-01-T-2 accepts a csv file", async () => {
    setup();
    expect(upload()).toBeDisabled();
    await choose(csv("books.csv", "x".repeat(2048)));
    expect(screen.getByText("books.csv (2 KB)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(upload()).toBeEnabled();
  });

  it("IMP-01-T-2 choosing another file replaces the result", async () => {
    setup();
    await choose(new File(["x"], "books.txt"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await choose(csv());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/^books\.csv/)).toBeInTheDocument();
    expect(upload()).toBeEnabled();
  });

  it("IMP-01-T-2 clearing the selection resets the page", async () => {
    setup();
    await choose(csv());
    fireEvent.change(screen.getByLabelText("Choose a CSV file"), {
      target: { files: [] },
    });
    expect(upload()).toBeDisabled();
    expect(screen.queryByText(/^books\.csv/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("IMP-01-T-2 upload reads the file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await choose(csv());
    await userEvent.click(upload());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of 1 book is valid.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IMP-01-T-2 failed read shows an error and can retry", async () => {
    setup();
    const file = csv();
    vi.spyOn(file, "text").mockRejectedValueOnce(new Error("disk"));
    await choose(file);

    await userEvent.click(upload());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read this file.",
    );
    expect(upload()).toBeEnabled();

    await userEvent.click(upload());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of 1 book is valid.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("IMP-01-T-3 page shows the number of books found", async () => {
    setup();
    await choose(csv("books.csv", "title\nDune\nEmma\n"));
    await userEvent.click(upload());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 of 2 books are valid.",
    );

    await choose(csv("one.csv", "title\nDune\n"));
    await userEvent.click(upload());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of 1 book is valid.",
    );
  });

  it("IMP-01-T-3 page shows the parser error", async () => {
    setup();
    await choose(csv("books.csv", "title,rating\nDune,5\n"));
    await userEvent.click(upload());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown column: rating.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("IMP-01-T-4 page shows valid and problem counts", async () => {
    setup();
    await choose(csv("books.csv", "title,isbn\nDune,\nEmma,123\nUlysses,\n"));
    await userEvent.click(upload());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 of 3 books are valid.",
    );
  });

  it("IMP-01-T-4 page lists row problems", async () => {
    setup();
    await choose(csv("books.csv", "title,isbn\nDune,\nEmma,123\n"));
    await userEvent.click(upload());

    const list = await screen.findByRole("list", {
      name: "Rows with problems",
    });
    expect(
      within(list).getByText("Row 3: isbn is not a valid ISBN-10 or ISBN-13."),
    ).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });

  it("IMP-01-T-4 page has no problem list for a clean file", async () => {
    setup();
    await choose(csv());
    await userEvent.click(upload());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of 1 book is valid.",
    );
    expect(
      screen.queryByRole("list", { name: "Rows with problems" }),
    ).not.toBeInTheDocument();
  });

  it("IMP-01-T-5 page offers import for rows with a book key", async () => {
    setup();
    await choose(
      csv("books.csv", "title,book_key\nDune,/works/OL1W\nEmma,/works/OL2W\n"),
    );
    await userEvent.click(upload());
    expect(
      await screen.findByRole("button", { name: "Import 2 books" }),
    ).toBeEnabled();

    await choose(csv("none.csv", "title\nDune\n"));
    await userEvent.click(upload());
    await screen.findByRole("status");
    expect(
      screen.getByRole("button", { name: "Import 0 books" }),
    ).toBeDisabled();
  });

  it("IMP-01-T-5 page imports and shows the result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ added: 1, alreadySaved: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await choose(
      csv("books.csv", "title,book_key\nDune,/works/OL1W\nEmma,/works/OL2W\n"),
    );
    await userEvent.click(upload());
    await userEvent.click(
      await screen.findByRole("button", { name: "Import 2 books" }),
    );

    expect(
      await screen.findByText("Imported 1 book. 1 already in your library."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to My Library" }),
    ).toHaveAttribute("href", "/personal-library");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/library/import");
    expect(JSON.parse(init.body as string)).toEqual({
      bookKeys: ["/works/OL1W", "/works/OL2W"],
    });
  });

  it("IMP-01-T-5 page shows an import error and can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ added: 1, alreadySaved: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await choose(csv("books.csv", "title,book_key\nDune,/works/OL1W\n"));
    await userEvent.click(upload());

    await userEvent.click(
      await screen.findByRole("button", { name: "Import 1 book" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not import these books.",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Import 1 book" }),
    );
    expect(
      await screen.findByText("Imported 1 book. 0 already in your library."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("IMP-02-T-3 matches rows in batches", async () => {
    let finish!: () => void;
    matchMock.mockImplementationOnce(
      (rows) =>
        new Promise((resolve) => {
          finish = () => resolve(byTitle(rows));
        }),
    );
    setup();
    const titles = Array.from({ length: 8 }, (_, i) => `match:${i + 1}`);
    await uploadCsv(`title\n${titles.join("\n")}\n`);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Matching books… 0 of 8",
    );
    expect(
      screen.getByRole("button", { name: "Import 0 books" }),
    ).toBeDisabled();

    finish();
    expect(await importButton("8 books")).toBeEnabled();
    expect(sentTitles()).toEqual([titles.slice(0, 6), titles.slice(6)]);
    expect(matchMock.mock.calls[0]?.[0][0]).toEqual({
      title: "match:1",
      author: "",
      isbn: "",
    });
  });

  it("IMP-02-T-3 skips matching for rows with a book key", async () => {
    setup();
    await uploadCsv("title,book_key\nDune,/works/OL9W\nmatch:1,\n");
    expect(await importButton("2 books")).toBeEnabled();
    expect(sentTitles()).toEqual([["match:1"]]);

    matchMock.mockClear();
    await uploadCsv("title,book_key\nDune,/works/OL9W\n");
    expect(await importButton("1 book")).toBeEnabled();
    expect(matchMock).not.toHaveBeenCalled();
  });

  it("IMP-02-T-3 imports matched rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ added: 2, alreadySaved: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await uploadCsv("title,book_key\nDune,/works/OL9W\nmatch:1,\nnope,\n");

    await userEvent.click(await importButton("2 books"));
    expect(
      await screen.findByText("Imported 2 books. 0 already in your library."),
    ).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      bookKeys: ["/works/OL9W", "/works/OL1W"],
    });
  });

  it("IMP-02-T-3 imports a picked ambiguous book", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ added: 1, alreadySaved: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await uploadCsv("title,author\npick:5,Jane Austen\npick:10,\n");

    const section = await screen.findByRole("region", {
      name: "Pick the right book",
    });
    const first = within(section).getByRole("combobox", {
      name: "pick:5 by Jane Austen",
    });
    expect(first).toHaveValue("");
    expect(
      within(first)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Skip this book",
      "Jane Austen (1815)",
      "Emma Tennant",
      "pick:5: Annotated by Jane Austen",
      "Unknown author (2014)",
    ]);
    expect(
      within(section).getByRole("combobox", { name: "pick:10" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Import 0 books" }),
    ).toBeDisabled();

    await userEvent.selectOptions(first, "/works/OL6W");
    await userEvent.click(await importButton("1 book"));
    await screen.findByText("Imported 1 book. 0 already in your library.");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      bookKeys: ["/works/OL6W"],
    });
  });

  it("IMP-02-T-3 lists books with no match", async () => {
    setup();
    await uploadCsv("title,author\nUnknown Book,Someone\nmatch:1,\n");

    const list = await screen.findByRole("list", { name: "No match found" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Unknown Book by Someone"]);
    expect(await importButton("1 book")).toBeEnabled();
  });

  it("IMP-02-T-3 retries failed rows", async () => {
    matchMock.mockImplementationOnce((rows) =>
      Promise.resolve(
        rows.map((row, i) =>
          i === 0 ? { status: "failed" } : byTitle([row])[0]!,
        ),
      ),
    );
    setup();
    await uploadCsv("title\nmatch:1\nmatch:2\n");

    const failed = await screen.findByRole("list", {
      name: "Could not look up 1 book",
    });
    expect(within(failed).getByRole("listitem")).toHaveTextContent("match:1");
    expect(await importButton("1 book")).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await importButton("2 books")).toBeEnabled();
    expect(sentTitles()).toEqual([["match:1", "match:2"], ["match:1"]]);
    expect(screen.queryByText(/Could not look up/)).not.toBeInTheDocument();
  });

  it("IMP-02-T-3 keeps going after a failed batch", async () => {
    matchMock.mockRejectedValueOnce(new Error("Could not match these books."));
    setup();
    const titles = Array.from({ length: 7 }, (_, i) => `match:${i + 1}`);
    await uploadCsv(`title\n${titles.join("\n")}\n`);

    expect(
      await screen.findByRole("heading", { name: "Could not look up 6 books" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 1 book" }),
    ).toBeInTheDocument();
    expect(matchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("IMP-02-T-3 stops matching on an expired session", async () => {
    matchMock.mockRejectedValueOnce(
      new Error("Your session has expired. Please log in again.", {
        cause: new ApiRequestError(401),
      }),
    );
    setup();
    const titles = Array.from({ length: 7 }, (_, i) => `match:${i + 1}`);
    await uploadCsv(`title\n${titles.join("\n")}\n`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your session has expired. Please log in again.",
    );
    expect(matchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: "Could not look up 7 books" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("IMP-02-T-3 aborts matching when the file changes", async () => {
    let signal: AbortSignal | undefined;
    matchMock.mockImplementationOnce((_rows, s) => {
      signal = s;
      return new Promise(() => {});
    });
    setup();
    await uploadCsv("title\nmatch:1\n");
    await screen.findByText("Matching books… 0 of 1");

    await choose(csv("other.csv"));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText(/Matching books/)).not.toBeInTheDocument();
  });
});
