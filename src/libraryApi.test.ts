import { describe, expect, it, vi } from "vitest";
import { importBooks } from "./libraryApi";
import { jsonResponse } from "./test/renderWithProviders";

describe("libraryApi", () => {
  it("IMP-01-T-5 importBooks posts the keys", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ added: 2, alreadySaved: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(importBooks(["/works/OL1W", "/works/OL2W"])).resolves.toEqual({
      added: 2,
      alreadySaved: 1,
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
      "Your session has expired. Please sign in again.",
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
});
