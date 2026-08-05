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

/**
 * Signing in.
 *
 * Two possible endings: a session, or a two-factor challenge, which is a
 * second panel on the same page rather than a new route — the challenge is
 * short-lived and would be lost by a navigation.
 */
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

  /*
   * The passkey button is only offered where it can work. A browser with no
   * WebAuthn at all never sees it; one that has WebAuthn but no built-in
   * authenticator still does, because a laptop can use the phone in your
   * pocket over hybrid.
   */
  const [canPasskey, setCanPasskey] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    if (!passkeysSupported()) return;
    let alive = true;
    setCanPasskey(true);
    void platformAuthenticatorAvailable().then((ok) => {
      if (alive && !ok) {
        /* Still offered, just not led with. Nothing to change today, but this
           is where a quieter treatment would go. */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const attempt = useAction(async () => {
    const outcome = await signIn(email.trim(), password);
    if (isTwoFactorChallenge(outcome)) {
      setChallenge(outcome.challenge);
      return;
    }
    navigate(from, { replace: true });
  });

  const answer = useAction(async () => {
    if (!challenge) return;
    await completeTwoFactor(challenge, code.trim());
    navigate(from, { replace: true });
  });

  if (user) return <Navigate to={from} replace />;

  function fail(err: unknown, fallback: string) {
    setProblem(err instanceof ApiError ? err.message : fallback);
  }

  return (
    <div className="page auth">
      <div className="auth__card card stack">
        {challenge ? (
          <>
            <h1 className="display display--lg">One more step</h1>
            <p className="muted">Open your authenticator app and type the six digit code it is showing.</p>

            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setProblem(null);
                await answer.run();
                const failure = answer.readError();
                if (failure) fail(failure, "That code was not accepted.");
              }}
            >
              <TextField
                label="Authentication code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
              />
              {problem ? <Notice tone="bad">{problem}</Notice> : null}
              <Button type="submit" tone="primary" block busy={answer.busy}>
                Sign in
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="display display--lg">Welcome back</h1>
            <p className="muted">Your bookings, orders and receipts live behind here.</p>

            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setProblem(null);
                await attempt.run();
                const failure = attempt.readError();
                if (failure) fail(failure, "Those details were not right.");
              }}
            >
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              {problem ? <Notice tone="bad">{problem}</Notice> : null}

              <Button type="submit" tone="primary" block size="lg" busy={attempt.busy}>
                Sign in
              </Button>

              {canPasskey ? (
                <>
                  <p className="auth__or">
                    <span>or</span>
                  </p>
                  <Button
                    type="button"
                    tone="ghost"
                    block
                    busy={passkeyBusy}
                    onClick={async () => {
                      setProblem(null);
                      setPasskeyBusy(true);
                      try {
                        await signInWithPasskey();
                        await refresh();
                        navigate(from, { replace: true });
                      } catch (err) {
                        if (err instanceof PasskeyError && err.cancelled) return;
                        setProblem(err instanceof Error ? err.message : "That did not work.");
                      } finally {
                        setPasskeyBusy(false);
                      }
                    }}
                  >
                    <Icon name="key" size={18} />
                    Use a passkey
                  </Button>
                </>
              ) : null}

              <p className="auth__fine">
                <Link to="/reset">Forgotten your password</Link>
                <Link to="/help">Ask us for help</Link>
              </p>
            </form>
          </>
        )}
      </div>

      <p className="auth__switch">
        No account yet? <Link to="/join">Create one</Link>
      </p>
    </div>
  );
}
