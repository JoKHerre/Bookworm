import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { jsonResponse } from "./test/renderWithProviders";
import { useAuth, type AuthContextValue } from "./useAuth";

const USER = { id: 7, email: "a@b.co" };

// the latest context value, captured after each render
const captured: { auth: AuthContextValue | null } = { auth: null };
const auth = () => captured.auth!;

function Consumer() {
  const auth = useAuth();
  useEffect(() => {
    captured.auth = auth;
  });
  return <p>{auth.loading ? "loading" : (auth.user?.email ?? "signed out")}</p>;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    handler(url, init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderProvider() {
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await waitFor(() => expect(auth().loading).toBe(false));
}

describe("AuthProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("TST-01-T-1 auth provider restores the signed-in user", async () => {
    stubFetch(() => jsonResponse(USER));
    await renderProvider();
    expect(screen.getByText("a@b.co")).toBeInTheDocument();
  });

  it("TST-01-T-1 auth provider is signed out without a session", async () => {
    stubFetch(() => jsonResponse({ error: "no" }, 401));
    await renderProvider();
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("TST-01-T-1 auth provider is signed out when the check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await renderProvider();
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("TST-01-T-1 auth provider logs in and out", async () => {
    const fetchMock = stubFetch((url) =>
      url === "/api/auth/me"
        ? jsonResponse({}, 401)
        : url === "/api/auth/login"
          ? jsonResponse(USER)
          : new Response(null, { status: 204 }),
    );
    await renderProvider();

    await act(() => auth().login({ email: "a@b.co", password: "password123" }));
    expect(screen.getByText("a@b.co")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/auth/login",
    )!;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      email: "a@b.co",
      password: "password123",
    });

    await act(() => auth().logout());
    expect(screen.getByText("signed out")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
  });

  it("TST-01-T-1 auth provider registers a user", async () => {
    stubFetch((url) =>
      url === "/api/auth/register"
        ? jsonResponse(USER, 201)
        : jsonResponse({}, 401),
    );
    await renderProvider();
    await act(() =>
      auth().register({ email: "a@b.co", password: "password123" }),
    );
    expect(screen.getByText("a@b.co")).toBeInTheDocument();
  });

  it("TST-01-T-1 auth provider surfaces login errors", async () => {
    stubFetch((url) =>
      url === "/api/auth/login"
        ? jsonResponse({ error: "Invalid email or password" }, 401)
        : jsonResponse({}, 401),
    );
    await renderProvider();
    await expect(
      act(() => auth().login({ email: "a@b.co", password: "wrongpass1" })),
    ).rejects.toThrow("Invalid email or password");
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("TST-01-T-1 useAuth requires a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useAuth must be used inside an AuthProvider",
    );
  });
});
