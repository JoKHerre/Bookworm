import { describe, expect, it, vi } from "vitest";
import { getRatings, saveRating } from "./ratings";
import { jsonResponse } from "../test/renderWithProviders";

describe("api/ratings", () => {
  it("TST-01-T-1 saveRating sends a PUT", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ bookKey: "/works/OL1W", rating: 4 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveRating("/works/OL1W", 4)).resolves.toEqual({
      bookKey: "/works/OL1W",
      rating: 4,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ratings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      bookKey: "/works/OL1W",
      rating: 4,
    });
  });

  it("TST-01-T-1 saveRating maps failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(saveRating("/works/OL1W", 4)).rejects.toThrow(
      "Please sign in to rate books.",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Bad rating" }, 400)),
    );
    await expect(saveRating("/works/OL1W", 9)).rejects.toThrow("Bad rating");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, 500)));
    await expect(saveRating("/works/OL1W", 4)).rejects.toThrow(
      "Could not save your rating.",
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(saveRating("/works/OL1W", 4)).rejects.toThrow(
      "Unable to connect.",
    );
  });

  it("TST-01-T-1 getRatings returns ratings", async () => {
    const ratings = [{ bookKey: "/works/OL1W", rating: 5 }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ratings })),
    );
    await expect(getRatings()).resolves.toEqual(ratings);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(getRatings()).rejects.toThrow("Could not load your ratings.");
  });

  it("asks for one book's rating", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ratings: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await getRatings(undefined, "/works/OL1W");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/ratings?bookKey=%2Fworks%2FOL1W",
    );
  });
});
