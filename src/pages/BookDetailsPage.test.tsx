import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityResponse } from "../../shared/availability";
import type { BookDetails, SimilarBooksResponse } from "../../shared/books";
import {
  getBookAvailability,
  getBookDetails,
  getBookISBNs,
  getSimilarBooks,
} from "../booksApi";
import { getRatings, saveRating } from "../ratingsApi";
import type { AuthLocationState } from "../routes";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import BookDetailsPage from "./BookDetailsPage";

vi.mock("../booksApi");
vi.mock("../ratingsApi");

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
    vi.mocked(getRatings).mockResolvedValue([]);
    vi.mocked(saveRating).mockResolvedValue({
      bookKey: "/works/OL1W",
      rating: 4,
    });
    vi.mocked(getBookISBNs).mockRejectedValue(new Error("unused"));
    vi.mocked(getSimilarBooks).mockReset().mockResolvedValue({ books: [] });
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

  describe("similar books", () => {
    const recommendations: SimilarBooksResponse = {
      books: [
        {
          key: "/works/OL2W",
          title: "Foundation",
          author_name: ["Isaac Asimov"],
        },
        {
          key: "/works/OL3W",
          title: "A Wizard of Earthsea",
          author_name: ["Ursula K. Le Guin"],
        },
      ],
    };

    it("DIS-02-T-3 loads recommendations after the book details", async () => {
      let finishDetails: (book: BookDetails) => void = () => {};
      let finishRecommendations: (
        data: SimilarBooksResponse,
      ) => void = () => {};
      vi.mocked(getBookDetails).mockReturnValueOnce(
        new Promise((resolve) => {
          finishDetails = resolve;
        }),
      );
      vi.mocked(getSimilarBooks).mockReturnValueOnce(
        new Promise((resolve) => {
          finishRecommendations = resolve;
        }),
      );
      renderDetails();

      expect(getSimilarBooks).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("region", { name: "Similar books" }),
      ).not.toBeInTheDocument();

      await act(async () => finishDetails(BOOK));
      const region = screen.getByRole("region", { name: "Similar books" });
      expect(within(region).getByRole("status")).toHaveTextContent(
        "Loading similar books...",
      );
      expect(getSimilarBooks).toHaveBeenCalledWith(
        BOOK.key,
        expect.any(AbortSignal),
      );

      await act(async () => finishRecommendations(recommendations));
      expect(
        within(region)
          .getAllByRole("button")
          .map((card) => card.getAttribute("aria-label")),
      ).toEqual([
        "View details for Foundation by Isaac Asimov",
        "View details for A Wizard of Earthsea by Ursula K. Le Guin",
      ]);
      expect(within(region).queryByRole("status")).not.toBeInTheDocument();
    });

    it("DIS-02-T-3 skips recommendations when book details fail", async () => {
      vi.mocked(getBookDetails).mockRejectedValueOnce(
        new Error("Book not found"),
      );
      renderDetails();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Book not found",
      );
      expect(getSimilarBooks).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("region", { name: "Similar books" }),
      ).not.toBeInTheDocument();
    });

    it("DIS-02-T-3 shows an empty recommendation response", async () => {
      renderDetails();
      const region = await screen.findByRole("region", {
        name: "Similar books",
      });

      expect(
        await within(region).findByText("No similar books found."),
      ).toBeInTheDocument();
      expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    });

    it("DIS-02-T-3 retries only the failed recommendations", async () => {
      let finishRetry: (data: SimilarBooksResponse) => void = () => {};
      vi.mocked(getSimilarBooks)
        .mockRejectedValueOnce(new Error("Upstream failed"))
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishRetry = resolve;
          }),
        );
      renderDetails();
      const region = await screen.findByRole("region", {
        name: "Similar books",
      });
      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "Unable to load similar books.",
      );

      await userEvent.click(
        within(region).getByRole("button", { name: "Retry" }),
      );
      expect(within(region).getByRole("status")).toHaveTextContent(
        "Loading similar books...",
      );
      expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
      expect(getSimilarBooks).toHaveBeenCalledTimes(2);
      expect(getSimilarBooks).toHaveBeenLastCalledWith(
        BOOK.key,
        expect.any(AbortSignal),
      );
      expect(getBookDetails).toHaveBeenCalledTimes(1);
      expect(getBookAvailability).toHaveBeenCalledTimes(1);
      expect(getBookISBNs).not.toHaveBeenCalled();

      await act(async () => finishRetry(recommendations));
      expect(
        within(region).getByRole("button", {
          name: "View details for Foundation by Isaac Asimov",
        }),
      ).toBeInTheDocument();
      expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
      expect(within(region).queryByRole("status")).not.toBeInTheDocument();
    });

    it("DIS-02-T-3 opens a recommendation and returns with Back", async () => {
      vi.mocked(getBookDetails)
        .mockResolvedValueOnce(BOOK)
        .mockResolvedValueOnce({
          ...BOOK,
          key: "/works/OL2W",
          title: "Foundation",
          authors: ["Isaac Asimov"],
        });
      vi.mocked(getSimilarBooks)
        .mockResolvedValueOnce(recommendations)
        .mockReturnValueOnce(new Promise(() => {}));
      renderDetails();

      await userEvent.click(
        await screen.findByRole("button", {
          name: "View details for Foundation by Isaac Asimov",
        }),
      );
      expect(
        await screen.findByRole("heading", { name: "Foundation", level: 1 }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(getSimilarBooks).toHaveBeenLastCalledWith(
          "/works/OL2W",
          expect.any(AbortSignal),
        ),
      );
      const region = screen.getByRole("region", { name: "Similar books" });
      expect(within(region).getByRole("status")).toHaveTextContent(
        "Loading similar books...",
      );
      expect(within(region).queryByRole("button")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(
        await screen.findByRole("heading", { name: "Dune", level: 1 }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(getSimilarBooks).toHaveBeenLastCalledWith(
          BOOK.key,
          expect.any(AbortSignal),
        ),
      );
    });

    it.each(["success", "failure"])(
      "DIS-02-T-3 ignores late %s after changing books",
      async (outcome) => {
        let finishOld: () => void = () => {};
        let finishNew: (data: SimilarBooksResponse) => void = () => {};
        vi.mocked(getBookDetails)
          .mockResolvedValueOnce(BOOK)
          .mockResolvedValueOnce({
            ...BOOK,
            key: "/works/OL2W",
            title: "Foundation",
            authors: ["Isaac Asimov"],
          });
        vi.mocked(getSimilarBooks)
          .mockReturnValueOnce(
            new Promise((resolve, reject) => {
              finishOld = () => {
                if (outcome === "success") {
                  resolve({
                    books: [
                      { key: "/works/OL9W", title: "Old recommendation" },
                    ],
                  });
                } else {
                  reject(new Error("Late failure"));
                }
              };
            }),
          )
          .mockReturnValueOnce(
            new Promise((resolve) => {
              finishNew = resolve;
            }),
          );

        renderWithProviders(
          <>
            <Link to="/books/works/OL2W">Another book</Link>
            <Routes>
              <Route path="/books/*" element={<BookDetailsPage />} />
            </Routes>
          </>,
          { route: "/books/works/OL1W" },
        );
        await screen.findByRole("region", { name: "Similar books" });
        const oldSignal = vi.mocked(getSimilarBooks).mock.calls[0]?.[1];

        await userEvent.click(
          screen.getByRole("link", { name: "Another book" }),
        );
        await screen.findByRole("heading", { name: "Foundation", level: 1 });
        await waitFor(() => expect(getSimilarBooks).toHaveBeenCalledTimes(2));
        expect(oldSignal?.aborted).toBe(true);

        await act(async () => finishOld());
        const region = screen.getByRole("region", { name: "Similar books" });
        expect(within(region).getByRole("status")).toHaveTextContent(
          "Loading similar books...",
        );
        expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Old recommendation"),
        ).not.toBeInTheDocument();

        await act(async () =>
          finishNew({
            books: [{ key: "/works/OL3W", title: "Current recommendation" }],
          }),
        );
        expect(
          within(region).getByRole("button", {
            name: "View details for Current recommendation by Unknown author",
          }),
        ).toBeInTheDocument();
      },
    );

    it("DIS-02-T-3 aborts recommendations when leaving the page", async () => {
      vi.mocked(getSimilarBooks).mockReturnValueOnce(new Promise(() => {}));
      const { unmount } = renderDetails();
      await screen.findByRole("region", { name: "Similar books" });
      const signal = vi.mocked(getSimilarBooks).mock.calls[0]?.[1];
      expect(signal?.aborted).toBe(false);

      unmount();
      expect(signal?.aborted).toBe(true);
    });

    it("DIS-02-T-3 loads recommendations without waiting for availability or ISBNs", async () => {
      vi.mocked(getSimilarBooks).mockResolvedValueOnce(recommendations);
      vi.mocked(getBookAvailability).mockReturnValueOnce(new Promise(() => {}));
      vi.mocked(getBookISBNs).mockReturnValueOnce(new Promise(() => {}));
      renderDetails();

      expect(
        await screen.findByRole("button", {
          name: "View details for Foundation by Isaac Asimov",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Checking library...")).toBeInTheDocument();
      expect(getBookISBNs).not.toHaveBeenCalled();

      await userEvent.click(
        screen.getByRole("heading", { name: "ISBNs", level: 2 }),
      );
      await waitFor(() => expect(getBookISBNs).toHaveBeenCalledTimes(1));
      expect(
        screen.getByRole("button", {
          name: "View details for Foundation by Isaac Asimov",
        }),
      ).toBeInTheDocument();
    });

    it("DIS-02-T-3 keeps availability and ISBNs usable while recommendations load", async () => {
      vi.mocked(getSimilarBooks).mockReturnValueOnce(new Promise(() => {}));
      vi.mocked(getBookISBNs).mockResolvedValueOnce({
        groups: {
          physical: { isbn_13: ["9780306406157"], isbn_10: [] },
          ebook: { isbn_13: [], isbn_10: [] },
          other: { isbn_13: [], isbn_10: [] },
        },
        pagination: {
          offset: 0,
          editionsChecked: 1,
          totalEditions: 1,
          nextOffset: null,
        },
      });
      renderDetails();

      expect(
        await screen.findByText(
          "No catalog match was found for the ISBNs checked.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("A desert planet.")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("heading", { name: "ISBNs", level: 2 }),
      );
      expect(await screen.findByText("9780306406157")).toBeInTheDocument();
      const region = screen.getByRole("region", { name: "Similar books" });
      expect(within(region).getByRole("status")).toHaveTextContent(
        "Loading similar books...",
      );
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
