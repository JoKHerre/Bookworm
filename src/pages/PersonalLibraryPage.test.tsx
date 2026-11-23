import userEvent from "@testing-library/user-event";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookDetails } from "../../shared/books";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import PersonalLibraryPage, { UNDO_REMOVE_MS } from "./PersonalLibraryPage";

interface Fixture {
  id: number;
  bookKey: string;
  title: string;
  tags: string[] | null; // null: details fail to load
  readingStatus?: string;
}

const FIXTURES: Fixture[] = [
  { id: 1, bookKey: "/works/OL1W", title: "Dune", tags: ["fiction", "space"] },
  {
    id: 2,
    bookKey: "/works/OL2W",
    title: "Emma",
    tags: ["fiction", "romance"],
  },
  {
    id: 3,
    bookKey: "/works/OL3W",
    title: "Cosmos",
    tags: ["space", "science"],
  },
];

// route-aware fetch stub for the library, details, ratings, and mutation endpoints
function stubApi(
  fixtures: Fixture[],
  { ratings = [] as unknown[], libraryStatus = 200 } = {},
) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (input === "/api/collections" && method === "GET") {
      return jsonResponse({ collections: [] });
    }
    if (input === "/api/library" && method === "GET") {
      if (libraryStatus !== 200) return jsonResponse({}, libraryStatus);
      return jsonResponse({
        books: fixtures.map((f) => ({
          id: f.id,
          bookKey: f.bookKey,
          createdAt: "2026-01-01T00:00:00Z",
          readingStatus: f.readingStatus ?? "to_be_read",
        })),
      });
    }
    if (input.startsWith("/api/books/details")) {
      const key = new URL(input, "http://x").searchParams.get("key");
      const fixture = fixtures.find((f) => f.bookKey === key);
      if (!fixture?.tags) return jsonResponse({}, 502);
      return jsonResponse({
        key: fixture.bookKey,
        title: fixture.title,
        authors: ["Someone"],
        tags: fixture.tags,
      } satisfies Partial<BookDetails>);
    }
    if (input === "/api/ratings") return jsonResponse({ ratings });
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (method === "PATCH") {
      const { readingStatus } = JSON.parse(init?.body as string);
      return jsonResponse({ id: 1, readingStatus });
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderPage() {
  const view = renderWithProviders(<PersonalLibraryPage />, {
    route: "/personal-library",
    user: { id: 1, email: "a@b.co" },
  });
  await screen.findByText("Dune");
  return view;
}

const titles = () =>
  within(screen.getByRole("region", { name: "Books" }))
    .queryAllByRole("button", { name: /^View details for / })
    .map((button) => button.textContent);
const tagBox = (name: string) => screen.getByRole("checkbox", { name });

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Keep server counts and flags tied to actual memberships, including after DELETE.
function stubCollectionRemovals({
  deleteResponse,
  membershipResponse,
}: {
  deleteResponse?: (id: number) => Promise<Response>;
  membershipResponse?: (key: string, data: unknown) => Promise<Response>;
} = {}) {
  const fetchMock = stubApi(FIXTURES);
  const original = fetchMock.getMockImplementation()!;
  const deleted = new Set<number>();
  const groups = [
    { id: 7, name: "Favorites", books: [1, 2, 3] },
    { id: 8, name: "Space", books: [1, 3] },
    { id: 9, name: "Classics", books: [2] },
  ];
  fetchMock.mockImplementation(async (input, init) => {
    if (input.startsWith("/api/collections")) {
      const key = new URL(input, "http://x").searchParams.get("bookKey");
      const book = FIXTURES.find((book) => book.bookKey === key);
      const data = {
        collections: groups.map((group) => ({
          id: group.id,
          name: group.name,
          createdAt: "2026-01-01",
          bookCount: group.books.filter((id) => !deleted.has(id)).length,
          ...(key
            ? {
                containsBook:
                  !!book &&
                  group.books.includes(book.id) &&
                  !deleted.has(book.id),
              }
            : {}),
        })),
      };
      return key && membershipResponse
        ? membershipResponse(key, data)
        : jsonResponse(data);
    }
    if (init?.method === "DELETE") {
      const id = Number(input.split("/").at(-1));
      const response = deleteResponse
        ? await deleteResponse(id)
        : new Response(null, { status: 204 });
      if (response.ok) deleted.add(id);
      return response;
    }
    return original(input, init);
  });
  return fetchMock;
}

function expectCollectionCount(name: string, count: number) {
  const card = screen.getByText(name, { selector: "a" }).closest("li")!;
  expect(
    within(card).getByText(`${count} ${count === 1 ? "book" : "books"}`),
  ).toBeInTheDocument();
}

describe("PersonalLibraryPage", () => {
  beforeEach(() => {
    stubApi(FIXTURES);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adjusts only affected collection counts and restores them on Undo across tabs", async () => {
    const fetchMock = stubCollectionRemovals();
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Collections" }));
    await waitFor(() => expectCollectionCount("Favorites", 2));
    expectCollectionCount("Space", 1);
    expectCollectionCount("Classics", 1);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expectCollectionCount("Favorites", 3);
    expectCollectionCount("Space", 2);
    await userEvent.click(screen.getByRole("tab", { name: "Books" }));
    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("refreshes confirmed counts without subtracting a deleted book twice", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubCollectionRemovals();
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await waitFor(() => expectCollectionCount("Favorites", 2));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    await waitFor(() => expectCollectionCount("Favorites", 2));
    expectCollectionCount("Space", 1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/collections"),
    ).toHaveLength(2);
    expect(titles()).toEqual(["Emma", "Cosmos"]);
  });

  it("restores the book and counts when deletion fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubCollectionRemovals({
      deleteResponse: async () => jsonResponse({}, 500),
    });
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await waitFor(() => expectCollectionCount("Favorites", 2));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not remove “Dune”",
    );
    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
    await waitFor(() => expectCollectionCount("Favorites", 3));
    expectCollectionCount("Space", 2);
  });

  it("keeps an earlier removal hidden while another is pending and supports Undo of the latest", async () => {
    const deletion = deferredResponse();
    stubCollectionRemovals({ deleteResponse: () => deletion.promise });
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await waitFor(() => expectCollectionCount("Favorites", 2));
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Emma from my library" }),
    );
    expect(titles()).toEqual(["Cosmos"]);
    await waitFor(() => expectCollectionCount("Favorites", 1));
    expectCollectionCount("Classics", 0);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(titles()).toEqual(["Emma", "Cosmos"]);
    expectCollectionCount("Favorites", 2);
    await act(async () =>
      deletion.resolve(new Response(null, { status: 204 })),
    );
    await waitFor(() => expectCollectionCount("Favorites", 2));
    expectCollectionCount("Space", 1);
    expectCollectionCount("Classics", 1);
  });

  it("ignores membership results arriving after Undo", async () => {
    const lookup = deferredResponse();
    let membershipData: unknown;
    stubCollectionRemovals({
      membershipResponse: async (_key, data) => {
        membershipData = data;
        return lookup.promise;
      },
    });
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await act(async () => lookup.resolve(jsonResponse(membershipData)));
    expectCollectionCount("Favorites", 3);
    expectCollectionCount("Space", 2);
    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
  });

  it("reconciles shared collection counts when overlapping deletions finish out of order", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = deferredResponse();
    const second = deferredResponse();
    stubCollectionRemovals({
      deleteResponse: (id) => (id === 1 ? first.promise : second.promise),
    });
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await waitFor(() => expectCollectionCount("Favorites", 2));
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Emma from my library" }),
    );
    await waitFor(() => expectCollectionCount("Favorites", 1));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
    expect(titles()).toEqual(["Cosmos"]);
    await act(async () => second.resolve(new Response(null, { status: 204 })));
    await waitFor(() => expectCollectionCount("Favorites", 1));
    expectCollectionCount("Classics", 0);
    await act(async () => first.resolve(new Response(null, { status: 204 })));
    await waitFor(() => expectCollectionCount("Favorites", 1));
    expectCollectionCount("Space", 1);
    expectCollectionCount("Classics", 0);
    expect(titles()).toEqual(["Cosmos"]);
  });

  it("ignores an old membership response after deletion has been confirmed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const lookup = deferredResponse();
    let membershipData: unknown;
    stubCollectionRemovals({
      membershipResponse: async (_key, data) => {
        membershipData = data;
        return lookup.promise;
      },
    });
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    await waitFor(() => expectCollectionCount("Favorites", 2));
    await act(async () => lookup.resolve(jsonResponse(membershipData)));
    expectCollectionCount("Favorites", 2);
    expectCollectionCount("Space", 1);
  });

  it("keeps known counts when membership lookup fails, then refreshes after deletion", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubCollectionRemovals({
      membershipResponse: async () => jsonResponse({}, 500),
    });
    await renderPage();
    await screen.findByText("Favorites");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    );
    expectCollectionCount("Favorites", 3);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    await waitFor(() => expectCollectionCount("Favorites", 2));
    expectCollectionCount("Space", 1);
  });

  it("defaults to Books and switches panels without losing tag filters", async () => {
    await renderPage();
    const books = screen.getByRole("tab", { name: "Books" });
    const collections = screen.getByRole("tab", { name: "Collections" });
    expect(books).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Books" })).toBeVisible();
    await userEvent.click(tagBox("romance"));
    expect(titles()).toEqual(["Emma"]);
    await userEvent.click(collections);
    expect(collections).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Collections" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Books" }),
    ).not.toBeInTheDocument();
    await userEvent.click(books);
    expect(tagBox("romance")).toBeChecked();
    expect(titles()).toEqual(["Emma"]);
  });

  it("opens Collections directly and supports keyboard tab navigation", async () => {
    renderWithProviders(<PersonalLibraryPage />, {
      route: "/personal-library?tab=collections",
    });
    const books = screen.getByRole("tab", { name: "Books" });
    const collections = screen.getByRole("tab", { name: "Collections" });
    expect(collections).toHaveAttribute("aria-selected", "true");
    expect(books).toHaveAttribute("tabindex", "-1");
    collections.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(books).toHaveFocus();
    expect(books).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(collections).toHaveFocus();
    expect(collections).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(books).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(collections).toHaveFocus();
  });

  it("COL-05-T-2 keeps books usable when collections fail to load", async () => {
    const fetchMock = stubApi(FIXTURES);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      input === "/api/collections"
        ? jsonResponse({}, 500)
        : original(input, init),
    );
    renderWithProviders(<PersonalLibraryPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Collections" }));
    const collections = screen.getByRole("region", { name: "Collections" });
    expect(await within(collections).findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Books" }));
    expect(await screen.findByText("Dune")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Reading status for Dune" }),
      "finished",
    );
    expect(
      screen.getByRole("combobox", { name: "Reading status for Dune" }),
    ).toHaveValue("finished");
  });

  it("COL-05-T-2 allows collection creation when books fail to load", async () => {
    const fetchMock = stubApi(FIXTURES, { libraryStatus: 500 });
    renderWithProviders(<PersonalLibraryPage />);
    expect(
      await screen.findByText("We couldn’t load your books"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Collections" }));
    await userEvent.click(
      screen.getByRole("button", { name: "New collection" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Collection name" }),
      "School",
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { id: 1, name: "School", createdAt: "2026-01-01", bookCount: 0 },
        201,
      ),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create collection" }),
    );
    expect(await screen.findByText("School")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Books" }));
    expect(screen.getByText("We couldn’t load your books")).toBeVisible();
  });

  it("TST-01-T-1 library shows saved books", async () => {
    renderWithProviders(<PersonalLibraryPage />, {
      route: "/personal-library",
    });
    expect(screen.getByText("Loading…")).toHaveAttribute("role", "status");
    expect(await screen.findByText("Dune")).toBeInTheDocument();
    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
    expect(
      screen.getByRole("combobox", { name: "Reading status for Dune" }),
    ).toHaveValue("to_be_read");
  });

  it("TST-01-T-1 library shows load error", async () => {
    const fetchMock = stubApi(FIXTURES, { libraryStatus: 500 });
    renderWithProviders(<PersonalLibraryPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t load your books",
    );

    stubApi(FIXTURES);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dune")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/library", expect.anything());
  });

  it("TST-01-T-1 library empty state", async () => {
    stubApi([]);
    renderWithProviders(<PersonalLibraryPage />);
    expect(
      await screen.findByText("Your library is ready for its first book"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Filter by tags")).not.toBeInTheDocument();
  });

  it("TST-01-T-1 library updates reading status", async () => {
    const fetchMock = stubApi(FIXTURES);
    renderWithProviders(<PersonalLibraryPage />);
    const select = await screen.findByRole("combobox", {
      name: "Reading status for Dune",
    });

    await userEvent.selectOptions(select, "finished");

    await waitFor(() => expect(select).toHaveValue("finished"));
    const call = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(call?.[0]).toBe("/api/library/1/reading-status");
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({
      readingStatus: "finished",
    });
  });

  it("TST-01-T-1 library removes a book after the undo window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubApi(FIXTURES);
    renderWithProviders(<PersonalLibraryPage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove Dune from my library",
      }),
    );

    expect(titles()).toEqual(["Emma", "Cosmos"]);
    expect(screen.getByText("Removed “Dune”.")).toBeInTheDocument();
    const deletes = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deletes()).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    expect(fetchMock).toHaveBeenCalledWith("/api/library/1", {
      method: "DELETE",
    });
    await waitFor(() =>
      expect(screen.queryByText("Removed “Dune”.")).not.toBeInTheDocument(),
    );
    expect(titles()).toEqual(["Emma", "Cosmos"]);
  });

  it("TST-01-T-1 library undoes a removal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubApi(FIXTURES);
    renderWithProviders(<PersonalLibraryPage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove Dune from my library",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_REMOVE_MS));
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("TST-01-T-1 library removes a book when leaving the page", async () => {
    const fetchMock = stubApi(FIXTURES);
    const { unmount } = renderWithProviders(<PersonalLibraryPage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove Dune from my library",
      }),
    );
    unmount();
    expect(fetchMock).toHaveBeenCalledWith("/api/library/1", {
      method: "DELETE",
    });
  });

  it("TST-01-T-1 library groups books by reading status", async () => {
    const statuses: Record<number, string> = {
      1: "finished",
      3: "currently_reading",
    };
    stubApi(
      FIXTURES.map((fixture) => ({
        ...fixture,
        readingStatus: statuses[fixture.id],
      })),
    );
    renderWithProviders(<PersonalLibraryPage />);
    await screen.findByText("Dune");

    const shelves = screen.getAllByRole("list");
    expect(shelves.map((list) => list.getAttribute("aria-labelledby"))).toEqual(
      ["shelf-currently_reading", "shelf-to_be_read", "shelf-finished"],
    );
    expect(titles()).toEqual(["Cosmos", "Emma", "Dune"]);
    expect(
      within(screen.getByRole("list", { name: /To Be Read/ })).getByText(
        "Emma",
      ),
    ).toBeInTheDocument();
  });

  it("TST-01-T-1 library shows saved books before their details load", async () => {
    const fetchMock = stubApi(FIXTURES);
    let resolveDetails: (response: Response) => void = () => {};
    const details = new Promise<Response>((resolve) => {
      resolveDetails = resolve;
    });
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) =>
      input.startsWith("/api/books/details")
        ? details
        : jsonResponse(
            input === "/api/ratings"
              ? { ratings: [] }
              : {
                  books: [
                    {
                      id: 1,
                      bookKey: "/works/OL1W",
                      createdAt: "2026-01-01T00:00:00Z",
                      readingStatus: "to_be_read",
                    },
                  ],
                },
            init?.method === "DELETE" ? 204 : 200,
          ),
    );
    renderWithProviders(<PersonalLibraryPage />);

    expect(
      await screen.findByRole("button", { name: "View details for Loading…" }),
    ).toBeInTheDocument();
    resolveDetails(
      jsonResponse({
        key: "/works/OL1W",
        title: "Dune",
        authors: ["Someone"],
        tags: [],
      }),
    );
    expect(await screen.findByText("Dune")).toBeInTheDocument();
  });

  it("TST-01-T-1 library shows ratings", async () => {
    stubApi(FIXTURES, { ratings: [{ bookKey: "/works/OL1W", rating: 4 }] });
    renderWithProviders(<PersonalLibraryPage />);
    expect(
      await screen.findByRole("img", { name: "Rated 4 out of 5 stars" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Rated/ })).toHaveLength(1);
  });

  it("TST-01-T-1 library tags narrow the list", async () => {
    await renderPage();
    await screen.findByText("Dune");

    await userEvent.click(tagBox("fiction"));
    expect(titles()).toEqual(["Dune", "Emma"]);

    await userEvent.click(tagBox("space"));
    expect(titles()).toEqual(["Dune"]);

    await userEvent.click(tagBox("space"));
    expect(titles()).toEqual(["Dune", "Emma"]);
    expect(tagBox("fiction")).toBeChecked();
  });

  it("TST-01-T-1 library clear tags", async () => {
    await renderPage();
    await screen.findByText("Dune");
    const clear = screen.getByRole("button", { name: "Clear tags" });
    expect(clear).toBeDisabled();

    await userEvent.click(tagBox("space"));
    expect(clear).toBeEnabled();
    await userEvent.click(clear);

    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
    expect(tagBox("space")).not.toBeChecked();
    expect(clear).toBeDisabled();
  });

  it("TST-01-T-1 library no tag match message", async () => {
    await renderPage();
    await screen.findByText("Dune");

    await userEvent.click(tagBox("romance"));
    await userEvent.click(tagBox("science"));

    expect(screen.getByText("No books match these tags.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear tags" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Clear tags" }));
    expect(titles()).toEqual(["Dune", "Emma", "Cosmos"]);
  });

  it("TST-01-T-1 library drops removed tags", async () => {
    await renderPage();
    await screen.findByText("Dune");
    await userEvent.click(tagBox("science"));
    expect(titles()).toEqual(["Cosmos"]);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Cosmos from my library" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: "science" }),
      ).not.toBeInTheDocument(),
    );
    // the dropped tag no longer filters the remaining books
    expect(titles()).toEqual(["Dune", "Emma"]);
    const group = screen.getByRole("group", { name: "Filter by tags" });
    expect(
      within(group).getByRole("button", { name: "Clear tags" }),
    ).toBeDisabled();
  });

  it("IMP-01-T-2 library links to the import page", async () => {
    renderWithProviders(<PersonalLibraryPage />);
    expect(screen.getByRole("link", { name: "Import books" })).toHaveAttribute(
      "href",
      "/import",
    );
  });
});
