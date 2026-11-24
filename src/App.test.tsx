import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { renderWithProviders } from "./test/renderWithProviders";

// the guarded pages fetch on mount; the route tests only care where they land
vi.mock("./pages/PersonalLibraryPage", () => ({
  default: () => <h1>My Library</h1>,
}));
vi.mock("./pages/SearchPage", () => ({ default: () => <h1>Search</h1> }));
vi.mock("./pages/CollectionDetailsPage", () => ({
  default: () => <h1>Collection details</h1>,
}));

describe("App routes", () => {
  it("COL-05-T-4 protects collection detail routes", () => {
    renderWithProviders(<App />, { route: "/personal-library/collections/7" });
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Collection details" }),
    ).not.toBeInTheDocument();
  });
  it("COL-05-T-4 allows signed-in users to open a direct collection URL", () => {
    renderWithProviders(<App />, {
      route: "/personal-library/collections/7",
      user: { id: 1, email: "reader@example.test" },
    });
    expect(
      screen.getByRole("heading", { name: "Collection details" }),
    ).toBeInTheDocument();
  });
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

  it("IMP-01-T-2 signed-out import page redirects", () => {
    renderWithProviders(<App />, { route: "/import" });
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("IMP-01-T-2 signed-in user reaches the import page", () => {
    renderWithProviders(<App />, {
      route: "/import",
      user: { id: 1, email: "a@b.co" },
    });
    expect(
      screen.getByRole("heading", { name: "Import books" }),
    ).toBeInTheDocument();
  });
});
