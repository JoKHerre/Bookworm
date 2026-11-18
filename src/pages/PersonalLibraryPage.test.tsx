import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookDetails } from "../../shared/books";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";
import PersonalLibraryPage from "./PersonalLibraryPage";

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
  await screen.findByRole("list", { name: "Saved books" }).catch(() => null);
  return view;
}

const titles = () =>
  screen
    .queryAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
const tagBox = (name: string) => screen.getByRole("checkbox", { name });

describe("PersonalLibraryPage", () => {
  beforeEach(() => {
    stubApi(FIXTURES);
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
    const collections = screen.getByRole("region", { name: "Collections" });
    expect(await within(collections).findByRole("alert")).toBeInTheDocument();
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
    expect(screen.getByText("We couldn’t load your books")).toBeInTheDocument();
  });

  it("TST-01-T-1 library shows saved books", async () => {
    renderWithProviders(<PersonalLibraryPage />, {
      route: "/personal-library",
    });
    expect(
      screen.getByText("Loading your personal library..."),
    ).toHaveAttribute("role", "status");
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
      "Could not load your personal library.",
    );

    stubApi(FIXTURES);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dune")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/library");
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

  it("TST-01-T-1 library removes a book", async () => {
    const fetchMock = stubApi(FIXTURES);
    renderWithProviders(<PersonalLibraryPage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove Dune from my library",
      }),
    );

    await waitFor(() => expect(titles()).toEqual(["Emma", "Cosmos"]));
    expect(fetchMock).toHaveBeenCalledWith("/api/library/1", {
      method: "DELETE",
    });
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
