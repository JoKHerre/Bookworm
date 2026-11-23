import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_MAX_FILE_BYTES } from "../../shared/bookImport";
import type { ImportMatch, MatchImportRow } from "../../shared/bookMatch";
import type { BookSearchResult } from "../../shared/books";
import { matchImportRows, searchBooks } from "../api/books";
import { ApiRequestError } from "../api/client";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import ImportBooksPage from "./ImportBooksPage";

vi.mock("../api/books");
const matchMock = vi.mocked(matchImportRows);
const searchMock = vi.mocked(searchBooks);

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
      screen.queryByRole("button", { name: /^Import/ }),
    ).not.toBeInTheDocument();
  });

  it("IMP-01-T-5 page imports and shows the result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ added: ["/works/OL1W"], alreadySaved: ["/works/OL2W"] }),
      );
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
    // a finished import can't be read and imported again
    expect(
      screen.queryByRole("button", { name: "Upload" }),
    ).not.toBeInTheDocument();
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
      .mockResolvedValueOnce(
        jsonResponse({ added: ["/works/OL1W"], alreadySaved: [] }),
      );
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
      screen.queryByRole("button", { name: /^Import/ }),
    ).not.toBeInTheDocument();

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
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        added: ["/works/OL9W", "/works/OL1W"],
        alreadySaved: [],
      }),
    );
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
      .mockResolvedValue(
        jsonResponse({ added: ["/works/OL6W"], alreadySaved: [] }),
      );
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
      screen.queryByRole("button", { name: /^Import/ }),
    ).not.toBeInTheDocument();

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
        .map((li) => li.firstChild?.textContent),
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
  describe("preview", () => {
    const ready = () => screen.findByRole("list", { name: "Ready to import" });
    const items = async () =>
      within(await ready())
        .getAllByRole("listitem")
        .map((item) => {
          const text = item.cloneNode(true) as HTMLElement;
          text.querySelectorAll("button").forEach((button) => button.remove());
          return text.textContent;
        });

    beforeEach(() => {
      matchMock.mockImplementation((rows) =>
        Promise.resolve(
          rows.map(({ title }): ImportMatch => {
            if (title === "Dune") {
              return {
                status: "matched",
                book: book(1, "Dune", "Frank Herbert", 1965),
              };
            }
            if (title === "Emma") {
              return {
                status: "matched",
                book: book(2, "Persuasion", "Jane Austen", 1817),
              };
            }
            return { status: "none" };
          }),
        ),
      );
    });

    it("IMP-03-T-1 lists matched books before import", async () => {
      setup();
      await uploadCsv("title,author\nDune,Frank Herbert\nnope,\n");
      expect(await items()).toEqual(["Dune by Frank Herbert (1965)"]);
      expect(screen.queryByText("Check this match")).not.toBeInTheDocument();
    });

    it("IMP-03-T-1 flags doubtful matches first", async () => {
      setup();
      await uploadCsv("title,author\nDune,Frank Herbert\nEmma,Jane Austen\n");
      expect(await items()).toEqual([
        "Persuasion by Jane Austen (1817)Check this matchIn your file: Emma by Jane Austen",
        "Dune by Frank Herbert (1965)",
      ]);
    });

    it("IMP-03-T-1 lists keyed books without a flag", async () => {
      setup();
      await uploadCsv("title,author,book_key\nMy Dune,Herbert,/works/OL9W\n");
      expect(await items()).toEqual(["My Dune by Herbert"]);
      expect(screen.queryByText("Check this match")).not.toBeInTheDocument();
    });

    it("IMP-03-T-1 lists a book matched twice once", async () => {
      setup();
      await uploadCsv("title,book_key\nDune,\nOther,/works/OL1W\n");
      expect(await items()).toEqual(["Dune by Frank Herbert (1965)"]);
      expect(await importButton("1 book")).toBeInTheDocument();
    });

    it("IMP-03-T-1 prefers Open Library's book to a keyed row", async () => {
      setup();
      await uploadCsv("title,book_key\nOther,/works/OL1W\nDune,\n");
      expect(await items()).toEqual(["Dune by Frank Herbert (1965)"]);
    });

    it("IMP-03-T-1 flags a book when a later row needs a check", async () => {
      matchMock.mockResolvedValue([
        { status: "matched", book: book(1, "Dune", "Frank Herbert", 1965) },
        { status: "matched", book: book(1, "Dune", "Frank Herbert", 1965) },
      ]);
      setup();
      await uploadCsv("title,author\nDune,Frank Herbert\nEmma,Jane Austen\n");
      expect(await items()).toEqual([
        "Dune by Frank Herbert (1965)Check this matchIn your file: Emma by Jane Austen",
      ]);
    });
  });
  describe("review", () => {
    const missingList = () =>
      screen.findByRole("list", { name: "No match found" });
    const searchFor = (name: string) =>
      screen.getByRole("form", { name: `Search for ${name}` });
    const openSearch = (name: string) =>
      screen.getByRole("button", { name: `Search for ${name}` });
    // opens the row's search, searches, and chooses the only result
    async function chooseResult(name: string, result: BookSearchResult) {
      searchMock.mockImplementationOnce(() => results([result]));
      await userEvent.click(openSearch(name));
      const form = searchFor(name);
      await userEvent.click(
        within(form).getByRole("button", { name: "Search" }),
      );
      await userEvent.click(
        await within(form).findByRole("button", { name: "Choose" }),
      );
    }
    const results = (books: BookSearchResult[]) =>
      Promise.resolve({ books, total: books.length });

    beforeEach(() => {
      searchMock.mockReset();
    });

    it("IMP-03-T-2 leaves out an unchecked book", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ added: ["/works/OL2W"], alreadySaved: [] }),
        );
      vi.stubGlobal("fetch", fetchMock);
      setup();
      await uploadCsv("title\nmatch:1\nmatch:2\n");

      const box = await screen.findByRole("checkbox", { name: "match:1" });
      expect(box).toBeChecked();
      await userEvent.click(box);
      expect(box).not.toBeChecked();
      await userEvent.click(await importButton("1 book"));
      await screen.findByText("Imported 1 book. 0 already in your library.");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        bookKeys: ["/works/OL2W"],
      });
    });

    it("IMP-03-T-2 puts an unchecked book back", async () => {
      setup();
      await uploadCsv("title\nmatch:1\nmatch:2\n");
      const box = await screen.findByRole("checkbox", { name: "match:1" });
      await userEvent.click(box);
      expect(await importButton("1 book")).toBeInTheDocument();
      await userEvent.click(box);
      expect(await importButton("2 books")).toBeInTheDocument();
    });

    it("IMP-03-T-2 searches for a row with no match", async () => {
      searchMock.mockImplementation(() =>
        results(Array.from({ length: 7 }, (_, n) => book(n + 1, `Lost ${n}`))),
      );
      setup();
      await uploadCsv("title,author\nLost Book,Someone\n");

      await missingList();
      await userEvent.click(openSearch("Lost Book by Someone"));
      const form = searchFor("Lost Book by Someone");
      expect(within(form).getByLabelText("Search Open Library")).toHaveValue(
        "Lost Book Someone",
      );
      await userEvent.click(
        within(form).getByRole("button", { name: "Search" }),
      );
      expect(searchMock).toHaveBeenCalledWith(
        "Lost Book Someone",
        expect.any(AbortSignal),
      );
      expect(
        await within(form).findAllByRole("button", { name: "Choose" }),
      ).toHaveLength(5);
    });

    it("IMP-03-T-2 imports a chosen search result", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ added: ["/works/OL7W"], alreadySaved: [] }),
        );
      vi.stubGlobal("fetch", fetchMock);
      searchMock.mockImplementation(() =>
        results([book(7, "The Lost Book", "Ann Writer", 1999)]),
      );
      setup();
      await uploadCsv("title\nLost Book\n");

      await missingList();
      await userEvent.click(openSearch("Lost Book"));
      const form = searchFor("Lost Book");
      await userEvent.click(
        within(form).getByRole("button", { name: "Search" }),
      );
      await userEvent.click(
        await within(form).findByRole("button", { name: "Choose" }),
      );

      expect(
        screen.queryByRole("list", { name: "No match found" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: "The Lost Book by Ann Writer (1999)",
        }),
      ).toBeChecked();
      expect(screen.queryByText("Check this match")).not.toBeInTheDocument();
      await userEvent.click(await importButton("1 book"));
      await screen.findByText("Imported 1 book. 0 already in your library.");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        bookKeys: ["/works/OL7W"],
      });
    });

    it("IMP-03-T-2 shows search progress, no results and errors", async () => {
      let finish: (
        value: Awaited<ReturnType<typeof searchBooks>>,
      ) => void = () => {};
      searchMock
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockRejectedValueOnce(new Error("Unable to connect."));
      setup();
      await uploadCsv("title\nLost Book\n");
      await missingList();
      await userEvent.click(openSearch("Lost Book"));
      const form = searchFor("Lost Book");

      await userEvent.click(
        within(form).getByRole("button", { name: "Search" }),
      );
      expect(
        within(form).getByRole("button", { name: "Searching…" }),
      ).toBeDisabled();
      finish({ books: [], total: 0 });
      expect(
        await within(form).findByText("No books found."),
      ).toBeInTheDocument();

      await userEvent.click(
        within(form).getByRole("button", { name: "Search" }),
      );
      expect(await within(form).findByRole("alert")).toHaveTextContent(
        "Unable to connect.",
      );
    });

    it("IMP-03-T-2 aborts a search when the form closes", async () => {
      searchMock.mockImplementation(() => new Promise(() => {}));
      setup();
      await uploadCsv("title\nLost Book\nOther Book\n");
      await missingList();
      await userEvent.click(openSearch("Lost Book"));
      await userEvent.click(
        within(searchFor("Lost Book")).getByRole("button", { name: "Search" }),
      );
      const [, signal] = searchMock.mock.calls[0]!;
      await userEvent.click(openSearch("Other Book"));
      expect(signal!.aborted).toBe(true);
      expect(
        screen.queryByRole("form", { name: "Search for Lost Book" }),
      ).not.toBeInTheDocument();
      expect(searchFor("Other Book")).toBeInTheDocument();
    });

    it("IMP-03-T-2 aborts a search on Close", async () => {
      searchMock.mockImplementation(() => new Promise(() => {}));
      setup();
      await uploadCsv("title\nLost Book\n");
      await missingList();
      await userEvent.click(openSearch("Lost Book"));
      const form = searchFor("Lost Book");
      await userEvent.click(
        within(form).getByRole("button", { name: "Search" }),
      );
      const [, signal] = searchMock.mock.calls[0]!;
      await userEvent.click(
        screen.getByRole("button", { name: "Close search for Lost Book" }),
      );
      expect(signal!.aborted).toBe(true);
    });

    it("IMP-03-T-2 resets unchecked books for a new upload", async () => {
      setup();
      await uploadCsv("title\nmatch:1\nmatch:2\n");
      await userEvent.click(
        await screen.findByRole("checkbox", { name: "match:1" }),
      );
      await userEvent.click(upload());
      expect(
        await screen.findByRole("checkbox", { name: "match:1" }),
      ).toBeChecked();
      expect(await importButton("2 books")).toBeInTheDocument();
    });

    it("IMP-03-T-2 leaves out and includes all books", async () => {
      setup();
      await uploadCsv("title\nmatch:1\nmatch:2\n");
      await userEvent.click(
        await screen.findByRole("button", { name: "Leave out all" }),
      );
      for (const box of screen.getAllByRole("checkbox")) {
        expect(box).not.toBeChecked();
      }
      expect(
        screen.queryByRole("button", { name: /^Import/ }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Include all" }),
      );
      expect(await importButton("2 books")).toBeInTheDocument();
    });

    it("IMP-03-T-2 shares a book's checkbox with its picks", async () => {
      matchMock.mockImplementation(async (rows) =>
        rows.map(({ title }): ImportMatch =>
          title === "Emma"
            ? {
                status: "ambiguous",
                candidates: [book(1, "match:1"), book(9, "Emma")],
              }
            : { status: "matched", book: book(1, "match:1") },
        ),
      );
      setup();
      await uploadCsv("title\nmatch:1\nEmma\n");
      await userEvent.click(
        await screen.findByRole("checkbox", { name: "match:1" }),
      );
      expect(
        screen.queryByRole("button", { name: /^Import/ }),
      ).not.toBeInTheDocument();

      await userEvent.selectOptions(
        screen.getByLabelText("Emma"),
        "/works/OL1W",
      );
      const box = screen.getByRole("checkbox", { name: "match:1" });
      expect(box).toBeChecked();
      expect(await importButton("1 book")).toBeInTheDocument();
      await userEvent.click(box);
      expect(
        screen.queryByRole("button", { name: /^Import/ }),
      ).not.toBeInTheDocument();
    });

    it("IMP-03-T-2 replaces a flagged match with a search result", async () => {
      matchMock.mockResolvedValue([
        { status: "matched", book: book(2, "Persuasion", "Jane Austen") },
      ]);
      setup();
      await uploadCsv("title,author\nEmma,Jane Austen\n");
      await screen.findByText("Check this match");

      await chooseResult(
        "Emma by Jane Austen",
        book(5, "Emma", "Jane Austen", 1815),
      );
      const box = screen.getByRole("checkbox", {
        name: "Emma by Jane Austen (1815)",
      });
      expect(box).toHaveFocus();
      expect(
        screen.queryByRole("checkbox", { name: /Persuasion/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Check this match")).not.toBeInTheDocument();
    });

    it("IMP-03-T-2 searches for an ambiguous or failed row", async () => {
      matchMock.mockImplementation(async (rows) =>
        rows.map(({ title }): ImportMatch =>
          title === "pick:1" ? byTitle(rows)[0]! : { status: "failed" },
        ),
      );
      setup();
      await uploadCsv("title\npick:1\nLost Book\n");
      await screen.findByRole("heading", { name: "Could not look up 1 book" });

      await chooseResult("pick:1", book(8, "Picked"));
      await chooseResult("Lost Book", book(9, "Found"));
      expect(
        screen.queryByRole("heading", { name: "Pick the right book" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /Could not look up/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Picked" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Found" })).toBeChecked();
      expect(await importButton("2 books")).toBeInTheDocument();
    });
  });

  describe("results", () => {
    const linksIn = (name: string) =>
      within(screen.getByRole("list", { name }))
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]);

    beforeEach(() => {
      matchMock.mockImplementation((rows) =>
        Promise.resolve(
          rows.map(({ title }): ImportMatch => ({
            status: "matched",
            book: book(title === "Dune" ? 1 : 2, title, "An Author", 1965),
          })),
        ),
      );
    });

    it("IMP-03-T-3 lists the imported books", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            added: ["/works/OL1W", "/works/OL3W"],
            alreadySaved: ["/works/OL2W"],
          }),
        ),
      );
      setup();
      await uploadCsv(
        "title,author,book_key\nDune,,\nEmma,,\nOwn Copy,Me,/works/OL3W\n",
      );
      await userEvent.click(await importButton("3 books"));

      expect(
        await screen.findByText("Imported 2 books. 1 already in your library."),
      ).toBeInTheDocument();
      expect(linksIn("Added")).toEqual([
        ["Dune by An Author (1965)", "/books/works/OL1W"],
        ["Own Copy by Me", "/books/works/OL3W"],
      ]);
      expect(linksIn("Already in your library")).toEqual([
        ["Emma by An Author (1965)", "/books/works/OL2W"],
      ]);
    });

    it("IMP-03-T-3 hides an empty result list", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ added: ["/works/OL1W"], alreadySaved: [] }),
          ),
      );
      setup();
      await uploadCsv("title\nDune\n");
      await userEvent.click(await importButton("1 book"));

      await screen.findByText("Imported 1 book. 0 already in your library.");
      expect(linksIn("Added")).toHaveLength(1);
      expect(
        screen.queryByRole("heading", { name: "Already in your library" }),
      ).not.toBeInTheDocument();
    });
  });
});
