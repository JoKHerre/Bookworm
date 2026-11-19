import { describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../test/renderWithProviders";
import { ApiRequestError, apiRequest, errorMessage, userError } from "./client";

describe("api/client", () => {
  it("REF-01-T-2 sends a JSON body and returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/x", { method: "POST", body: { a: 1 } }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("REF-01-T-2 returns null for an empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(apiRequest("/api/x")).resolves.toBeNull();
  });

  it("REF-01-T-2 reports the status and server message of a failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Nope" }, 409)),
    );
    const error = await apiRequest("/api/x").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 409, serverMessage: "Nope" });
  });

  it("REF-01-T-2 reports a network failure as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 0 });
  });

  it("REF-01-T-2 rethrows the abort when the caller cancelled", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(abort);
      }),
    );
    await expect(
      apiRequest("/api/x", { signal: controller.signal }),
    ).rejects.toBe(abort);
  });

  it("REF-01-T-2 picks a status message, then the server message, then the fallback", () => {
    const messages = {
      fallback: "Fallback",
      byStatus: { 404: "Missing" },
      useServerMessage: true,
    };
    expect(errorMessage(new ApiRequestError(404, "Server"), messages)).toBe(
      "Missing",
    );
    expect(errorMessage(new ApiRequestError(500, "Server"), messages)).toBe(
      "Server",
    );
    expect(errorMessage(new ApiRequestError(500), messages)).toBe("Fallback");
    expect(
      errorMessage(new ApiRequestError(500, "Server"), {
        fallback: "Fallback",
      }),
    ).toBe("Fallback");
    expect(errorMessage(new TypeError("other"), messages)).toBe("Fallback");
  });

  it("REF-01-T-2 passes errors other than failed requests through userError", () => {
    const abort = new DOMException("Aborted", "AbortError");
    expect(userError(abort, { fallback: "Fallback" })).toBe(abort);
  });
});
