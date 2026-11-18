import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCollection,
  deleteCollection,
  listCollections,
  renameCollection,
} from "./collectionsApi";
import { jsonResponse } from "./test/renderWithProviders";

const collection = {
  id: 7,
  name: "Favorites",
  createdAt: "2026-01-01",
  bookCount: 0,
};
afterEach(() => vi.unstubAllGlobals());

describe("collectionsApi", () => {
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
