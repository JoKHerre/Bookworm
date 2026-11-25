import { describe, expect, it, vi } from "vitest";
import { importBooks, updateReadingStatus } from "./library";
import { jsonResponse } from "../test/renderWithProviders";

describe("api/library", () => {
  it("updates reading status and validates the returned saved-book identity", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 12, readingStatus: "finished" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await updateReadingStatus(12, "finished")).toEqual({
      id: 12,
      readingStatus: "finished",
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/library/12/reading-status",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingStatus: "finished" }),
      },
    );
  });
  it.each([
    {},
    { id: 13, readingStatus: "finished" },
    { id: 12, readingStatus: "invalid" },
  ])("rejects an invalid reading-status response", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(updateReadingStatus(12, "finished")).rejects.toThrow(
      "Could not update",
    );
  });
  it.each([401, 404, 500])(
    "maps reading-status HTTP %s errors",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({}, status)),
      );
      await expect(updateReadingStatus(12, "finished")).rejects.toMatchObject({
        status,
      });
    },
  );
  it("maps a reading-status network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(updateReadingStatus(12, "finished")).rejects.toMatchObject({
      status: 0,
    });
  });

  it("IMP-01-T-5 importBooks posts the keys", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ added: ["/works/OL1W"], alreadySaved: ["/works/OL2W"] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(importBooks(["/works/OL1W", "/works/OL2W"])).resolves.toEqual({
      added: ["/works/OL1W"],
      alreadySaved: ["/works/OL2W"],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/library/import");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      bookKeys: ["/works/OL1W", "/works/OL2W"],
    });
  });

  it("IMP-01-T-5 importBooks maps failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(importBooks(["/works/OL1W"])).rejects.toThrow(
      "Your session has expired. Please log in again.",
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(importBooks(["/works/OL1W"])).rejects.toThrow(
      "Could not import these books.",
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(importBooks(["/works/OL1W"])).rejects.toThrow(
      "Could not import these books.",
    );
  });

  it("IMP-03-T-3 importBooks rejects a response without key lists", async () => {
    for (const body of [
      { added: 1, alreadySaved: 0 },
      { added: ["/works/OL1W"] },
      { added: [1], alreadySaved: [] },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));
      await expect(importBooks(["/works/OL1W"])).rejects.toThrow(
        "Could not import these books.",
      );
    }
  });
});
