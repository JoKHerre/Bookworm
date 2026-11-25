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
import { getBookDetails, getBookSuggestions, searchBooks } from "../api/books";
import { getInterests, saveInterests } from "../api/interests";
import { getRecommendations } from "../api/recommendations";
import type { AuthLocationState, BookDetailsLocationState } from "../routes";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import SearchPage from "./SearchPage";

vi.mock("../api/books");
vi.mock("../api/interests");
vi.mock("../api/recommendations");

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
  const searchBook = (location.state as BookDetailsLocationState | null)
    ?.searchBook;
  return (
    <>
      <p>Details at {location.pathname}</p>
      {searchBook && <p>Passed {searchBook.title}</p>}
    </>
  );
}

function LoginDestination() {
  const location = useLocation();
  const from = (location.state as AuthLocationState | null)?.from;
  return (
    <p>
      Login page, back to {from?.pathname}
      {from?.search}
    </p>
  );
}

function renderSearch(
  route:
    string | { pathname: string; search?: string; state?: unknown } = "/search",
  user: { id: number; email: string } | null = null,
) {
  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
      <Route path="/books/*" element={<Destination />} />
      <Route path="/login" element={<LoginDestination />} />
    </Routes>,
    { route, user },
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
    vi.mocked(getInterests).mockResolvedValue([]);
    vi.mocked(saveInterests).mockImplementation((genres) =>
      Promise.resolve(genres),
    );
    vi.mocked(getRecommendations).mockResolvedValue([]);
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TST-01-T-1 search page shows nothing before a search", () => {
    renderSearch();
    expect(searchBooks).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Filter search results" }),
    ).not.toBeInTheDocument();
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
    expect(
      await screen.findByText("No books found for “zzzz”."),
    ).toBeInTheDocument();
  });

  it("TST-01-T-1 search page offers to drop filters when nothing matches", async () => {
    vi.mocked(searchBooks).mockResolvedValue({ books: [], total: 0 });
    renderSearch("/search?q=zzzz&language=Spanish");
    expect(
      await screen.findByText("No books found for “zzzz” with these filters."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Search without filters" }),
    );
    await waitFor(() =>
      expect(searchBooks).toHaveBeenLastCalledWith("zzzz", expect.anything(), {
        genre: [],
        language: "",
        year: "",
      }),
    );
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

    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((chip) => chip.getAttribute("aria-label") ?? chip.textContent),
    ).toEqual([
      "Remove Fantasy filter",
      "Remove French filter",
      "Remove 2010-2019 filter",
      "Clear all",
    ]);

    await userEvent.click(
      within(chips).getByRole("button", { name: "Remove French filter" }),
    );
    await waitFor(() =>
      expect(searchBooks).toHaveBeenLastCalledWith("dune", expect.anything(), {
        genre: ["Fantasy"],
        language: "",
        year: "2010-2019",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() =>
      expect(searchBooks).toHaveBeenLastCalledWith("dune", expect.anything(), {
        genre: [],
        language: "",
        year: "",
      }),
    );
    expect(
      screen.queryByRole("list", { name: "Active filters" }),
    ).not.toBeInTheDocument();
  });

  it("REF-01-T-2 search page restores filters from the URL", async () => {
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
      ).getAllByRole("button", { name: /View details/ }),
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

  describe("more results", () => {
    function SearchLocation() {
      return <p hidden>Search URL {useLocation().search}</p>;
    }

    function renderSearchWithUrl(route: string) {
      return renderWithProviders(
        <Routes>
          <Route
            path="/search"
            element={
              <>
                <SearchPage />
                <SearchLocation />
              </>
            }
          />
        </Routes>,
        { route },
      );
    }

    it("keeps the number of pages loaded in the URL", async () => {
      vi.mocked(searchBooks)
        .mockResolvedValueOnce({ books: [DUNE], total: 3, hasMore: true })
        .mockResolvedValueOnce({ books: [EMMA], total: 3 });
      renderSearchWithUrl("/search?q=dune");

      await userEvent.click(
        await screen.findByRole("button", { name: "Show more" }),
      );
      expect(
        await screen.findByText("Search URL ?q=dune&page=2"),
      ).toBeInTheDocument();
      expect(screen.getByText("Showing 2 of 3 results")).toBeInTheDocument();
      expect(searchBooks).toHaveBeenCalledTimes(2);

      await userEvent.clear(searchBox());
      await submitSearch("emma");
      expect(await screen.findByText("Search URL ?q=emma")).toBeInTheDocument();
    });

    it("loads every page in the URL", async () => {
      vi.mocked(searchBooks).mockImplementation((_q, _signal, filters) =>
        Promise.resolve(
          filters?.page === 2
            ? { books: [EMMA], total: 3 }
            : { books: [DUNE], total: 3 },
        ),
      );
      renderSearchWithUrl("/search?q=dune&page=2");

      expect(
        await screen.findByText("Showing 2 of 3 results"),
      ).toBeInTheDocument();
      expect(searchBooks).toHaveBeenCalledWith("dune", expect.anything(), {
        genre: [],
        language: "",
        year: "",
      });
      expect(searchBooks).toHaveBeenCalledWith("dune", expect.anything(), {
        genre: [],
        language: "",
        year: "",
        page: 2,
      });
      expect(searchBooks).toHaveBeenCalledTimes(2);
    });

    it("shows the next page below the first", async () => {
      vi.mocked(searchBooks)
        .mockResolvedValueOnce({ books: [DUNE], total: 2, hasMore: true })
        .mockResolvedValueOnce({ books: [DUNE, EMMA], total: 2 });
      renderSearch("/search?q=dune&language=English");

      expect(
        await screen.findByText("Showing 1 of 2 results"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Show more" }));

      expect(
        await screen.findByText("Showing 2 of 2 results"),
      ).toBeInTheDocument();
      expect(searchBooks).toHaveBeenLastCalledWith("dune", expect.anything(), {
        genre: [],
        language: "English",
        year: "",
        page: 2,
      });
      const results = screen.getByRole("region", {
        name: "Book search results",
      });
      expect(
        within(results).getAllByRole("button", { name: /View details/ }),
      ).toHaveLength(2);
      expect(
        screen.queryByRole("button", { name: "Show more" }),
      ).not.toBeInTheDocument();
    });

    it("keeps the results when the next page fails", async () => {
      vi.mocked(searchBooks)
        .mockResolvedValueOnce({ books: [DUNE], total: 2, hasMore: true })
        .mockRejectedValueOnce(new Error("Unable to load books."));
      renderSearch("/search?q=dune");

      await userEvent.click(
        await screen.findByRole("button", { name: "Show more" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Unable to load books.",
      );
      expect(screen.getByText("Showing 1 of 2 results")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Show more" }),
      ).toBeInTheDocument();
    });

    it("SRC-05-T-3 continues after an empty warning-filtered page", async () => {
      vi.mocked(searchBooks)
        .mockResolvedValueOnce({
          books: [],
          total: 100,
          hasMore: true,
          totalIsExact: false,
        })
        .mockResolvedValueOnce({
          books: [{ ...DUNE, warningStatus: "not_found" }],
          total: 100,
          hasMore: false,
          totalIsExact: false,
        });
      renderSearchWithUrl("/search?q=dune");

      await screen.findByText("No books to show from the pages checked.");
      await userEvent.click(screen.getByRole("button", { name: "Show more" }));

      expect(await screen.findByText("Dune")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Showing 1 result after warning filtering. The total after filtering is unknown.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Some books have missing or unchecked warning information.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/of 100 results/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Show more" }),
      ).not.toBeInTheDocument();
    });

    it("SRC-05-T-3 restores filtered pages and their warning status", async () => {
      vi.mocked(searchBooks)
        .mockResolvedValueOnce({
          books: [],
          total: 100,
          hasMore: true,
          totalIsExact: false,
        })
        .mockResolvedValueOnce({
          books: [{ ...EMMA, warningStatus: "not_checked" }],
          total: 100,
          hasMore: false,
          totalIsExact: false,
        });
      renderSearchWithUrl("/search?q=emma&page=2");

      expect(await screen.findByText("Emma")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Some books have missing or unchecked warning information.",
        ),
      ).toBeInTheDocument();
      expect(
        vi.mocked(searchBooks).mock.calls.map((call) => call[2]?.page ?? 1),
      ).toEqual([1, 2]);
      expect(
        screen.queryByRole("button", { name: "Show more" }),
      ).not.toBeInTheDocument();
    });

    it("starts over for a new search", async () => {
      vi.mocked(searchBooks)
        .mockResolvedValueOnce({ books: [DUNE], total: 2, hasMore: true })
        .mockResolvedValueOnce({ books: [EMMA], total: 2 })
        .mockResolvedValueOnce({ books: [EMMA], total: 1 });
      renderSearch("/search?q=dune");

      await userEvent.click(
        await screen.findByRole("button", { name: "Show more" }),
      );
      await screen.findByText("Showing 2 of 2 results");
      await userEvent.clear(searchBox());
      await submitSearch("emma");

      expect(
        await screen.findByText("Showing 1 of 1 result"),
      ).toBeInTheDocument();
      expect(searchBooks).toHaveBeenLastCalledWith("emma", expect.anything(), {
        genre: [],
        language: "",
        year: "",
      });
    });
  });

  describe("before a search", () => {
    it("TST-01-T-1 search page suggests example searches", async () => {
      renderSearch();
      expect(
        screen.getByRole("heading", { name: "Try searching for" }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Pride and Prejudice" }),
      );
      await waitFor(() =>
        expect(searchBooks).toHaveBeenCalledWith(
          "Pride and Prejudice",
          expect.anything(),
          expect.anything(),
        ),
      );
    });

    it("TST-01-T-1 search page remembers recent searches", async () => {
      const first = renderSearch();
      await submitSearch("dune");
      await screen.findByText("Showing 2 of 2 results");
      first.unmount();

      renderSearch();
      expect(
        screen.getByRole("heading", { name: "Recent searches" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "dune" })).toBeInTheDocument();
    });

    it("TST-01-T-1 search page shows what the user is reading", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            books: [
              {
                id: 1,
                bookKey: "/works/OL1W",
                readingStatus: "currently_reading",
              },
              { id: 2, bookKey: "/works/OL2W", readingStatus: "finished" },
            ],
          }),
        ),
      );
      vi.mocked(getBookDetails).mockResolvedValue({
        key: "/works/OL1W",
        title: "Dune",
        authors: ["Frank Herbert"],
        tags: [],
      });
      renderSearch("/search", { id: 1, email: "a@b.co" });

      const shelf = await screen.findByRole("region", {
        name: "Currently reading",
      });
      await userEvent.click(
        within(shelf).getByRole("button", { name: "Dune" }),
      );
      expect(
        screen.getByText("Details at /books/works/OL1W"),
      ).toBeInTheDocument();
      expect(getBookDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe("genres you like", () => {
    const USER = { id: 1, email: "a@b.co" };

    it("DIS-01-T-1 signed-in users can pick genres", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Mystery"]);
      renderSearch("/search", USER);

      const picker = await screen.findByRole("region", {
        name: "Genres you like",
      });
      expect(
        within(picker).getByRole("button", { name: "Mystery" }),
      ).toHaveAttribute("aria-pressed", "true");

      const fantasy = within(picker).getByRole("button", { name: "Fantasy" });
      expect(fantasy).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(fantasy);

      expect(fantasy).toHaveAttribute("aria-pressed", "true");
      expect(saveInterests).toHaveBeenCalledWith(["Fantasy", "Mystery"]);
    });

    it("DIS-01-T-1 a failed save reverts the genre", async () => {
      vi.mocked(saveInterests).mockRejectedValue(
        new Error("Could not save your genres."),
      );
      renderSearch("/search", USER);

      const fantasy = await screen.findByRole("button", { name: "Fantasy" });
      await userEvent.click(fantasy);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not save your genres.",
      );
      expect(fantasy).toHaveAttribute("aria-pressed", "false");
    });

    it("DIS-01-T-1 saves one change at a time", async () => {
      let finishSave: (genres: ["Fantasy"]) => void = () => {};
      vi.mocked(saveInterests).mockReturnValueOnce(
        new Promise((resolve) => (finishSave = resolve)),
      );
      renderSearch("/search", USER);

      await userEvent.click(
        await screen.findByRole("button", { name: "Fantasy" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Mystery" }));
      await userEvent.click(screen.getByRole("button", { name: "Horror" }));
      expect(saveInterests).toHaveBeenCalledTimes(1);
      expect(saveInterests).toHaveBeenLastCalledWith(["Fantasy"]);

      act(() => finishSave(["Fantasy"]));
      await waitFor(() => expect(saveInterests).toHaveBeenCalledTimes(2));
      expect(saveInterests).toHaveBeenLastCalledWith([
        "Fantasy",
        "Mystery",
        "Horror",
      ]);
      for (const name of ["Fantasy", "Mystery", "Horror"]) {
        expect(screen.getByRole("button", { name })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
    });

    it("DIS-01-T-1 a failed save drops the changes after it", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Poetry"]);
      let failSave: (err: Error) => void = () => {};
      vi.mocked(saveInterests).mockReturnValueOnce(
        new Promise((_resolve, reject) => (failSave = reject)),
      );
      renderSearch("/search", USER);

      await userEvent.click(
        await screen.findByRole("button", { name: "Fantasy" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Mystery" }));

      act(() => failSave(new Error("Could not save your genres.")));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not save your genres.",
      );
      expect(screen.getByRole("button", { name: "Poetry" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      for (const name of ["Fantasy", "Mystery"]) {
        expect(screen.getByRole("button", { name })).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
      expect(saveInterests).toHaveBeenCalledTimes(1);
    });

    it("DIS-01-T-1 logged-out users don't see the genre picker", async () => {
      renderSearch();
      await screen.findByRole("heading", { name: "Try searching for" });
      expect(
        screen.queryByRole("heading", { name: "Genres you like" }),
      ).not.toBeInTheDocument();
      expect(getInterests).not.toHaveBeenCalled();
    });
  });

  describe("recommendations", () => {
    const USER = { id: 1, email: "a@b.co" };

    it("DIS-01-T-3 shows recommended books", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Sci-fi"]);
      vi.mocked(getRecommendations).mockResolvedValue([DUNE, EMMA]);
      renderSearch("/search", USER);

      const section = await screen.findByRole("region", {
        name: "Recommended for you",
      });
      expect(
        await within(section).findByRole("button", { name: /Dune/ }),
      ).toHaveTextContent("Frank Herbert");
      expect(
        within(section).getByRole("button", { name: /Emma/ }),
      ).toHaveTextContent("Jane Austen");
    });

    it("DIS-01-T-3 opens a recommended book", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Sci-fi"]);
      vi.mocked(getRecommendations).mockResolvedValue([DUNE]);
      renderSearch("/search", USER);

      await userEvent.click(
        await screen.findByRole("button", { name: /Dune/ }),
      );
      expect(
        screen.getByText("Details at /books/works/OL1W"),
      ).toBeInTheDocument();
      expect(screen.getByText("Passed Dune")).toBeInTheDocument();
    });

    it("DIS-01-T-3 shows loading, empty, and error states", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Poetry"]);
      let finish: (books: BookSearchResult[]) => void = () => {};
      vi.mocked(getRecommendations).mockReturnValue(
        new Promise((resolve) => (finish = resolve)),
      );
      const first = renderSearch("/search", USER);

      expect(
        await screen.findByText("Loading recommendations..."),
      ).toBeInTheDocument();
      act(() => finish([]));
      expect(
        await screen.findByText("No recommendations for these genres yet."),
      ).toBeInTheDocument();
      first.unmount();

      vi.mocked(getRecommendations).mockRejectedValue(
        new Error("Could not load recommendations."),
      );
      renderSearch("/search", USER);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not load recommendations.",
      );
    });

    it("DIS-01-T-3 reloads recommendations after a saved change", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Poetry"]);
      renderSearch("/search", USER);
      await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(1));

      let finishSave: (genres: ["Fantasy", "Poetry"]) => void = () => {};
      vi.mocked(saveInterests).mockReturnValueOnce(
        new Promise((resolve) => (finishSave = resolve)),
      );
      await userEvent.click(screen.getByRole("button", { name: "Fantasy" }));
      expect(getRecommendations).toHaveBeenCalledTimes(1);

      act(() => finishSave(["Fantasy", "Poetry"]));
      await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(2));

      vi.mocked(saveInterests).mockRejectedValueOnce(
        new Error("Could not save your genres."),
      );
      await userEvent.click(screen.getByRole("button", { name: "Horror" }));
      await screen.findByText("Could not save your genres.");
      expect(getRecommendations).toHaveBeenCalledTimes(2);
    });

    it("DIS-01-T-3 keeps books on screen while reloading", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Sci-fi"]);
      vi.mocked(getRecommendations).mockResolvedValueOnce([DUNE]);
      renderSearch("/search", USER);
      const section = await screen.findByRole("region", {
        name: "Recommended for you",
      });
      await within(section).findByRole("button", { name: /Dune/ });

      let finish: (books: BookSearchResult[]) => void = () => {};
      vi.mocked(getRecommendations).mockReturnValueOnce(
        new Promise((resolve) => (finish = resolve)),
      );
      await userEvent.click(screen.getByRole("button", { name: "Fantasy" }));
      await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(2));

      expect(
        within(section).getByRole("button", { name: /Dune/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Loading recommendations..."),
      ).not.toBeInTheDocument();

      act(() => finish([EMMA]));
      expect(
        await within(section).findByRole("button", { name: /Emma/ }),
      ).toBeInTheDocument();
      expect(
        within(section).queryByRole("button", { name: /Dune/ }),
      ).not.toBeInTheDocument();
    });

    it("DIS-01-T-3 a newer load cancels an older one", async () => {
      vi.mocked(getInterests).mockResolvedValue(["Sci-fi"]);
      vi.mocked(getRecommendations).mockReturnValueOnce(new Promise(() => {}));
      renderSearch("/search", USER);
      await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(1));
      const firstSignal = vi.mocked(getRecommendations).mock.calls[0]?.[0];
      expect(firstSignal?.aborted).toBe(false);

      await userEvent.click(screen.getByRole("button", { name: "Fantasy" }));
      await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(2));
      expect(firstSignal?.aborted).toBe(true);
    });

    it("DIS-01-T-3 hides recommendations without liked genres", async () => {
      const first = renderSearch();
      await screen.findByRole("heading", { name: "Try searching for" });
      expect(
        screen.queryByRole("heading", { name: "Recommended for you" }),
      ).not.toBeInTheDocument();
      first.unmount();

      renderSearch("/search", USER);
      await screen.findByRole("heading", { name: "Genres you like" });
      expect(
        screen.queryByRole("heading", { name: "Recommended for you" }),
      ).not.toBeInTheDocument();
      expect(getRecommendations).not.toHaveBeenCalled();
    });
  });

  describe("saving from results", () => {
    const USER = { id: 1, email: "a@b.co" };

    function stubLibrary(books: unknown[] = []) {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "POST"
            ? jsonResponse({ id: 9, userId: 1, bookKey: "/works/OL1W" }, 201)
            : jsonResponse({ books }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("TST-01-T-1 search page saves a result", async () => {
      const fetchMock = stubLibrary([
        { id: 3, bookKey: "/works/OL2W", readingStatus: "to_be_read" },
      ]);
      renderSearch("/search?q=dune", USER);
      expect(await screen.findByText("✓ In your library")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Save Dune to my library" }),
      );
      await waitFor(() =>
        expect(screen.getAllByText("✓ In your library")).toHaveLength(2),
      );
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({
        bookKey: "/works/OL1W",
      });
    });

    it("TST-01-T-1 search page sends signed-out savers to log in", async () => {
      renderSearch("/search?q=dune");
      await userEvent.click(
        await screen.findByRole("button", { name: "Save Dune to my library" }),
      );
      expect(
        screen.getByText("Login page, back to /search?q=dune"),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 search page finishes a save started before login", async () => {
      const fetchMock = stubLibrary();
      renderSearch(
        {
          pathname: "/search",
          search: "?q=dune",
          state: { pendingSave: "/works/OL1W" },
        },
        USER,
      );
      expect(await screen.findByText("✓ In your library")).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
    });
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
      await act(() => vi.advanceTimersByTimeAsync(250));
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
