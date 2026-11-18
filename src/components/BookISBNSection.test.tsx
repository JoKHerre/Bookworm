import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookISBNs } from "../../shared/books";
import { getBookISBNs } from "../booksApi";
import BookISBNSection from "./BookISBNSection";

vi.mock("../booksApi");

const empty = { isbn_13: [], isbn_10: [] };

function page(
  overrides: Partial<BookISBNs["groups"]> = {},
  pagination: Partial<BookISBNs["pagination"]> = {},
): BookISBNs {
  return {
    groups: {
      physical: empty,
      ebook: empty,
      other: empty,
      ...overrides,
    },
    pagination: {
      offset: 0,
      editionsChecked: 10,
      totalEditions: 10,
      nextOffset: null,
      ...pagination,
    },
  };
}

const openSection = () =>
  userEvent.click(screen.getByRole("heading", { name: "ISBNs", level: 2 }));

describe("BookISBNSection", () => {
  beforeEach(() => {
    vi.mocked(getBookISBNs).mockResolvedValue(
      page({
        physical: { isbn_13: ["9780306406157", "9780140449136"], isbn_10: [] },
      }),
    );
  });

  it("TST-01-T-1 isbns are not loaded until opened", () => {
    render(<BookISBNSection bookKey="/works/OL1W" />);
    expect(getBookISBNs).not.toHaveBeenCalled();
  });

  it("TST-01-T-1 isbns load and are grouped when opened", async () => {
    render(<BookISBNSection bookKey="/works/OL1W" />);
    await openSection();

    expect(await screen.findByText("9780140449136")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Physical books" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ISBN-13 (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "10 editions checked.",
    );
    expect(getBookISBNs).toHaveBeenCalledWith(
      "/works/OL1W",
      expect.anything(),
      { language: "eng", format: "all", offset: 0 },
    );
  });

  it("TST-01-T-1 isbn filters reload the first page", async () => {
    render(<BookISBNSection bookKey="/works/OL1W" />);
    await openSection();
    await screen.findByText("9780140449136");

    await userEvent.selectOptions(screen.getByLabelText("Format"), "ebook");
    await userEvent.selectOptions(screen.getByLabelText("Language"), "all");

    expect(getBookISBNs).toHaveBeenLastCalledWith(
      "/works/OL1W",
      expect.anything(),
      { language: "all", format: "ebook", offset: 0 },
    );
  });

  it("TST-01-T-1 isbns load more pages and merge duplicates", async () => {
    vi.mocked(getBookISBNs)
      .mockResolvedValueOnce(
        page(
          { physical: { isbn_13: ["9780306406157"], isbn_10: [] } },
          { editionsChecked: 5, totalEditions: 10, nextOffset: 5 },
        ),
      )
      .mockResolvedValueOnce(
        page(
          {
            physical: {
              isbn_13: ["9780306406157", "9780140449136"],
              isbn_10: ["0306406152"],
            },
          },
          { offset: 5, editionsChecked: 5, totalEditions: 10 },
        ),
      );
    render(<BookISBNSection bookKey="/works/OL1W" />);
    await openSection();
    await screen.findByText("9780306406157");
    expect(screen.getByRole("status")).toHaveTextContent("5 editions checked.");

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("0306406152")).toBeInTheDocument();
    expect(screen.getAllByText("9780306406157")).toHaveLength(1);
    expect(getBookISBNs).toHaveBeenLastCalledWith(
      "/works/OL1W",
      expect.anything(),
      { language: "eng", format: "all", offset: 5 },
    );
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("TST-01-T-1 isbns show an error and can retry", async () => {
    vi.mocked(getBookISBNs)
      .mockReset()
      .mockRejectedValueOnce(new Error("Unable to read ISBNs."))
      .mockResolvedValueOnce(
        page({ ebook: { isbn_13: [], isbn_10: ["0306406152"] } }),
      );
    render(<BookISBNSection bookKey="/works/OL1W" />);
    await openSection();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to read ISBNs.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("0306406152")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("TST-01-T-1 isbns explain when none match", async () => {
    vi.mocked(getBookISBNs).mockResolvedValue(page());
    render(<BookISBNSection bookKey="/works/OL1W" />);
    await openSection();
    expect(
      await screen.findByText("No ISBNs found for these filters."),
    ).toBeInTheDocument();
  });
});
