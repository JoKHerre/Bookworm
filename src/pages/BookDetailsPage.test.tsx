import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { AuthContext, useAuth } from "../useAuth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityResponse } from "../../shared/availability";
import type { BookDetails } from "../../shared/books";
import { getBookAvailability, getBookDetails, getBookISBNs } from "../booksApi";
import { getRatings, saveRating } from "../ratingsApi";
import {
  addBookToCollection,
  CollectionApiError,
  listCollectionsForBook,
} from "../collectionsApi";
import type { AuthLocationState } from "../routes";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import BookDetailsPage from "./BookDetailsPage";

vi.mock("../booksApi");
vi.mock("../ratingsApi");
vi.mock("../collectionsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../collectionsApi")>()),
  listCollectionsForBook: vi.fn(),
  addBookToCollection: vi.fn(),
}));

const BOOK: BookDetails = {
  key: "/works/OL1W",
  title: "Dune",
  authors: ["Frank Herbert"],
  description: "A desert planet.",
  covers: [42],
  tags: ["fiction", "space"],
};
const USER = { id: 1, email: "a@b.co" };
const NOT_FOUND: AvailabilityResponse = {
  status: "not_found",
  availability: null,
  reason: "no_match",
};

function LoginDestination() {
  const location = useLocation();
  return (
    <p>
      Login page, back to{" "}
      {(location.state as AuthLocationState | null)?.from?.pathname}
    </p>
  );
}

function renderDetails(
  options: { user?: typeof USER | null; state?: unknown } = {},
) {
  return renderWithProviders(
    <Routes>
      <Route path="/books/*" element={<BookDetailsPage />} />
      <Route path="/login" element={<LoginDestination />} />
      <Route path="/search" element={<p>Search page</p>} />
    </Routes>,
    {
      route: { pathname: "/books/works/OL1W", state: options.state },
      user: options.user ?? null,
    },
  );
}

