import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, needsTwoFactor } from "../api";
import { useSettings } from "../settings";
import { useT } from "../i18n/context";

export function Login() {
  const t = useT("auth");
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
      setError(err instanceof Error ? err.message : t("errSignIn"));
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
      setError(err instanceof Error ? err.message : t("errCode"));
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
          <p className="auth-brand-tagline">{t("tagline").replace("{city}", city)}</p>
        </div>
        <div className="auth-brand-center">
          <p className="auth-brand-big">{t("loginBrandBig").split("\n").map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}</p>
        </div>
        <div className="auth-brand-bottom">
          <blockquote className="auth-brand-quote">
            {t("loginQuote")}
          </blockquote>
          <p className="auth-brand-meta">{address}</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          {challenge ? (
            <>
              <p className="eyebrow animate-up">{t("twoFactorEyebrow")}</p>
              <h1 className="page-title animate-up delay-1">{t("enterCode")}</h1>
              <p className="form-fine animate-up delay-1" style={{ marginBottom: "1.5rem" }}>
                {t("twoFactorBody")}
              </p>

              <form className="form animate-up delay-2" onSubmit={submitCode}>
                <label>
                  {t("authCode")}
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
                  {busy ? t("checking") : t("verifyAndSignIn")}
                </button>

                <button type="button" className="btn-ghost" onClick={startOver}>
                  {t("useDifferentAccount")}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="eyebrow animate-up">{t("welcomeBack")}</p>
              <h1 className="page-title animate-up delay-1">{t("signIn")}</h1>

              <form className="form animate-up delay-2" onSubmit={submitPassword}>
                <label>
                  {t("email")}
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <label>
                  {t("password")}
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
                      aria-label={showPw ? t("hidePassword") : t("showPassword")}
                    >
                      {showPw ? t("hide") : t("show")}
                    </button>
                  </div>
                </label>

                {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}

                <button className="btn btn-amber btn-big" style={{ marginTop: "0.25rem" }} disabled={busy}>
                  {busy ? t("signingIn") : t("signIn")}
                </button>

                <p className="form-fine">
                  {t("firstTime")} <Link to="/register">{t("createAccountLink")}</Link>. {t("takesAMinute")}
                </p>

                {/* Only offered when the server can actually send mail. Showing a
                    link that silently does nothing is worse than not showing one. */}
                {selfServiceReset ? (
                  <p className="form-fine">
                    {t("forgotPassword")}{" "}
                    <Link to={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}>
                      {t("resetByEmail")}
                    </Link>
                  </p>
                ) : (
                  <p className="form-fine">
                    {t("forgotNoReset")}
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
