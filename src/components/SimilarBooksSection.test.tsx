import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BookSearchResult } from "../../shared/books";
import SimilarBooksSection from "./SimilarBooksSection";

const books: BookSearchResult[] = [
  {
    key: "/works/OL1W",
    title: "Zulu",
    author_name: ["An Author"],
    first_publish_year: 2000,
    cover_i: 123,
  },
  { key: "/works/OL2W", title: "Alpha" },
  { key: "/works/OL3W", title: "Bravo" },
  { key: "/works/OL4W", title: "Charlie" },
  { key: "/works/OL5W", title: "Delta" },
  { key: "/works/OL6W", title: "Echo" },
  { key: "/works/OL7W", title: "Foxtrot" },
];

const props = {
  books,
  loading: false,
  error: "",
  onSelect: () => {},
  onRetry: () => {},
};

describe("SimilarBooksSection", () => {
  it("DIS-02-T-2 keeps the heading in every state", () => {
    const { rerender } = render(<SimilarBooksSection {...props} />);
    expect(
      screen.getByRole("heading", { name: "Similar books" }),
    ).toBeInTheDocument();

    for (const state of [
      { loading: true },
      { error: "Request failed" },
      { books: [] },
    ]) {
      rerender(<SimilarBooksSection {...props} {...state} />);
      expect(
        screen.getByRole("heading", { name: "Similar books" }),
      ).toBeInTheDocument();
    }
  });

  it("DIS-02-T-2 shows only the loading message while loading", () => {
    render(<SimilarBooksSection {...props} loading error="Old error" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading similar books...",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No similar books found."),
    ).not.toBeInTheDocument();
  });

  it("DIS-02-T-2 shows the first six books in supplied order", () => {
    render(<SimilarBooksSection {...props} />);

    const cards = screen.getAllByRole("button");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "View details for Zulu by An Author",
      "View details for Alpha by Unknown author",
      "View details for Bravo by Unknown author",
      "View details for Charlie by Unknown author",
      "View details for Delta by Unknown author",
      "View details for Echo by Unknown author",
    ]);
    expect(screen.queryByText("Foxtrot")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Similar book results" }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("DIS-02-T-2 keeps optional metadata and its fallbacks", () => {
    const { container } = render(
      <SimilarBooksSection {...props} books={books.slice(0, 2)} />,
    );

    expect(screen.getByText("An Author")).toBeInTheDocument();
    expect(screen.getByText("2000")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://covers.openlibrary.org/b/id/123-M.jpg",
    );
    expect(
      screen.getByRole("button", {
        name: "View details for Alpha by Unknown author",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(
      container.querySelector(".book-card-placeholder"),
    ).toBeInTheDocument();
  });

  it("DIS-02-T-2 selects the book whose card was clicked", async () => {
    const onSelect = vi.fn();
    render(<SimilarBooksSection {...props} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "View details for Alpha by Unknown author",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "View details for Zulu by An Author",
      }),
    );

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, books[1]);
    expect(onSelect).toHaveBeenNthCalledWith(2, books[0]);
  });

  it("DIS-02-T-2 shows an empty message without cards or retry", () => {
    render(<SimilarBooksSection {...props} books={[]} />);

    expect(screen.getByText("No similar books found.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("DIS-02-T-2 shows the error and calls retry when clicked", async () => {
    const onRetry = vi.fn();
    render(
      <SimilarBooksSection
        {...props}
        error="Request failed"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Zulu")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No similar books found."),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
