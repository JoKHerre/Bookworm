import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import Header from "./Header";

describe("Header", () => {
  it("TST-01-T-1 header when signed out", () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole("link", { name: "Log In" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log Out" }),
    ).not.toBeInTheDocument();
  });

  it("TST-01-T-1 header when signed in", async () => {
    const { auth } = renderWithProviders(<Header />, {
      user: { id: 1, email: "a@b.co" },
    });
    expect(
      screen.queryByRole("link", { name: "Log In" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
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
      ["Log In", "/login"],
    ]);
  });
});
