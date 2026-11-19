import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import type { AuthLocationState } from "../routes";
import { renderWithProviders } from "../test/renderWithProviders";
import Header from "./Header";

function LoginDestination() {
  const location = useLocation();
  const from = (location.state as AuthLocationState | null)?.from;
  return <p>Log in, then return to {from?.pathname}</p>;
}

describe("Header login redirect", () => {
  it("TST-01-T-1 header remembers the page to return to after login", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginDestination />} />
        <Route path="*" element={<Header />} />
      </Routes>,
      { route: "/personal-library" },
    );
    await userEvent.click(screen.getByRole("link", { name: "Log in" }));
    expect(
      screen.getByText("Log in, then return to /personal-library"),
    ).toBeInTheDocument();
  });

  it("TST-01-T-1 header marks the current page", () => {
    renderWithProviders(<Header />, { route: "/search" });
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "My Library" }),
    ).not.toHaveAttribute("aria-current");
  });
});
