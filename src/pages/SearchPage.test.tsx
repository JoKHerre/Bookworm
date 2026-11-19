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
import type { AuthLocationState } from "../routes";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
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
