import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { PublicUser } from "../../shared/auth";
import { AuthContext, type AuthContextValue } from "../auth/useAuth";

interface Options {
  route?: string | { pathname: string; state?: unknown };
  user?: PublicUser | null;
  loading?: boolean;
}

// Render `ui` at `route` with a router and a mocked auth context.
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", user = null, loading = false }: Options = {},
) {
  const auth: AuthContextValue = {
    user,
    loading,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };

  return {
    auth,
    ...render(
      <AuthContext value={auth}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext>,
    ),
  };
}

// A Response-like value for stubbing `fetch`.
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
