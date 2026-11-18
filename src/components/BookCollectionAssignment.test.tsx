import {
  act,
  fireEvent,
  screen,
  waitFor,
  render,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import BookCollectionAssignment from "./BookCollectionAssignment";
import type { CollectionMembershipSummary } from "../collectionsApi";
import { jsonResponse } from "../test/renderWithProviders";

function renderWithRouter(ui: ReactElement) {
  return render(ui, { wrapper: MemoryRouter });
}

const FAVORITES: CollectionMembershipSummary = {
  id: 7,
  name: "Favorites",
  createdAt: "2026-01-01",
  bookCount: 0,
  containsBook: false,
};
const SCHOOL = { ...FAVORITES, id: 8, name: "School" };
function setup(
  collections: CollectionMembershipSummary[] = [FAVORITES, SCHOOL],
) {
  const fetchMock = vi.fn(
    async (_url: string, init?: RequestInit): Promise<Response> =>
      init?.method === "POST"
        ? jsonResponse({ id: 9 }, 201)
        : jsonResponse({ collections }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onLogin = vi.fn();
  const view = renderWithRouter(
    <BookCollectionAssignment
      bookKey="/works/OL1W"
      title="Dune"
      onLogin={onLogin}
    />,
  );
  return { fetchMock, onLogin, ...view };
}
async function selectCollection(id = "7") {
  const select = await screen.findByRole("combobox", { name: "Collection" });
  await userEvent.selectOptions(select, id);
  return select;
}
const submit = () =>
  userEvent.click(screen.getByRole("button", { name: "Add to collection" }));

describe("BookCollectionAssignment", () => {
  it("shows persisted membership when the panel is reopened", async () => {
    let added = false;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        added = true;
        return jsonResponse({}, 201);
      }
      return jsonResponse({
        collections: [
          { ...FAVORITES, containsBook: added, bookCount: added ? 1 : 0 },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderWithRouter(
      <BookCollectionAssignment
        bookKey="/works/OL1W"
        title="Dune"
        onLogin={vi.fn()}
      />,
    );
    await selectCollection();
    await submit();
    expect(await screen.findByText(/Added “Dune”/)).toBeInTheDocument();
    unmount();
    renderWithRouter(
      <BookCollectionAssignment
        bookKey="/works/OL1W"
        title="Dune"
        onLogin={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole("option", { name: "Favorites — Already added" }),
    ).toBeDisabled();
  });
  it("reports a failed sign-in action without losing the session error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    vi.stubGlobal("fetch", fetchMock);
    const onLogin = vi.fn().mockRejectedValue(new TypeError("offline"));
    renderWithRouter(
      <BookCollectionAssignment
        bookKey="/works/OL1W"
        title="Dune"
        onLogin={onLogin}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Log in to organize" }),
    );
    expect(
      await screen.findByText("Could not open sign in. Please try again."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByText(/session has expired/)).toBeInTheDocument();
  });
  it("loads membership flags and disables already-added options", async () => {
    setup([{ ...FAVORITES, containsBook: true }, SCHOOL]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading collection options",
    );
    await screen.findByRole("combobox", { name: "Collection" });
    expect(
      screen.getByRole("option", { name: "Favorites — Already added" }),
    ).toBeDisabled();
    expect(screen.getByRole("option", { name: "School" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Add to collection" }),
    ).toBeDisabled();
    expect(
      screen.queryByText(
        "Adding a book to a collection also saves it to My Library.",
      ),
    ).not.toBeInTheDocument();
  });
  it("assigns to multiple collections, marks membership, and clears selection", async () => {
    const { fetchMock } = setup();
    const select = await selectCollection();
    await submit();
    expect(
      await screen.findByText(/Added “Dune” to “Favorites”/),
    ).toHaveAttribute("role", "status");
    expect(select).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "Favorites — Already added" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add to collection" }),
    ).toBeDisabled();
    await selectCollection("8");
    await submit();
    expect(
      await screen.findByText(/already in all your collections/),
    ).toBeInTheDocument();
    expect(select).toBeDisabled();
    const mutations = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(mutations.map(([url]) => url)).toEqual([
      "/api/collections/7/books",
      "/api/collections/8/books",
    ]);
    expect(JSON.parse(mutations[0]?.[1]?.body as string)).toEqual({
      bookKey: "/works/OL1W",
    });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/library")).toBe(
      false,
    );
  });
  it("supports keyboard submission", async () => {
    const { fetchMock } = setup();
    await selectCollection();
    const button = screen.getByRole("button", { name: "Add to collection" });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText(/Added “Dune”/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("links an empty collection list to My Library and supports refreshing", async () => {
    const { fetchMock } = setup([]);
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage collections in My Library" }),
    ).toHaveAttribute("href", "/personal-library");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(jsonResponse({ collections: [FAVORITES] }));
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh collections" }),
    );
    expect(
      await screen.findByRole("option", { name: "Favorites" }),
    ).toBeEnabled();
  });
  it("explains when the book is already in every collection", async () => {
    setup([{ ...FAVORITES, containsBook: true }]);
    expect(
      await screen.findByText(/already in all your collections/),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add to collection" }),
    ).toBeDisabled();
  });
  it.each([400, 500, "network"])(
    "preserves the selection and allows retry after %s",
    async (status) => {
      const { fetchMock } = setup();
      const select = await selectCollection();
      if (status === "network")
        fetchMock.mockRejectedValueOnce(new TypeError("offline"));
      else fetchMock.mockResolvedValueOnce(jsonResponse({}, Number(status)));
      await submit();
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(select).toHaveValue("7");
      expect(screen.getByRole("option", { name: "Favorites" })).toBeEnabled();
      expect(screen.queryByText(/Added “Dune”/)).not.toBeInTheDocument();
      await submit();
      expect(await screen.findByText(/Added “Dune”/)).toBeInTheDocument();
    },
  );
  it.each([404, 409])("refreshes membership after HTTP %s", async (status) => {
    const { fetchMock } = setup();
    await selectCollection();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, status))
      .mockResolvedValueOnce(
        jsonResponse({
          collections:
            status === 404
              ? [SCHOOL]
              : [{ ...FAVORITES, containsBook: true }, SCHOOL],
        }),
      );
    await submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent(
      status === 404 ? "no longer available" : "already in this collection",
    );
    if (status === 404)
      expect(
        screen.queryByRole("option", { name: "Favorites" }),
      ).not.toBeInTheDocument();
    else
      expect(
        screen.getByRole("option", { name: "Favorites — Already added" }),
      ).toBeDisabled();
  });
  it("offers retry when a stale-membership refresh fails", async () => {
    const { fetchMock } = setup();
    await selectCollection();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 409))
      .mockRejectedValueOnce(new TypeError("offline"));
    await submit();
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ collections: [{ ...FAVORITES, containsBook: true }] }),
    );
    await userEvent.click(retry);
    expect(
      await screen.findByText(/already in all your collections/),
    ).toBeInTheDocument();
  });
  it("retries a failed initial load", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse({ collections: [FAVORITES] }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithRouter(
      <BookCollectionAssignment
        bookKey="/works/OL1W"
        title="Dune"
        onLogin={vi.fn()}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(await screen.findByRole("combobox")).toBeEnabled();
  });
  it("requires login after the assignment session expires", async () => {
    const { fetchMock, onLogin } = setup();
    await selectCollection();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "session has expired",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Log in to organize" }),
    );
    expect(onLogin).toHaveBeenCalledOnce();
  });
  it("blocks duplicate submissions until assignment finishes", async () => {
    const { fetchMock } = setup();
    const select = await selectCollection();
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const form = screen.getByRole("form", { name: "Add book to collection" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(select).toBeDisabled();
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Refresh collections" }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => resolve(jsonResponse({}, 201)));
    expect(await screen.findByText(/Added “Dune”/)).toBeInTheDocument();
  });
  it("ignores an old mutation after a new book panel mounts", async () => {
    const { fetchMock, rerender } = setup();
    await selectCollection();
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await submit();
    rerender(
      <BookCollectionAssignment
        key="new-book"
        bookKey="/works/OL2W"
        title="Emma"
        onLogin={vi.fn()}
      />,
    );
    await selectCollection();
    await act(async () => resolve(jsonResponse({}, 201)));
    expect(screen.queryByText(/Added “Dune”/)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Favorites" })).toBeEnabled();
    await submit();
    expect(await screen.findByText(/Added “Emma”/)).toBeInTheDocument();
    const lastCall = fetchMock.mock.calls.at(-1);
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({
      bookKey: "/works/OL2W",
    });
  });
  it("cancels obsolete loads without replacing a new book's options", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ collections: [SCHOOL] }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderWithRouter(
      <BookCollectionAssignment
        key="dune"
        bookKey="/works/OL1W"
        title="Dune"
        onLogin={vi.fn()}
      />,
    );
    const signal = fetchMock.mock.calls[0]?.[1].signal as AbortSignal;
    rerender(
      <BookCollectionAssignment
        key="emma"
        bookKey="/works/OL2W"
        title="Emma"
        onLogin={vi.fn()}
      />,
    );
    expect(signal.aborted).toBe(true);
    expect(
      await screen.findByRole("option", { name: "School" }),
    ).toBeInTheDocument();
    await act(async () => resolve(jsonResponse({ collections: [FAVORITES] })));
    expect(
      screen.queryByRole("option", { name: "Favorites" }),
    ).not.toBeInTheDocument();
  });
});
