import { describe, expect, it, vi } from "vitest";
import { getRecommendations } from "./recommendations";
import { jsonResponse } from "../test/renderWithProviders";

describe("api/recommendations", () => {
  it("DIS-01-T-3 rejects a malformed recommendations response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ books: [{ key: "OL1W" }] })),
    );
    await expect(getRecommendations()).rejects.toThrow(
      "Could not load recommendations.",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "down" }, 502)),
    );
    await expect(getRecommendations()).rejects.toThrow(
      "Could not load recommendations.",
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(getRecommendations()).rejects.toThrow("Unable to connect.");
  });
});
