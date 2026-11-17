import { describe, expect, it } from "vitest";
import { useAuth } from "../useAuth";
import { renderWithProviders } from "./renderWithProviders";
import { screen } from "@testing-library/react";

function Consumer() {
  const { user, logout } = useAuth();
  return (
    <button onClick={() => void logout()}>{user?.email ?? "nobody"}</button>
  );
}

describe("renderWithProviders", () => {
  it("TST-01-T-1 render helper provides auth", async () => {
    const { auth } = renderWithProviders(<Consumer />, {
      user: { id: 1, email: "a@b.co" },
    });
    screen.getByRole("button", { name: "a@b.co" }).click();
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
