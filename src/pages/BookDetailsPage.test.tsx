import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityResponse } from "../../shared/availability";
import type { BookDetails } from "../../shared/books";
import {
  getBookAvailability,
  getBookDetails,
  getBookISBNs,
  searchLibraryByTitle,
} from "../api/books";
import { getRatings, saveRating } from "../api/ratings";
import type { AuthLocationState } from "../routes";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import BookDetailsPage from "./BookDetailsPage";

vi.mock("../api/books");
vi.mock("../api/ratings");

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
    vi.mocked(getBookDetails).mockResolvedValue(BOOK);
    vi.mocked(getBookAvailability).mockResolvedValue(NOT_FOUND);
    vi.mocked(searchLibraryByTitle).mockResolvedValue({ results: [] });
    vi.mocked(getRatings).mockResolvedValue([]);
    vi.mocked(saveRating).mockResolvedValue({
      bookKey: "/works/OL1W",
      rating: 4,
    });
    vi.mocked(getBookISBNs).mockRejectedValue(new Error("unused"));
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
    await screen.findByText("Library Availability");
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
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
    it("TST-01-T-1 details page saves after signed-out users log in", async () => {
      renderDetails();
      await userEvent.click(
        await screen.findByRole("button", { name: "Save to My Library" }),
      );
      expect(
        screen.getByText("Login page, back to /books/works/OL1W"),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 details page rates after signed-out users log in", async () => {
      renderDetails();
      await userEvent.click(
        await screen.findByRole("radio", { name: "4 stars" }),
      );
      expect(
        screen.getByText("Login page, back to /books/works/OL1W"),
      ).toBeInTheDocument();
      expect(saveRating).not.toHaveBeenCalled();
    });
  });

  describe("signed in", () => {
    const SAVED = {
      id: 7,
      bookKey: "/works/OL1W",
      readingStatus: "to_be_read",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    // GET /api/library answers with `library`; the save answers with `status`
    function stubLibrary(
      status: number,
      body: unknown,
      library: { books: unknown[] } = { books: [] },
    ) {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "POST"
            ? jsonResponse(body, status)
            : jsonResponse(library),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    const save = () =>
      userEvent.click(
        screen.getByRole("button", { name: "Save to My Library" }),
      );

    async function renderSignedIn(state?: unknown) {
      renderDetails({ user: USER, state });
      await screen.findByRole("heading", { name: "Dune", level: 1 });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save to My Library" }),
        ).toBeEnabled(),
      );
    }

    it("TST-01-T-1 details page save shows the book as saved", async () => {
      const fetchMock = stubLibrary(201, SAVED);
      await renderSignedIn();
      await save();
      expect(
        await screen.findByRole("combobox", { name: "In your library" }),
      ).toHaveValue("to_be_read");
      expect(
        screen.queryByRole("button", { name: "Save to My Library" }),
      ).not.toBeInTheDocument();

      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(post?.[0]).toBe("/api/library");
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({
        bookKey: "/works/OL1W",
      });
    });

    it("TST-01-T-1 details page shows a book that is already saved", async () => {
      stubLibrary(201, SAVED, {
        books: [{ ...SAVED, readingStatus: "finished" }],
      });
      renderDetails({ user: USER });
      expect(
        await screen.findByRole("combobox", { name: "In your library" }),
      ).toHaveValue("finished");
    });

    it("TST-01-T-1 details page treats a 409 save as saved", async () => {
      const library = { books: [] as unknown[] };
      stubLibrary(409, {}, library);
      await renderSignedIn();
      library.books = [SAVED];
      await save();
      expect(
        await screen.findByRole("combobox", { name: "In your library" }),
      ).toBeInTheDocument();
    });

    it("TST-01-T-1 details page finishes a save started before login", async () => {
      const fetchMock = stubLibrary(201, SAVED);
      renderDetails({ user: USER, state: { pendingSave: "/works/OL1W" } });
      expect(
        await screen.findByRole("combobox", { name: "In your library" }),
      ).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
    });

    it("TST-01-T-1 details page finishes a rating started before login", async () => {
      stubLibrary(201, SAVED);
      renderDetails({ user: USER, state: { pendingRating: 4 } });
      expect(await screen.findByText("Rating saved.")).toBeInTheDocument();
      expect(saveRating).toHaveBeenCalledTimes(1);
      expect(saveRating).toHaveBeenCalledWith("/works/OL1W", 4);
    });

    it.each([
      [401, {}, "Your session has expired. Please log in again."],
      [500, { error: "Database down" }, "Database down"],
      [500, null, "Could not save this book."],
    ])(
      "TST-01-T-1 details page save responds to status %i",
      async (status, body, message) => {
        stubLibrary(status, body);
        await renderSignedIn();
        await save();
        expect(await screen.findByText(message)).toBeInTheDocument();
      },
    );

    it("TST-01-T-1 details page save reports a network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
      await renderSignedIn();
      await save();
      expect(
        await screen.findByText("Could not save this book."),
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
