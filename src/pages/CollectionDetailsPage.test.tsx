import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookDetails } from "../../shared/books";
import {
  getBookAvailability,
  getBookDetails,
  getBookISBNs,
  searchLibraryByTitle,
} from "../api/books";
import { getRatings } from "../api/ratings";
import { AuthContext, useAuth } from "../auth/useAuth";
import type { AuthLocationState } from "../routes";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import BookDetailsPage from "./BookDetailsPage";
import PersonalLibraryPage from "./PersonalLibraryPage";
import CollectionDetailsPage from "./CollectionDetailsPage";

vi.mock("../api/books");
vi.mock("../api/ratings");
const USER = { id: 1, email: "reader@example.test" };
const BOOKS = [
  {
    id: 12,
    bookKey: "/works/OL1W",
    readingStatus: "currently_reading",
    createdAt: "2026-01-01",
  },
  {
    id: 13,
    bookKey: "/works/OL2W",
    readingStatus: "finished",
    createdAt: "2026-01-01",
  },
];
const DETAILS: BookDetails[] = [
  {
    key: "/works/OL1W",
    title: "Dune",
    authors: ["Frank Herbert"],
    covers: [42],
    tags: [],
  },
  { key: "/works/OL2W", title: "Emma", authors: ["Jane Austen"], tags: [] },
];
function response(books = BOOKS, name = "Summer Reading", id = 7) {
  return {
    collection: { id, name, createdAt: "2026-01-01", bookCount: books.length },
    books,
  };
}
function stubApi(books = BOOKS) {
  let members = [...books];
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/collections")
        return jsonResponse({ collections: [response(members).collection] });
      if (url === "/api/library") return jsonResponse({ books: BOOKS });
      if (url.startsWith("/api/books/details?")) {
        const key = new URL(url, "http://localhost").searchParams.get("key");
        return jsonResponse(DETAILS.find((book) => book.key === key));
      }
      if (url === "/api/collections/7" && !init?.method)
        return jsonResponse(response(members));
      if (url === "/api/collections/8" && !init?.method)
        return jsonResponse(response([], "School", 8));
      if (
        init?.method === "DELETE" &&
        url.startsWith("/api/collections/7/books/")
      ) {
        const id = Number(url.split("/").at(-1));
        members = members.filter((book) => book.id !== id);
        return new Response(null, { status: 204 });
      }
      if (init?.method === "PATCH")
        return jsonResponse({
          id: Number(url.split("/")[3]),
          readingStatus: JSON.parse(init.body as string).readingStatus,
        });
      return jsonResponse({}, 404);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function LoginDestination() {
  const location = useLocation();
  return (
    <p>
      Login page, back to{" "}
      {(location.state as AuthLocationState | null)?.from?.pathname}
    </p>
  );
}
function renderPage(route = "/personal-library/collections/7") {
  return renderWithProviders(
    <Routes>
      <Route
        path="/personal-library/collections/:collectionId"
        element={<CollectionDetailsPage />}
      />
      <Route path="/books/*" element={<BookDetailsPage />} />
      <Route path="/personal-library" element={<PersonalLibraryPage />} />
      <Route path="/login" element={<LoginDestination />} />
    </Routes>,
    { route, user: USER },
  );
}
const removeDune = () =>
  userEvent.click(
    screen.getByRole("button", { name: "Remove Dune from collection" }),
  );

beforeEach(() => {
  stubApi();
  vi.mocked(searchLibraryByTitle).mockResolvedValue({ results: [] });
  vi.mocked(getBookDetails).mockImplementation(async (key) =>
    DETAILS.find((book) => book.key === key)!,
  );
  vi.mocked(getRatings).mockResolvedValue([
    { bookKey: "/works/OL1W", rating: 4 },
  ]);
  vi.mocked(getBookAvailability).mockResolvedValue({
    status: "not_found",
    availability: null,
    reason: "no_match",
  });
  vi.mocked(getBookISBNs).mockRejectedValue(new Error("unused"));
});

describe("CollectionDetailsPage", () => {
  it("opens collection contents from the My Library collection link", async () => {
    renderPage("/personal-library");
    await userEvent.click(
      await screen.findByRole("link", { name: "Summer Reading" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Summer Reading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Collection books" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Dune from collection" }),
    ).toBeEnabled();
  });
  it("shows the same unavailable state for missing or inaccessible collections", async () => {
    const fetchMock = stubApi();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Collection unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Collection not found");
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(getBookDetails).not.toHaveBeenCalled();
  });
  it("loads a collection and shows its saved-book cards", async () => {
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading collection");
    expect(
      await screen.findByRole("heading", { name: "Summer Reading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 books")).toBeInTheDocument();
    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    expect(screen.getByText("Jane Austen")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Reading status for Dune" }),
    ).toHaveValue("currently_reading");
    expect(
      screen.getByRole("img", { name: "Rated 4 out of 5 stars" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to My Library/ }),
    ).toHaveAttribute("href", "/personal-library");
  });
  it("opens an empty collection without requesting book metadata", async () => {
    stubApi([]);
    renderPage();
    expect(
      await screen.findByText("No books in this collection yet"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 books")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Discover books" }),
    ).toHaveAttribute("href", "/search");
    expect(getBookDetails).not.toHaveBeenCalled();
  });
  it("removes only membership and updates the count after success", async () => {
    const fetchMock = stubApi();
    renderPage();
    await screen.findByText("Dune");
    await removeDune();
    await waitFor(() =>
      expect(screen.queryByText("Dune")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Emma")).toBeInTheDocument();
    expect(screen.getByText("1 book")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "It remains in My Library",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/7/books/12", {
      method: "DELETE",
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === "DELETE" && url.startsWith("/api/library"),
      ),
    ).toBe(false);
  });
  it("keeps the collection after its last membership is removed", async () => {
    stubApi([BOOKS[0]!]);
    renderPage();
    await screen.findByText("Dune");
    await removeDune();
    expect(
      await screen.findByText("No books in this collection yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Summer Reading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 books")).toBeInTheDocument();
  });
  it.each([500, "network"])(
    "keeps a card on removal failure %s and supports retry",
    async (status) => {
      const fetchMock = stubApi();
      renderPage();
      await screen.findByText("Dune");
      if (status === "network")
        fetchMock.mockRejectedValueOnce(new TypeError("offline"));
      else fetchMock.mockResolvedValueOnce(jsonResponse({}, Number(status)));
      await removeDune();
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Dune")).toBeInTheDocument();
      expect(screen.getByText("2 books")).toBeInTheDocument();
      await removeDune();
      await waitFor(() =>
        expect(screen.queryByText("Dune")).not.toBeInTheDocument(),
      );
    },
  );
  it("refreshes stale membership after a removal 404", async () => {
    const fetchMock = stubApi();
    renderPage();
    await screen.findByText("Dune");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse(response([BOOKS[1]!])));
    await removeDune();
    await waitFor(() =>
      expect(screen.queryByText("Dune")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Emma")).toBeInTheDocument();
    expect(screen.getByText("1 book")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Collection contents have changed",
    );
  });
  it("shows unavailable if the collection disappeared during removal", async () => {
    const fetchMock = stubApi();
    renderPage();
    await screen.findByText("Dune");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({}, 404));
    await removeDune();
    expect(
      await screen.findByRole("heading", { name: "Collection unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Collection not found");
  });
  it("keeps fallback cards removable when metadata and ratings fail", async () => {
    const fetchMock = stubApi([BOOKS[0]!]);
    vi.mocked(getBookDetails).mockRejectedValue(
      new Error("Open Library unavailable"),
    );
    vi.mocked(getRatings).mockRejectedValue(new Error("unavailable"));
    renderPage();
    expect(
      await screen.findByText("Book details unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText("/works/OL1W")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove Book details unavailable from collection",
      }),
    );
    expect(
      await screen.findByText("No books in this collection yet"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/7/books/12", {
      method: "DELETE",
    });
  });
  it("updates reading status through the saved-book endpoint", async () => {
    const fetchMock = stubApi();
    renderPage();
    const select = await screen.findByRole("combobox", {
      name: "Reading status for Dune",
    });
    await userEvent.selectOptions(select, "finished");
    await waitFor(() => expect(select).toHaveValue("finished"));
    expect(fetchMock).toHaveBeenCalledWith("/api/library/12/reading-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingStatus: "finished" }),
    });
  });
  it("restores reading status after failure", async () => {
    const fetchMock = stubApi();
    renderPage();
    const select = await screen.findByRole("combobox", {
      name: "Reading status for Dune",
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await userEvent.selectOptions(select, "finished");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update",
    );
    expect(select).toHaveValue("currently_reading");
  });
  it("blocks duplicate removal and conflicting status changes while another card stays usable", async () => {
    const fetchMock = stubApi();
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Remove Dune from collection",
    });
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      screen.getByRole("button", { name: "Removing Dune from collection" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Reading status for Dune" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Emma from collection" }),
    ).toBeEnabled();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(1);
    await act(async () => resolve(new Response(null, { status: 204 })));
    await waitFor(() =>
      expect(screen.queryByText("Dune")).not.toBeInTheDocument(),
    );
  });
  it.each([0, -1, "abc", "1.2", "2147483648"])(
    "rejects invalid route ID %s without a request",
    (id) => {
      const fetchMock = stubApi();
      renderPage(`/personal-library/collections/${id}`);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid collection ID",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("retries failed collection loading", async () => {
    const fetchMock = stubApi();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    renderPage();
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(await screen.findByText("Dune")).toBeInTheDocument();
  });
  it("reports malformed collection responses with a retry", async () => {
    const fetchMock = stubApi();
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read this collection",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
  it.each(["load", "remove", "status"])(
    "offers sign-in after a 401 during %s",
    async (operation) => {
      const fetchMock = stubApi();
      if (operation === "load")
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
      const { auth } = renderPage();
      if (operation !== "load") {
        await screen.findByText("Dune");
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
        if (operation === "remove") await removeDune();
        else
          await userEvent.selectOptions(
            screen.getByRole("combobox", { name: "Reading status for Dune" }),
            "finished",
          );
      }
      await userEvent.click(
        await screen.findByRole("button", { name: "Log in again" }),
      );
      expect(
        await screen.findByText(
          "Login page, back to /personal-library/collections/7",
        ),
      ).toBeInTheDocument();
      expect(auth.logout).toHaveBeenCalledOnce();
    },
  );
  it("opens book details with a collection-specific return path", async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole("button", { name: "View details for Dune" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Back to Summer Reading" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Summer Reading" }),
    ).toBeInTheDocument();
  });
  it("reloads collection counts on returning to My Library", async () => {
    stubApi();
    renderPage();
    await screen.findByText("Dune");
    await removeDune();
    await screen.findByText("1 book");
    await userEvent.click(
      screen.getByRole("link", { name: /Back to My Library/ }),
    );
    const collections = await screen.findByRole("list", {
      name: "Your collections",
    });
    expect(within(collections).getByText("1 book")).toBeInTheDocument();
    // Membership removal did not remove the saved book from the library list.
    expect(
      await within(screen.getByRole("region", { name: "Books" })).findByText(
        "Dune",
      ),
    ).toBeInTheDocument();
  });
  it("discards late loads when navigating to another collection", async () => {
    function Navigation() {
      const navigate = useNavigate();
      return (
        <>
          <button
            onClick={() => void navigate("/personal-library/collections/8")}
          >
            Next collection
          </button>
          <CollectionDetailsPage />
        </>
      );
    }
    const fetchMock = stubApi();
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderWithProviders(
      <Routes>
        <Route
          path="/personal-library/collections/:collectionId"
          element={<Navigation />}
        />
      </Routes>,
      { route: "/personal-library/collections/7", user: USER },
    );
    const oldSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    await userEvent.click(
      screen.getByRole("button", { name: "Next collection" }),
    );
    expect(
      await screen.findByRole("heading", { name: "School" }),
    ).toBeInTheDocument();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolve(jsonResponse(response())));
    expect(screen.queryByText("Summer Reading")).not.toBeInTheDocument();
  });
  it("clears private cards after switching accounts", async () => {
    function AccountSwitch() {
      const auth = useAuth();
      const [user, setUser] = useState(USER);
      return (
        <AuthContext value={{ ...auth, user }}>
          <button
            onClick={() => setUser({ id: 2, email: "second@example.test" })}
          >
            Switch account
          </button>
          <CollectionDetailsPage />
        </AuthContext>
      );
    }
    const fetchMock = stubApi();
    renderWithProviders(
      <Routes>
        <Route
          path="/personal-library/collections/:collectionId"
          element={<AccountSwitch />}
        />
      </Routes>,
      { route: "/personal-library/collections/7", user: USER },
    );
    await screen.findByText("Dune");
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    await userEvent.click(
      screen.getByRole("button", { name: "Switch account" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Collection unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dune")).not.toBeInTheDocument();
  });
  it("ignores a late removal response after navigating away", async () => {
    const fetchMock = stubApi();
    const { unmount } = renderPage();
    await screen.findByText("Dune");
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await removeDune();
    unmount();
    await act(async () => resolve(new Response(null, { status: 204 })));
    expect(screen.queryByText(/Removed “Dune”/)).not.toBeInTheDocument();
  });
});
