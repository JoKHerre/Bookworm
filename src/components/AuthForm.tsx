import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import type { AuthLocationState, PendingActionState } from "../routes";
import "./AuthForm.css";

interface AuthFormProps {
  mode: "login" | "register";
}

const MIN_PASSWORD_LENGTH = 8;

export function AuthForm({ mode }: AuthFormProps) {
  const { login, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordProblem, setPasswordProblem] = useState("");
  const passwordId = useId();
  const passwordHintId = useId();

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
  const action = isLogin ? "Log in" : "Sign up";

  // only new passwords have a rule to meet; existing ones are just checked by the server
  function checkPassword(password: string) {
    setPasswordProblem(
      !isLogin && password && password.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters (${password.length} so far).`
        : "",
    );
  }
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
        <h2>{action}</h2>
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

        <div className="auth-field">
          <label htmlFor={passwordId}>Password</label>
          <div className="auth-password">
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : MIN_PASSWORD_LENGTH}
              required
              aria-invalid={passwordProblem ? true : undefined}
              aria-describedby={isLogin ? undefined : passwordHintId}
              onBlur={(event) => checkPassword(event.target.value)}
              // once a problem is shown, clear it as soon as it's fixed
              onChange={(event) => {
                if (passwordProblem) checkPassword(event.target.value);
              }}
            />
            <button
              className="auth-password-toggle"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {!isLogin && (
            <p
              id={passwordHintId}
              className={
                passwordProblem ? "auth-hint auth-hint--problem" : "auth-hint"
              }
            >
              {passwordProblem || `At least ${MIN_PASSWORD_LENGTH} characters.`}
            </p>
          )}
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? (isLogin ? "Logging in…" : "Signing up…") : action}
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
          {isLogin ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
