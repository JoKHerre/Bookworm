import { describe, expect, it, vi } from "vitest";
import {
  getBookDetails,
  getSimilarBooks,
  matchImportRows,
  searchBooks,
} from "./books";
import { jsonResponse } from "../test/renderWithProviders";

const signal = new AbortController().signal;

describe("api/books", () => {
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

  it("searchBooks asks for a page only past the first", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ books: [], total: 0 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchBooks("dune", signal);
    await searchBooks("dune", signal, { page: 3 });

    const pages = fetchMock.mock.calls.map(([input]) =>
      new URL(input, "http://localhost").searchParams.get("page"),
    );
    expect(pages).toEqual([null, "3"]);
  });

  it("SRC-05-T-3 serializes exclusions alongside existing search options", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ books: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await searchBooks("dune", signal, {
      genre: ["Fantasy", "Sci-fi"],
      excludeGenre: ["Horror", "Non-fiction"],
      excludeWarning: ["pregnancy", "self-harm"],
      language: "English",
      year: "1990-1999",
      page: 3,
    });

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.searchParams.getAll("genre")).toEqual(["Fantasy", "Sci-fi"]);
    expect(url.searchParams.getAll("excludeGenre")).toEqual([
      "Horror",
      "Non-fiction",
    ]);
    expect(url.searchParams.getAll("excludeWarning")).toEqual([
      "pregnancy",
      "self-harm",
    ]);
    expect(url.searchParams.get("language")).toBe("English");
    expect(url.searchParams.get("year")).toBe("1990-1999");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("SRC-05-T-3 omits absent and empty exclusions from requests", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ books: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await searchBooks("dune", signal);
    await searchBooks("dune", signal, {
      excludeGenre: [],
      excludeWarning: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/books/search?q=dune", {
      signal,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/books/search?q=dune", {
      signal,
    });
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
      "Unable to load books.",
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(getBookDetails("/works/OL1W", signal)).rejects.toThrow(
      "Unable to connect.",
    );
  });

  it("DIS-02-T-3 loads similar books with the work key and caller signal", async () => {
    const response = {
      books: [
        {
          key: "/works/OL2W",
          title: "Foundation",
          author_name: ["Isaac Asimov"],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSimilarBooks("/works/OL1W", signal)).resolves.toEqual(
      response,
    );

    const url = new URL(
      fetchMock.mock.calls[0]?.[0] as string,
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/books/similar");
    expect(url.searchParams.get("key")).toBe("/works/OL1W");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("DIS-02-T-3 accepts empty similar-book results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ books: [] })),
    );
    await expect(getSimilarBooks("/works/OL1W", signal)).resolves.toEqual({
      books: [],
    });
  });

  it("DIS-02-T-3 rejects malformed similar-book responses", async () => {
    for (const response of [
      jsonResponse({}),
      jsonResponse({ books: null }),
      jsonResponse({ books: [{ key: "invalid", title: "A book" }] }),
      new Response("invalid JSON"),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(getSimilarBooks("/works/OL1W", signal)).rejects.toThrow();
    }
  });

  it("DIS-02-T-3 reports similar-book HTTP errors", async () => {
    for (const status of [404, 502]) {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: "Similar books failed" }, status),
          ),
      );
      await expect(getSimilarBooks("/works/OL1W", signal)).rejects.toThrow(
        "Similar books failed",
      );
    }
  });

  it("DIS-02-T-3 reports similar-book network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network down")),
    );
    await expect(getSimilarBooks("/works/OL1W", signal)).rejects.toThrow(
      "Unable to connect.",
    );
  });

  it("DIS-02-T-3 preserves cancelled similar-book requests", async () => {
    const controller = new AbortController();
    const cancelled = new Error("Request cancelled");
    controller.abort(cancelled);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancelled));

    await expect(
      getSimilarBooks("/works/OL1W", controller.signal),
    ).rejects.toBe(cancelled);
  });
  const matchRows = [
    { title: "Dune", author: "Frank Herbert", isbn: "" },
    { title: "Emma", author: "", isbn: "" },
  ];

  it("IMP-02-T-2 matchImportRows posts rows", async () => {
    const results = [
      {
        status: "matched",
        book: {
          key: "/works/OL1W",
          title: "Dune",
          author_name: ["Frank Herbert"],
        },
      },
      { status: "none" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(matchImportRows(matchRows, signal)).resolves.toEqual(results);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/books/match");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ rows: matchRows });
    expect(init.signal).toBe(signal);
  });

  it("IMP-02-T-2 matchImportRows maps failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Not logged in" }, 401)),
    );
    await expect(matchImportRows(matchRows)).rejects.toThrow(
      "Your session has expired. Please log in again.",
    );

    for (const fetchMock of [
      vi.fn().mockResolvedValue(jsonResponse({ error: "Oops" }, 500)),
      vi.fn().mockRejectedValue(new TypeError("down")),
      vi.fn().mockResolvedValue(jsonResponse({ results: [{ status: "?" }] })),
      // one result for two rows
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ results: [{ status: "none" }] })),
    ]) {
      vi.stubGlobal("fetch", fetchMock);
      await expect(matchImportRows(matchRows)).rejects.toThrow(
        "Could not match these books.",
      );
    }
  });
});