describe("BookDetailsPage", () => {
  beforeEach(() => {
    vi.mocked(listCollectionsForBook).mockResolvedValue([]);
    vi.mocked(addBookToCollection).mockResolvedValue(undefined);
    vi.mocked(getBookDetails).mockResolvedValue(BOOK);
    vi.mocked(getBookAvailability).mockResolvedValue(NOT_FOUND);
    vi.mocked(getRatings).mockResolvedValue([]);
    vi.mocked(saveRating).mockResolvedValue({
      bookKey: "/works/OL1W",
      rating: 4,
    });
    vi.mocked(getBookISBNs).mockRejectedValue(new Error("unused"));
  });

  it("COL-05-T-3 adds a book directly without a separate library save", async () => {
    vi.mocked(listCollectionsForBook).mockResolvedValue([
      {
        id: 7,
        name: "Favorites",
        createdAt: "2026-01-01",
        bookCount: 0,
        containsBook: false,
      },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderDetails({ user: USER });
    const picker = await screen.findByRole("combobox", { name: "Collection" });
    await userEvent.selectOptions(picker, "7");
    await userEvent.click(
      screen.getByRole("button", { name: "Add to collection" }),
    );
    expect(
      await screen.findByText(/Added “Dune” to “Favorites”/),
    ).toBeInTheDocument();
    expect(addBookToCollection).toHaveBeenCalledExactlyOnceWith(
      7,
      "/works/OL1W",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Save to My Library" }),
    ).toBeEnabled();
    expect(screen.getByText("A desert planet.")).toBeInTheDocument();
  });

  it("COL-05-T-3 keeps details and ratings usable when collection loading fails", async () => {
    vi.mocked(listCollectionsForBook).mockRejectedValue(
      new Error("Could not load collections"),
    );
    renderDetails({ user: USER });
    const panel = await screen.findByRole("region", { name: "Collections" });
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Could not load collections",
    );
    expect(screen.getByText("A desert planet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save to My Library" }),
    ).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(await screen.findByText("Rating saved.")).toBeInTheDocument();
  });

  it("COL-05-T-3 asks signed-out users to log in without requesting private data", async () => {
    renderDetails();
    await userEvent.click(
      await screen.findByRole("button", { name: "Log in to organize" }),
    );
    expect(
      screen.getByText("Login page, back to /books/works/OL1W"),
    ).toBeInTheDocument();
    expect(listCollectionsForBook).not.toHaveBeenCalled();
    expect(addBookToCollection).not.toHaveBeenCalled();
  });

  it("COL-05-T-3 keeps the book return destination after an expired session", async () => {
    vi.mocked(listCollectionsForBook).mockRejectedValue(
      new CollectionApiError(
        401,
        "Your session has expired. Please sign in again.",
      ),
    );
    const { auth } = renderDetails({ user: USER });
    await userEvent.click(
      await screen.findByRole("button", { name: "Log in to organize" }),
    );
    expect(
      await screen.findByText("Login page, back to /books/works/OL1W"),
    ).toBeInTheDocument();
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it("COL-05-T-3 resets membership and selection when navigating between books", async () => {
    function BookNavigation() {
      const navigate = useNavigate();
      return (
        <>
          <button
            type="button"
            onClick={() => void navigate("/books/works/OL2W")}
          >
            Next book
          </button>
          <BookDetailsPage />
        </>
      );
    }
    vi.mocked(getBookDetails).mockImplementation(async (key) => ({
      ...BOOK,
      key,
      title: key === BOOK.key ? "Dune" : "Emma",
    }));
    vi.mocked(listCollectionsForBook).mockResolvedValue([
      {
        id: 7,
        name: "Favorites",
        createdAt: "2026-01-01",
        bookCount: 0,
        containsBook: false,
      },
    ]);
    renderWithProviders(
      <Routes>
        <Route path="/books/*" element={<BookNavigation />} />
      </Routes>,
      { route: "/books/works/OL1W", user: USER },
    );
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Collection" }),
      "7",
    );
    await userEvent.click(screen.getByRole("button", { name: "Next book" }));
    const picker = await screen.findByRole("combobox", { name: "Collection" });
    expect(picker).toHaveValue("");
    await userEvent.selectOptions(picker, "7");
    await userEvent.click(
      screen.getByRole("button", { name: "Add to collection" }),
    );
    expect(await screen.findByText(/Added “Emma”/)).toBeInTheDocument();
    expect(addBookToCollection).toHaveBeenCalledExactlyOnceWith(
      7,
      "/works/OL2W",
    );
  });

  it("COL-05-T-3 clears private membership when changing accounts or signing out", async () => {
    function AccountSwitch() {
      const auth = useAuth();
      const [user, setUser] = useState<typeof USER | null>(USER);
      return (
        <AuthContext value={{ ...auth, user }}>
          <button
            type="button"
            onClick={() => setUser({ id: 2, email: "second@example.test" })}
          >
            Change account
          </button>
          <button type="button" onClick={() => setUser(null)}>
            Sign out
          </button>
          <BookDetailsPage />
        </AuthContext>
      );
    }
    vi.mocked(listCollectionsForBook)
      .mockResolvedValueOnce([
        {
          id: 7,
          name: "Private collection",
          createdAt: "2026-01-01",
          bookCount: 1,
          containsBook: true,
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithProviders(
      <Routes>
        <Route path="/books/*" element={<AccountSwitch />} />
      </Routes>,
      { route: "/books/works/OL1W", user: USER },
    );
    expect(
      await screen.findByRole("option", {
        name: "Private collection — Already added",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Change account" }),
    );
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Private collection/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      screen.getByRole("button", { name: "Log in to organize" }),
    ).toBeInTheDocument();
    expect(listCollectionsForBook).toHaveBeenCalledTimes(2);
  });

  it("TST-01-T-1 details page shows the book", async () => {
    renderDetails();
    expect(
      await screen.findByRole("heading", { name: "Dune", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    expect(screen.getByText("A desert planet.")).toBeInTheDocument();
    expect(screen.getByText("space")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cover of Dune" })).toHaveAttribute(
      "src",
      "https://covers.openlibrary.org/b/id/42-L.jpg",
    );
    expect(getBookDetails).toHaveBeenCalledWith(
      "/works/OL1W",
      expect.anything(),
      true,
    );
  });

  it("TST-01-T-1 details page handles a missing summary and tags", async () => {
    vi.mocked(getBookDetails).mockResolvedValue({
      ...BOOK,
      description: undefined,
      tags: [],
    });
    renderDetails();
    expect(
      await screen.findByText("No summary available."),
    ).toBeInTheDocument();
    expect(screen.getByText("No tags available.")).toBeInTheDocument();
  });

  it("TST-01-T-1 details page reads a summary object", async () => {
    vi.mocked(getBookDetails).mockResolvedValue({
      ...BOOK,
      description: { value: "From an object." },
    });
    renderDetails();
    expect(await screen.findByText("From an object.")).toBeInTheDocument();
  });

  it("TST-01-T-1 details page shows a load error", async () => {
    vi.mocked(getBookDetails).mockRejectedValue(new Error("Book not found"));
    renderDetails();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Book not found",
    );
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
  });

  it("TST-01-T-1 details page uses the search result it came from", async () => {
    renderDetails({
      state: {
        backLabel: "Back to Search",
        searchBook: {
          key: "/works/OL1W",
          title: "Dune (search)",
          author_name: ["F. Herbert"],
        },
      },
    });
    expect(screen.getByText("F. Herbert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to Search" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getBookDetails).toHaveBeenCalledWith(
        "/works/OL1W",
        expect.anything(),
        false,
      ),
    );
  });

  it("TST-01-T-1 details page goes back to search without history", async () => {
    renderDetails();
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(screen.getByText("Search page")).toBeInTheDocument();
  });

  describe("signed out", () => {
    it("TST-01-T-1 details page asks signed-out users to log in", async () => {
      renderDetails();
      await userEvent.click(
        await screen.findByRole("button", { name: "Log in to save" }),
      );
      expect(
        screen.getByText("Login page, back to /books/works/OL1W"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Your rating")).not.toBeInTheDocument();
    });
  });

  describe("signed in", () => {
    const save = () =>
      userEvent.click(
        screen.getByRole("button", { name: "Save to My Library" }),
      );

    async function renderSignedIn() {
      renderDetails({ user: USER });
      await screen.findByRole("heading", { name: "Dune", level: 1 });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save to My Library" }),
        ).toBeEnabled(),
      );
    }

    it.each([
      [201, {}, "Book saved to your library."],
      [409, {}, "This book is already in your library."],
      [401, {}, "Please sign in to save books to your library."],
      [500, { error: "Database down" }, "Database down"],
      [500, null, "Could not save this book. Please try again."],
    ])(
      "TST-01-T-1 details page save responds to status %i",
      async (status, body, message) => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
        vi.stubGlobal("fetch", fetchMock);
        await renderSignedIn();
        await save();
        expect(await screen.findByText(message)).toBeInTheDocument();

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/library");
        expect(JSON.parse(init.body as string)).toEqual({
          bookKey: "/works/OL1W",
        });
      },
    );

    it("TST-01-T-1 details page save reports a network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
      await renderSignedIn();
      await save();
      expect(
        await screen.findByText("Could not save this book. Please try again."),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 details page shows the existing rating", async () => {
      vi.mocked(getRatings).mockResolvedValue([
        { bookKey: "/works/OL1W", rating: 3 },
        { bookKey: "/works/OL9W", rating: 5 },
      ]);
      await renderSignedIn();
      await waitFor(() =>
        expect(screen.getByRole("radio", { name: "3 stars" })).toBeChecked(),
      );
    });

    it("TST-01-T-1 details page saves a new rating", async () => {
      await renderSignedIn();
      await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
      expect(await screen.findByText("Rating saved.")).toBeInTheDocument();
      expect(saveRating).toHaveBeenCalledWith("/works/OL1W", 4);
      expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked();
    });

    it("TST-01-T-1 details page rolls back a failed rating", async () => {
      vi.mocked(getRatings).mockResolvedValue([
        { bookKey: "/works/OL1W", rating: 2 },
      ]);
      vi.mocked(saveRating).mockRejectedValue(new Error("Please sign in."));
      await renderSignedIn();
      await waitFor(() =>
        expect(screen.getByRole("radio", { name: "2 stars" })).toBeChecked(),
      );

      await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));

      expect(await screen.findByText("Please sign in.")).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "2 stars" })).toBeChecked();
    });
  });

  describe("library availability", () => {
    const section = () =>
      screen.findByRole("heading", { name: "Library Availability" });

    it("TST-01-T-1 details page shows branch availability", async () => {
      vi.mocked(getBookAvailability).mockResolvedValue({
        status: "matched",
        availability: {
          bibid: "123",
          title: "Dune (catalog)",
          author: "Herbert, Frank",
          format: "Book",
          branches: { Downtown: { available: 1, total: 3 } },
        },
      });
      renderDetails();
      await section();

      const link = await screen.findByRole("link", { name: "Dune (catalog)" });
      expect(link).toHaveAttribute("href", expect.stringContaining("cn=123"));
      expect(screen.getByText("Herbert, Frank · Book")).toBeInTheDocument();
      expect(
        screen.getByText("Downtown: 1 of 3 available"),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 details page explains a catalog record without branches", async () => {
      vi.mocked(getBookAvailability).mockResolvedValue({
        status: "matched",
        availability: { bibid: "123", title: "Dune", branches: {} },
      });
      renderDetails();
      expect(
        await screen.findByText(
          "Branch availability is not reported for this catalog record.",
        ),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 details page explains a missing catalog match", async () => {
      renderDetails();
      expect(
        await screen.findByText(
          "No catalog match was found for the ISBNs checked.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
    });

    it("TST-01-T-1 details page explains a book without ISBNs", async () => {
      vi.mocked(getBookAvailability).mockResolvedValue({
        status: "not_found",
        availability: null,
        reason: "no_isbns",
      });
      renderDetails();
      expect(
        await screen.findByText(/No ISBNs are available to check/),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 details page retries a timed-out availability check", async () => {
      vi.mocked(getBookAvailability)
        .mockResolvedValueOnce({
          status: "incomplete",
          availability: null,
          reason: "deadline",
        })
        .mockResolvedValueOnce(NOT_FOUND);
      renderDetails();
      expect(
        await screen.findByText(/took too long to finish/),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Retry" }));

      expect(
        await screen.findByText(
          "No catalog match was found for the ISBNs checked.",
        ),
      ).toBeInTheDocument();
      expect(getBookAvailability).toHaveBeenCalledTimes(2);
    });

    it("TST-01-T-1 details page shows an availability error", async () => {
      vi.mocked(getBookAvailability).mockRejectedValue(
        new Error("Catalog is down"),
      );
      renderDetails();
      await section();
      const region = screen
        .getByRole("heading", { name: "Library Availability" })
        .closest("section")!;
      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "Catalog is down",
      );
      expect(
        within(region).getByRole("button", { name: "Retry" }),
      ).toBeInTheDocument();
    });
  });
});
