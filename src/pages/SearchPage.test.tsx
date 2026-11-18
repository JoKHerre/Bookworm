import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookSearchResult } from "../../shared/books";
import { getBookSuggestions, searchBooks } from "../api/books";
import { renderWithProviders } from "../test/renderWithProviders";
import SearchPage from "./SearchPage";

vi.mock("../api/books");

const DUNE: BookSearchResult = {
  key: "/works/OL1W",
  title: "Dune",
  author_name: ["Frank Herbert"],
  first_publish_year: 1965,
};
const EMMA: BookSearchResult = {
  key: "/works/OL2W",
  title: "Emma",
  author_name: ["Jane Austen"],
};

function Destination() {
  const location = useLocation();
  return <p>Details at {location.pathname}</p>;
}

function renderSearch(route = "/search") {
  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/books/*" element={<Destination />} />
    </Routes>,
    { route },
  );
}

const searchBox = () =>
  screen.getByRole("combobox", { name: "Search by title or author" });

async function submitSearch(query: string) {
  await userEvent.type(searchBox(), query);
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
}

describe("SearchPage", () => {
  beforeEach(() => {
    vi.mocked(searchBooks).mockResolvedValue({
      books: [DUNE, EMMA],
      total: 2,
    });
    vi.mocked(getBookSuggestions).mockResolvedValue({ books: [], total: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TST-01-T-1 search page shows nothing before a search", () => {
    renderSearch();
    expect(searchBooks).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("TST-01-T-1 search page lists results for a query", async () => {
    renderSearch();
    await submitSearch("dune");

    expect(
      await screen.findByRole("button", {
        name: "View details for Dune by Frank Herbert",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 2 results")).toBeInTheDocument();
    expect(searchBooks).toHaveBeenCalledWith("dune", expect.anything(), {
      genre: [],
      language: "",
      year: "",
    });
  });

  it("TST-01-T-1 search page searches the query in the URL", async () => {
    renderSearch("/search?q=emma");
    expect(
      await screen.findByRole("button", { name: /View details for Emma/ }),
    ).toBeInTheDocument();
    expect(searchBox()).toHaveValue("emma");
  });

  it("TST-01-T-1 search page says when nothing matches", async () => {
    vi.mocked(searchBooks).mockResolvedValue({ books: [], total: 0 });
    renderSearch("/search?q=zzzz");
    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("TST-01-T-1 search page shows a search error", async () => {
    vi.mocked(searchBooks).mockRejectedValue(new Error("Unable to connect."));
    renderSearch("/search?q=dune");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to connect.",
    );
  });

  it("TST-01-T-1 search page applies and resets filters", async () => {
    renderSearch("/search?q=dune");
    await screen.findByText("Showing 2 of 2 results");

    await userEvent.click(screen.getByText("Genres"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Fantasy" }));
    await userEvent.selectOptions(screen.getByLabelText("Language"), "French");
    await userEvent.selectOptions(
      screen.getByLabelText("Publication year"),
      "2010-2019",
    );

    await waitFor(() =>
      expect(searchBooks).toHaveBeenLastCalledWith("dune", expect.anything(), {
        genre: ["Fantasy"],
        language: "French",
        year: "2010-2019",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(searchBooks).toHaveBeenLastCalledWith("dune", expect.anything(), {
        genre: [],
        language: "",
        year: "",
      }),
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("search page restores filters from the URL", async () => {
    renderSearch(
      "/search?q=dune&genre=Fantasy&genre=Unknown&language=French&year=1800",
    );
    await screen.findByText("Showing 2 of 2 results");

    expect(searchBooks).toHaveBeenLastCalledWith("dune", expect.anything(), {
      genre: ["Fantasy"],
      language: "French",
      year: "",
    });
    expect(screen.getByRole("checkbox", { name: "Fantasy" })).toBeChecked();
    expect(screen.getByLabelText("Language")).toHaveValue("French");
    expect(screen.getByLabelText("Publication year")).toHaveValue("");
  });

  it("TST-01-T-1 search page switches between list and grid", async () => {
    renderSearch("/search?q=dune");
    await screen.findByText("Showing 2 of 2 results");
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Book search results" }),
      ).getAllByRole("button"),
    ).toHaveLength(2);
  });

  it("TST-01-T-1 search page opens a result's details", async () => {
    renderSearch("/search?q=dune");
    await userEvent.click(
      await screen.findByRole("button", { name: /View details for Dune/ }),
    );
    expect(
      screen.getByText("Details at /books/works/OL1W"),
    ).toBeInTheDocument();
  });

  describe("suggestions", () => {
    async function typeAndWait(text: string) {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(getBookSuggestions).mockResolvedValue({
        books: [DUNE, EMMA],
        total: 2,
      });
      renderSearch();
      fireEvent.focus(searchBox());
      fireEvent.change(searchBox(), { target: { value: text } });
      await act(() => vi.advanceTimersByTimeAsync(1000));
    }

    it("TST-01-T-1 search page suggests books while typing", async () => {
      await typeAndWait("dun");
      const list = await screen.findByRole("listbox", {
        name: "Book suggestions",
      });
      expect(within(list).getAllByRole("option")).toHaveLength(2);
      expect(getBookSuggestions).toHaveBeenCalledWith("dun", expect.anything());
    });

    it("TST-01-T-1 search page picks a suggestion with the keyboard", async () => {
      await typeAndWait("dun");
      await screen.findByRole("listbox");

      fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
      expect(
        within(screen.getByRole("listbox")).getByRole("option", {
          selected: true,
        }),
      ).toHaveTextContent("Dune");
      fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
      fireEvent.keyDown(searchBox(), { key: "ArrowUp" });
      fireEvent.keyDown(searchBox(), { key: "Enter" });

      expect(
        screen.getByText("Details at /books/works/OL1W"),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 search page closes suggestions on escape", async () => {
      await typeAndWait("dun");
      await screen.findByRole("listbox");
      fireEvent.keyDown(searchBox(), { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("TST-01-T-1 search page does not suggest for short input", async () => {
      await typeAndWait("du");
      expect(getBookSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });
});
