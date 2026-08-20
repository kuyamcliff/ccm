import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { isTwoFactorChallenge } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { useAction } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { Icon } from "~/ui/Icon";
import { PasskeyError, passkeysSupported, platformAuthenticatorAvailable, signInWithPasskey } from "~/lib/passkey";

export function SignInPage() {
  const { user, signIn, completeTwoFactor, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/mine";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [canPasskey, setCanPasskey] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    if (!passkeysSupported()) return;
    let alive = true;
    setCanPasskey(true);
    void platformAuthenticatorAvailable().then((ok) => {
      if (alive && !ok) {
        /* Still offered where WebAuthn is available. */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const afterSignIn = (role?: string) => {
    if (role === "admin" || role === "super_admin" || role === "owner") {
      navigate("/desk", { replace: true });
      return;
    }
    navigate(from, { replace: true });
  };

  const attempt = useAction(async () => {
    const outcome = await signIn(email.trim(), password);
    if (isTwoFactorChallenge(outcome)) {
      setChallenge(outcome.challenge);
      return;
    }
    afterSignIn(outcome.user.role);
  });

  const answer = useAction(async () => {
    if (!challenge) return;
    const signedInUser = await completeTwoFactor(challenge, code.trim());
    afterSignIn(signedInUser.role);
  });

  if (user) return <Navigate to={user.role === "admin" || user.role === "super_admin" || user.role === "owner" ? "/desk" : from} replace />;

  function fail(err: unknown, fallback: string) {
    setProblem(err instanceof ApiError ? err.message : fallback);
  }

  return (
    <div className="page auth">
      <div className="auth__card card stack">
        {challenge ? (
          <>
            <h1 className="display display--lg">One more step</h1>
            <p className="muted">Enter the six-digit code from your authenticator app.</p>
            <form className="stack" onSubmit={async (event) => { event.preventDefault(); setProblem(null); await answer.run(); const failure = answer.readError(); if (failure) fail(failure, "That code was not accepted."); }}>
              <TextField label="Authentication code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
              {problem ? <Notice tone="bad">{problem}</Notice> : null}
              <Button type="submit" tone="primary" block busy={answer.busy}>Sign in</Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="display display--lg">Welcome back</h1>
            <p className="muted">Your tables, orders and receipts, all in one place.</p>
            <form className="stack" onSubmit={async (event) => { event.preventDefault(); setProblem(null); await attempt.run(); const failure = attempt.readError(); if (failure) fail(failure, "Those details were not right."); }}>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
              <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              {problem ? <Notice tone="bad">{problem}</Notice> : null}
              <Button type="submit" tone="primary" block busy={attempt.busy}>Sign in</Button>
              {canPasskey ? (
                <>
                  <p className="auth__or"><span>or</span></p>
                  <Button type="button" tone="ghost" block busy={passkeyBusy} onClick={async () => { setProblem(null); setPasskeyBusy(true); try { const signedInUser = await signInWithPasskey(); await refresh(); afterSignIn(signedInUser.role); } catch (err) { if (err instanceof PasskeyError && err.cancelled) return; setProblem(err instanceof Error ? err.message : "That did not work."); } finally { setPasskeyBusy(false); } }}>
                    <Icon name="key" size={18} />
                    Use a passkey
                  </Button>
                </>
              ) : null}
              <p className="auth__fine"><Link to="/reset">Forgotten your password</Link><Link to="/help">Ask us for help</Link></p>
            </form>
          </>
        )}
      </div>
      <p className="auth__switch">No account yet? <Link to="/join">Create one</Link></p>
    </div>
  );
}
