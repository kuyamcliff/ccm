import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useSettings } from "../settings";

const MIN_PASSWORD = 8;

/**
 * Self-service password reset, two steps:
 *   1. Enter your email — a 6-digit code is sent if the account exists.
 *   2. Enter the code plus a new password, both in one request.
 *
 * Arriving with ?email=... (from the sign-in page) skips straight to step 1
 * pre-filled; nothing else about the flow changes.
 */
export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { city } = useSettings();

  const [step, setStep] = useState<"request" | "code">("request");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Enter your email address."); return; }

    setBusy(true);
    try {
      const r = await api.requestPasswordReset(email.trim());
      setNotice(r.message);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function redeem(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code from your email."); return; }
    if (password.length < MIN_PASSWORD) { setError(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (password !== confirm) { setError("The two passwords do not match."); return; }

    setBusy(true);
    try {
      await api.redeemPasswordReset(email.trim(), code.trim(), password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    setBusy(true);
    try {
      const r = await api.requestPasswordReset(email.trim());
      setNotice(r.message);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-brand-panel">
        <div className="auth-brand-top">
          <p className="auth-brand-logo">Cam Chop <em>Meat</em></p>
          <p className="auth-brand-tagline">Charcoal grill · {city}</p>
        </div>
        <div className="auth-brand-center">
          <p className="auth-brand-big">Reset</p>
        </div>
      </aside>

      <main className="auth-form-panel">
        <div className="auth-form-inner">
          {done ? (
            <>
              <h1 className="page-title">Password changed</h1>
              <p className="notice" style={{ borderColor: "var(--green)" }}>
                Taking you to the sign-in page…
              </p>
            </>
          ) : step === "request" ? (
            <>
              <h1 className="page-title">Reset your password</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
                We'll email a 6-digit code to your account's address.
              </p>
              <form className="form" onSubmit={requestCode}>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </label>

                {error && <p className="form-error" role="alert">{error}</p>}

                <button className="btn btn-amber" disabled={busy}>
                  {busy ? "Sending…" : "Send code"}
                </button>

                <p className="form-fine">
                  <Link to="/login">Back to sign in</Link>
                </p>
              </form>
            </>
          ) : (
            <>
              <h1 className="page-title">Enter your code</h1>
              {notice && (
                <p className="notice" style={{ marginBottom: "1.25rem" }}>{notice}</p>
              )}
              <form className="form" onSubmit={redeem}>
                <label>
                  6-digit code
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoComplete="one-time-code"
                    style={{ letterSpacing: "0.4em", fontFamily: "var(--mono)", fontSize: "1.1rem", textAlign: "center" }}
                  />
                </label>

                <label>
                  New password
                  <div className="pw-wrap">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={MIN_PASSWORD}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="pw-toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </label>

                <label>
                  Confirm new password
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={MIN_PASSWORD}
                    required
                    autoComplete="new-password"
                  />
                </label>

                {error && <p className="form-error" role="alert">{error}</p>}

                <button className="btn btn-amber" disabled={busy}>
                  {busy ? "Saving…" : "Change password"}
                </button>

                <p className="form-fine">
                  Didn't get it?{" "}
                  <button type="button" className="link-btn" onClick={resend} disabled={busy}>
                    Send a new code
                  </button>
                </p>
                <p style={{ fontSize: "0.82rem", color: "var(--text-faint)", lineHeight: 1.6 }}>
                  Changing your password signs you out everywhere else.
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
