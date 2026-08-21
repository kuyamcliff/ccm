import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isTwoFactorChallenge } from "~/lib/api";
import { signInWithPasskey, passkeysSupported } from "~/lib/passkey";
import { useMutation } from "~/lib/store";
import { say } from "~/lib/say";
import { Action, LinkButton } from "~/ui/Button";
import { TextField, PasswordField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { Icon } from "~/ui/Icon";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";

/**
 * Signing in.
 *
 * This is the screen the whole rewrite was pointed at. The complaint was that
 * you pressed Sign in and nothing happened, so you pressed it again, and the
 * only way to tell it had worked was that the page eventually changed.
 *
 * What it does now, on one press:
 *
 *   - the button presses in under the finger, before the click even fires
 *   - the label swaps to "Signing you in" with a spinner, in a button whose
 *     width was already reserved for the longer of the two labels, so nothing
 *     moves
 *   - a second press is refused, in the component and again in `useMutation`
 *   - a failure says what to do next, in a sentence written here, never quoted
 *     from the server
 *
 * Passkeys are offered first when the browser has them, because a fingerprint is
 * faster than a password typed on glass and it skips the second factor entirely.
 */
export function SignInPage() {
  const { c } = useCopy();
  const { signIn, completeTwoFactor, settle } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  /* Where to go afterwards. Staff land on the console; everybody else goes back
     to whatever they were trying to reach, which the guard put in the state. */
  const back = (location.state as { from?: string } | null)?.from;

  function land(role: string) {
    const staff = role === "admin" || role === "super_admin" || role === "owner" || role === "developer";
    navigate(staff ? "/desk" : (back ?? "/mine"), { replace: true });
  }

  const withPassword = useMutation(async () => {
    setProblem(null);
    const outcome = await signIn(email.trim(), password);
    if (isTwoFactorChallenge(outcome)) {
      setChallenge(outcome.challenge);
      return;
    }
    land(outcome.user.role);
  });

  const withCode = useMutation(async () => {
    setProblem(null);
    if (!challenge) return;
    const user = await completeTwoFactor(challenge, code.trim());
    land(user.role);
  });

  const withPasskey = useMutation(async () => {
    setProblem(null);
    const user = await signInWithPasskey();
    settle(user);
    land(user.role);
  });

  function fail(mutation: { readError: () => unknown }, intent: Parameters<typeof say>[1]) {
    const error = mutation.readError();
    if (error) setProblem(say(error, intent));
  }

  /* ── The second factor ────────────────────────────────────────────────────*/
  if (challenge) {
    return (
      <div className="page section auth">
        <header className="stack stack--tight">
          <h1 className="display display--xl">{c.auth.twoStepTitle}</h1>
          <p className="lead">{c.auth.twoStepLead}</p>
        </header>

        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await withCode.run();
            fail(withCode, "signin");
          }}
        >
          {problem ? <Notice tone="bad">{problem}</Notice> : null}

          <TextField
            label={c.auth.code}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
          />

          <Action
            type="submit"
            tone="primary"
            block
            pending={withCode.pending}
            pendingLabel={c.pending.checking}
            disabled={code.length < 6}
          >
            {c.auth.verify}
          </Action>

          <button
            type="button"
            className="link fine center"
            onClick={() => {
              setChallenge(null);
              setCode("");
              setProblem(null);
            }}
          >
            {c.common.back}
          </button>
        </form>
      </div>
    );
  }

  /* ── Email and password ───────────────────────────────────────────────────*/
  return (
    <div className="page section auth">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.auth.signInTitle}</h1>
        <p className="lead">{c.auth.signInLead}</p>
      </header>

      {passkeysSupported() ? (
        <>
          <Action
            tone="default"
            block
            icon="key"
            pending={withPasskey.pending}
            pendingLabel={c.pending.checking}
            onClick={async () => {
              await withPasskey.run();
              fail(withPasskey, "signin");
            }}
          >
            {c.auth.usePasskey}
          </Action>
          <div className="auth__or">
            <span className="hairline" />
            <span className="fine faint">or</span>
            <span className="hairline" />
          </div>
        </>
      ) : null}

      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          await withPassword.run();
          fail(withPassword, "signin");
        }}
      >
        {problem ? <Notice tone="bad">{problem}</Notice> : null}

        <TextField
          label={c.auth.email}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />

        <PasswordField label={c.auth.password} value={password} onChange={setPassword} required />

        <Action
          type="submit"
          tone="primary"
          block
          pending={withPassword.pending}
          pendingLabel={c.pending.signingIn}
          disabled={!email.trim() || !password}
        >
          {c.auth.signIn}
        </Action>
      </form>

      <div className="rows auth__links">
        <Link to="/reset" className="row fine" viewTransition>
          <Icon name="key" size={16} className="row__lead" />
          <span className="grow">{c.auth.forgot}</span>
          <Icon name="chevron-right" size={15} className="faint" />
        </Link>
        <Link to="/join" className="row fine" viewTransition>
          <Icon name="user" size={16} className="row__lead" />
          <span className="grow">{c.auth.noAccount}</span>
          <Icon name="chevron-right" size={15} className="faint" />
        </Link>
      </div>

      <p className="fine faint center">
        <LinkButton to="/menu" tone="quiet" size="sm">
          {c.nav.menu}
        </LinkButton>
      </p>

      {/* Kept so a failed sign-in also announces itself to a screen reader that
          is not focused on the notice. */}
      <span className="sr-only" role="status">
        {withPassword.pending ? c.pending.signingIn : ""}
      </span>
    </div>
  );
}
