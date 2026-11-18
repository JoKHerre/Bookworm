import { describe, expect, it, vi } from "vitest";
import {
  createCollection,
  deleteCollection,
  listCollections,
  listCollectionsForBook,
  addBookToCollection,
  renameCollection,
} from "./collectionsApi";
import { jsonResponse } from "./test/renderWithProviders";

const collection = {
  id: 7,
  name: "Favorites",
  createdAt: "2026-01-01",
  bookCount: 0,
};
describe("collectionsApi", () => {
  it.each([
    null,
    {},
    { collections: {} },
    { collections: [{ ...collection, bookCount: -1 }] },
  ])("rejects malformed collection lists", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(listCollections()).rejects.toThrow(
      "Could not read your collections",
    );
  });
  it.each(["create", "rename"])(
    "rejects malformed %s responses",
    async (operation) => {
      for (const body of [
        null,
        {},
        { ...collection, id: "7" },
        { ...collection, name: null },
        { ...collection, bookCount: -1 },
      ]) {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));
        const result =
          operation === "create"
            ? createCollection("Favorites")
            : renameCollection(7, "Favorites");
        await expect(result).rejects.toThrow(
          operation === "create"
            ? "Could not read the created collection"
            : "Could not read the renamed collection",
        );
      }
    },
  );
  it.each(["list", "create", "rename"])(
    "handles invalid JSON in %s responses",
    async (operation) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response("invalid JSON", { status: 200 })),
      );
      const result =
        operation === "list"
          ? listCollections()
          : operation === "create"
            ? createCollection("Favorites")
            : renameCollection(7, "Favorites");
      await expect(result).rejects.toThrow("Could not read");
    },
  );
  it.each([
    null,
    {},
    { collections: [{}] },
    { collections: [{ ...collection, containsBook: "false" }] },
  ])("rejects malformed membership summaries", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(listCollectionsForBook("/works/OL1W")).rejects.toThrow(
      "Could not read your collection options",
    );
  });
  it("loads membership flags for the encoded work key", async () => {
    const memberships = [{ ...collection, containsBook: true }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ collections: memberships }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await listCollectionsForBook("/works/OL1W", signal)).toEqual(
      memberships,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/collections?bookKey=%2Fworks%2FOL1W",
      { signal },
    );
  });
  it("assigns an unsaved work with one request and no separate library save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: 9,
          bookKey: "/works/OL1W",
          readingStatus: "to_be_read",
          createdAt: "2026-01-01",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      addBookToCollection(7, "/works/OL1W"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/collections/7/books",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookKey: "/works/OL1W" }),
      },
    );
  });
  it.each([
    [400, "identifier is invalid"],
    [401, "session has expired"],
    [404, "book or collection"],
    [409, "already in this collection"],
    [500, "Could not add this book"],
  ])("uses membership-specific errors for HTTP %s", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, Number(status))),
    );
    await expect(addBookToCollection(7, "/works/OL1W")).rejects.toThrow(
      String(message),
    );
  });
  it("preserves deliberate cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancellation = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancellation));
    await expect(
      listCollectionsForBook("/works/OL1W", controller.signal),
    ).rejects.toBe(cancellation);
  });
  it("lists summaries and forwards cancellation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ collections: [collection] }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await listCollections(signal)).toEqual([collection]);
    expect(fetchMock).toHaveBeenCalledWith("/api/collections", { signal });
  });
  it.each(["create", "rename"])(
    "%s sends only the trimmed name and returns the server summary",
    async (operation) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(collection));
      vi.stubGlobal("fetch", fetchMock);
      const result =
        operation === "create"
          ? await createCollection(" Favorites ")
          : await renameCollection(7, " Favorites ");
      expect(result).toEqual(collection);
      expect(fetchMock).toHaveBeenCalledWith(
        operation === "create" ? "/api/collections" : "/api/collections/7",
        {
          method: operation === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Favorites" }),
        },
      );
    },
  );
  it("deletes without parsing the empty response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteCollection(7)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/7", {
      method: "DELETE",
    });
  });
  it.each([
    [400, "1–100"],
    [401, "session has expired"],
    [404, "no longer available"],
    [409, "already exists"],
    [500, "Please try again"],
  ])("handles HTTP %s", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, Number(status))),
    );
    await expect(createCollection("Favorites")).rejects.toThrow(
      String(message),
    );
  });
  it("handles network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(listCollections()).rejects.toThrow(
      "Could not reach your collections",
    );
  });
});
