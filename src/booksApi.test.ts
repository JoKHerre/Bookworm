import { describe, expect, it, vi } from "vitest";
import { getBookDetails, searchBooks } from "./booksApi";
import { jsonResponse } from "./test/renderWithProviders";

const signal = new AbortController().signal;

describe("booksApi", () => {
  it("TST-01-T-1 searchBooks builds its query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await searchBooks("dune", signal, {
      genre: ["Fantasy", "Mystery"],
      language: "English",
      year: "2020-present",
    });

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/books/search");
    expect(url.searchParams.get("q")).toBe("dune");
    expect(url.searchParams.getAll("genre")).toEqual(["Fantasy", "Mystery"]);
    expect(url.searchParams.get("language")).toBe("English");
    expect(url.searchParams.get("year")).toBe("2020-present");
  });

  it("TST-01-T-1 books api maps failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Book not found" }, 404)),
    );
    await expect(getBookDetails("/works/OL1W", signal)).rejects.toThrow(
      "Book not found",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(getBookDetails("/works/OL1W", signal)).rejects.toThrow(
      "Unable to load books. Please try again.",
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(getBookDetails("/works/OL1W", signal)).rejects.toThrow(
      "Unable to connect. Please try again.",
    );
  });
});
