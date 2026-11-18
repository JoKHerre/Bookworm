import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BookSearchResult } from "../../shared/books";
import BookCard from "./BookCard";

const book = {
  key: "/works/OL1W",
  title: "Dune",
  author_name: ["Frank Herbert", "Brian Herbert"],
  first_publish_year: 1965,
  cover_i: 123,
} as BookSearchResult;

describe("BookCard", () => {
  it("TST-01-T-1 book card labels and clicks", async () => {
    const onClick = vi.fn();
    const { container } = render(<BookCard book={book} onClick={onClick} />);

    const button = screen.getByRole("button", {
      name: "View details for Dune by Frank Herbert, Brian Herbert",
    });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://covers.openlibrary.org/b/id/123-M.jpg",
    );
  });

  it("TST-01-T-1 book card without a cover", () => {
    const { container } = render(
      <BookCard
        book={{ ...book, cover_i: undefined, author_name: undefined }}
        onClick={vi.fn()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "View details for Dune by Unknown author",
      }),
    ).toBeInTheDocument();
  });
});
