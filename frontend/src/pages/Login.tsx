import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, needsTwoFactor } from "../api";
import { useSettings } from "../settings";

export function Login() {
  const { login, completeTwoFactor } = useAuth();
  const { city, address } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** Whether the server can send mail; decides which recovery hint is shown. */
  const [selfServiceReset, setSelfServiceReset] = useState(false);

  /** Set once the password is accepted and an authenticator code is needed. */
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  // Send people back where they were headed before being asked to sign in.
  const from = (location.state as { from?: string } | null)?.from ?? "/reserve";

  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  useEffect(() => {
    api.recoveryStatus()
      .then((r) => setSelfServiceReset(r.self_service))
      .catch(() => setSelfServiceReset(false));
  }, []);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await login(email, password);
      if (needsTwoFactor(result)) {
        setChallenge(result.challenge);
        setPassword("");
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError("");
    setBusy(true);
    try {
      await completeTwoFactor(challenge, code);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setChallenge(null);
    setCode("");
    setError("");
  }

  return (
    <div className="auth-layout">
      <div className="auth-brand-panel" aria-hidden="true">
        <div className="auth-brand-top">
          <p className="auth-brand-logo">Cam Chop <em>Meat</em></p>
          <p className="auth-brand-tagline">Charcoal grill · {city}</p>
        </div>
        <div className="auth-brand-center">
          <p className="auth-brand-big">Real<br />fire.</p>
        </div>
        <div className="auth-brand-bottom">
          <blockquote className="auth-brand-quote">
            Walk-ins welcome. Reservations guarantee your seat.
          </blockquote>
          <p className="auth-brand-meta">{address}</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          {challenge ? (
            <>
              <p className="eyebrow animate-up">Two-factor authentication</p>
              <h1 className="page-title animate-up delay-1">Enter your code</h1>
              <p className="form-fine animate-up delay-1" style={{ marginBottom: "1.5rem" }}>
                Open your authenticator app and type the six-digit code for Cam Chop Meat.
              </p>

              <form className="form animate-up delay-2" onSubmit={submitCode}>
                <label>
                  Authentication code
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="otp-input"
                    aria-describedby={error ? "auth-error" : undefined}
                  />
                </label>

                {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}

                <button className="btn btn-amber btn-big" disabled={busy || code.length !== 6}>
                  {busy ? "Checking…" : "Verify and sign in"}
                </button>

                <button type="button" className="btn-ghost" onClick={startOver}>
                  Use a different account
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="eyebrow animate-up">Welcome back</p>
              <h1 className="page-title animate-up delay-1">Sign in</h1>

              <form className="form animate-up delay-2" onSubmit={submitPassword}>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <label>
                  Password
                  <div className="pw-wrap">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby={error ? "auth-error" : undefined}
                    />
                    <button
                      type="button"
                      className="pw-toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? "hide" : "show"}
                    </button>
                  </div>
                </label>

                {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}

                <button className="btn btn-amber btn-big" style={{ marginTop: "0.25rem" }} disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </button>

                <p className="form-fine">
                  First time here? <Link to="/register">Create an account</Link>. Takes a minute.
                </p>

                {/* Only offered when the server can actually send mail. Showing a
                    link that silently does nothing is worse than not showing one. */}
                {selfServiceReset ? (
                  <p className="form-fine">
                    Forgotten your password?{" "}
                    <Link to={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}>
                      Reset it by email
                    </Link>
                  </p>
                ) : (
                  <p className="form-fine">
                    Forgotten your password? Message us on the chat button and we will reset it for you.
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
