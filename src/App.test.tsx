import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { renderWithProviders } from "./test/renderWithProviders";

// the guarded pages fetch on mount; the route tests only care where they land
vi.mock("./pages/PersonalLibraryPage", () => ({
  default: () => <h1>My Library</h1>,
}));
vi.mock("./pages/SearchPage", () => ({ default: () => <h1>Search</h1> }));

describe("App routes", () => {
  it("TST-01-T-1 signed-out library redirects", () => {
    renderWithProviders(<App />, { route: "/personal-library" });
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "My Library" }),
    ).not.toBeInTheDocument();
  });

  it("TST-01-T-1 signed-in login redirects", () => {
    renderWithProviders(<App />, {
      route: "/login",
      user: { id: 1, email: "a@b.co" },
    });
    expect(
      screen.queryByRole("heading", { name: "Log in" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  });

  it("TST-01-T-1 signed-in user reaches the library", () => {
    renderWithProviders(<App />, {
      route: "/personal-library",
      user: { id: 1, email: "a@b.co" },
    });
    expect(
      screen.getByRole("heading", { name: "My Library" }),
    ).toBeInTheDocument();
  });
});
