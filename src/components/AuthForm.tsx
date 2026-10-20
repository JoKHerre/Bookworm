import { useState } from "react";
import { useAuth } from "../useAuth";
import "./AuthForm.css";

export function AuthForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
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

  //JANK NONSENSE REFACTOR LATER
  const isLogin = mode === "login";

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{isLogin ? "Log in" : "Register"}</h2>

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
          onClick={() => setMode(isLogin ? "register" : "login")}
        >
          {isLogin ? "Need an account? Sign Up" : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
