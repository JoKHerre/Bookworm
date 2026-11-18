import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import type { AuthLocationState, PendingActionState } from "../routes";
import "./AuthForm.css";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const { login, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);

    const email = String(form.get("email"));
    const password = String(form.get("password"));

    setSubmitting(true);
    setError(null);
    try {
      await (mode === "login"
        ? login({ email, password })
        : register({ email, password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const isLogin = mode === "login";
  // what the user was doing when they were sent here, finished after they log in
  const pending = (location.state as AuthLocationState | null)?.from?.state as
    PendingActionState | null | undefined;
  const pendingMessage = pending?.pendingSave
    ? "We'll save the book to your library as soon as you're in."
    : pending?.pendingRating
      ? "We'll save your rating as soon as you're in."
      : null;

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{isLogin ? "Log in" : "Register"}</h2>
        {pendingMessage && <p className="auth-pending">{pendingMessage}</p>}

        <label className="auth-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Please Wait" : isLogin ? "Log in" : "Register"}
        </button>

        <button
          className="auth-toggle"
          type="button"
          // keep the "return to" state when switching between login and signup
          onClick={() =>
            void navigate(isLogin ? "/signup" : "/login", {
              state: location.state,
              replace: true,
            })
          }
        >
          {isLogin ? "Need an account? Sign Up" : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
