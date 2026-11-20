import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CollectionsManager from "./CollectionsManager";
import { jsonResponse, renderWithProviders } from "../test/renderWithProviders";

const collection = {
  id: 7,
  name: "Favorites",
  createdAt: "2026-01-01",
  bookCount: 2,
};
function setup(collections = [collection]) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ collections }));
  vi.stubGlobal("fetch", fetchMock);
  const view = renderWithProviders(<CollectionsManager />);
  return { fetchMock, ...view };
}
async function openCreate() {
  await userEvent.click(
    await screen.findByRole("button", { name: "New collection" }),
  );
  return screen.getByRole("textbox", { name: "Collection name" });
}
describe("CollectionsManager", () => {
  it("reports malformed collection lists and recovers on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ collections: [collection] }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<CollectionsManager />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load your collections",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Favorites")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Favorites" })).toHaveAttribute(
      "href",
      "/personal-library/collections/7",
    );
  });
  it.each(["create", "rename"])(
    "preserves input and existing collections after a malformed %s response",
    async (operation) => {
      const { fetchMock } = setup();
      await screen.findByText("Favorites");
      if (operation === "create") await openCreate();
      else
        await userEvent.click(
          screen.getByRole("button", { name: "Rename Favorites" }),
        );
      const input = screen.getByRole("textbox", { name: "Collection name" });
      await userEvent.clear(input);
      await userEvent.type(input, "School");
      fetchMock.mockResolvedValueOnce(
        jsonResponse({}, operation === "create" ? 201 : 200),
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: operation === "create" ? "Create collection" : "Save changes",
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not confirm",
      );
      expect(screen.getByText("Favorites")).toBeInTheDocument();
      expect(input).toHaveValue("School");
    },
  );
  it("loads names and counts including empty collections", async () => {
    setup([collection, { ...collection, id: 8, name: "Empty", bookCount: 0 }]);
    expect(screen.getByText("Loading collections…")).toBeInTheDocument();
    expect(await screen.findByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("2 books")).toBeInTheDocument();
    expect(screen.getByText("0 books")).toBeInTheDocument();
  });
  it("creates an empty collection with keyboard submission and restores focus", async () => {
    const { fetchMock } = setup([]);
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
    const input = await openCreate();
    expect(input).toHaveFocus();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...collection, name: "Summer", bookCount: 0 }, 201),
    );
    await userEvent.type(input, " Summer {Enter}");
    expect(await screen.findByText("Summer")).toBeInTheDocument();
    expect(screen.getByText("0 books")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New collection" }),
    ).toHaveFocus();
  });
  it.each([
    ["", "Enter a collection name."],
    ["   ", "Enter a collection name."],
    ["a".repeat(101), "Collection names can be up to 100 characters."],
    ["bad\0name", "This name contains unsupported characters."],
  ])("rejects invalid name %j without a mutation", async (name, message) => {
    const { fetchMock } = setup([]);
    const input = await openCreate();
    fireEvent.change(input, { target: { value: name } });
    await userEvent.click(
      screen.getByRole("button", { name: "Create collection" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveAccessibleDescription(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue(name);
  });
  it.each(["a", "😀".repeat(100)])(
    "accepts the name length boundary",
    async (name) => {
      const { fetchMock } = setup([]);
      const input = await openCreate();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ ...collection, name, bookCount: 0 }, 201),
      );
      fireEvent.change(input, { target: { value: name } });
      await userEvent.click(
        screen.getByRole("button", { name: "Create collection" }),
      );
      expect(await screen.findByText(name)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it("prefills rename, disables unchanged names, and allows case-only renames", async () => {
    const { fetchMock } = setup();
    const button = await screen.findByRole("button", {
      name: "Rename Favorites",
    });
    await userEvent.click(button);
    const input = screen.getByRole("textbox", { name: "Collection name" });
    expect(input).toHaveValue("Favorites");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "FAVORITES" } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...collection, name: "FAVORITES" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("FAVORITES")).toBeInTheDocument();
    expect(screen.getByText("2 books")).toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/collections/7");
  });
  it.each(["create", "rename", "delete"])(
    "cancels %s without a mutation",
    async (kind) => {
      const { fetchMock } = setup();
      if (kind === "create") await openCreate();
      else
        await userEvent.click(
          await screen.findByRole("button", {
            name: `${kind === "rename" ? "Rename" : "Delete"} Favorites`,
          }),
        );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Favorites")).toBeInTheDocument();
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
    },
  );
  it("confirms deletion and keeps other collections", async () => {
    const { fetchMock } = setup([
      collection,
      { ...collection, id: 8, name: "Other" },
    ]);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Favorites" }),
    );
    expect(
      screen.getByText(/Its books will stay in My Library/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete collection" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Favorites")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New collection" }),
    ).toHaveFocus();
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({ method: "DELETE" });
  });
  it.each([
    [400, "1–100"],
    [401, "session has expired"],
    [409, "already have a collection with that name"],
    [500, "Could not create this collection"],
  ])(
    "preserves input after HTTP %s and allows retry",
    async (status, message) => {
      const { fetchMock } = setup([]);
      const input = await openCreate();
      await userEvent.type(input, "Summer");
      fetchMock.mockResolvedValueOnce(jsonResponse({}, Number(status)));
      await userEvent.click(
        screen.getByRole("button", { name: "Create collection" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        String(message),
      );
      expect(input).toHaveValue("Summer");
      expect(
        screen.getByRole("button", { name: "Create collection" }),
      ).toBeEnabled();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ ...collection, name: "Summer" }, 201),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Create collection" }),
      );
      expect(await screen.findByText("Summer")).toBeInTheDocument();
    },
  );
  it("preserves the row on deletion failure", async () => {
    const { fetchMock } = setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Favorites" }),
    );
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete collection" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not delete this collection",
    );
    expect(screen.getByText("Favorites")).toBeInTheDocument();
  });
  it("refreshes stale collections after a 404", async () => {
    const { fetchMock } = setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Favorites" }),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ collections: [] }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete collection" }),
    );
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
    expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Refreshing your collections/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Loading collections…")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("retries a failed initial load", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse({ collections: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<CollectionsManager />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
  });
  it("blocks duplicate submissions while pending and ignores completion after unmount", async () => {
    const { fetchMock, unmount } = setup([]);
    const input = await openCreate();
    await userEvent.type(input, "Summer");
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const form = screen.getByRole("form", { name: "Create collection" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => resolve(jsonResponse(collection, 201)));
  });
});
