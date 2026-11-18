import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import { AuthForm } from "./AuthForm";

async function fillAndSubmit(button: string) {
  await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
  await userEvent.type(screen.getByLabelText("Password"), "password123");
  await userEvent.click(screen.getByRole("button", { name: button }));
}

describe("AuthForm", () => {
  it("TST-01-T-1 login form submits credentials", async () => {
    const { auth } = renderWithProviders(<AuthForm mode="login" />);
    await fillAndSubmit("Log in");
    expect(auth.login).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "password123",
    });
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("TST-01-T-1 register form submits", async () => {
    const { auth } = renderWithProviders(<AuthForm mode="register" />);
    await fillAndSubmit("Register");
    expect(auth.register).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "password123",
    });
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("TST-01-T-1 auth form shows server error", async () => {
    const { auth } = renderWithProviders(<AuthForm mode="login" />);
    vi.mocked(auth.login).mockRejectedValue(new Error("Invalid credentials"));
    await fillAndSubmit("Log in");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials",
    );
  });

  it("TST-01-T-1 auth form switches modes", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<AuthForm mode="login" />} />
        <Route path="/signup" element={<AuthForm mode="register" />} />
      </Routes>,
      { route: "/login" },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Need an account? Sign Up" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Register" }),
    ).toBeInTheDocument();
  });

  it("TST-01-T-1 auth form explains a save waiting on login", () => {
    renderWithProviders(<AuthForm mode="login" />, {
      route: {
        pathname: "/login",
        state: {
          from: {
            pathname: "/books/works/OL1W",
            state: { pendingSave: "/works/OL1W" },
          },
        },
      },
    });
    expect(
      screen.getByText(
        "We'll save the book to your library as soon as you're in.",
      ),
    ).toBeInTheDocument();
  });
});
