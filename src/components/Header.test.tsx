import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import Header from "./Header";

describe("Header", () => {
  it("TST-01-T-1 header when signed out", () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log out" }),
    ).not.toBeInTheDocument();
  });

  it("TST-01-T-1 header when signed in", async () => {
    const { auth } = renderWithProviders(<Header />, {
      user: { id: 1, email: "a@b.co" },
    });
    expect(
      screen.queryByRole("link", { name: "Log in" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("header marks My Library on its own page and on import", () => {
    const first = renderWithProviders(<Header />, {
      route: "/personal-library",
    });
    expect(screen.getByRole("link", { name: "My Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    first.unmount();

    renderWithProviders(<Header />, { route: "/import" });
    expect(screen.getByRole("link", { name: "My Library" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "Discover" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("REF-01-T-3 header links only to pages that exist", () => {
    renderWithProviders(<Header />);
    const links = screen
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["Bookworm", "/"],
      ["Discover", "/search"],
      ["My Library", "/personal-library"],
      ["Log in", "/login"],
    ]);
  });
});
