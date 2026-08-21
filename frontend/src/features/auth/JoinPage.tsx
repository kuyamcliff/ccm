import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "~/lib/store";
import { say } from "~/lib/say";
import { checkPassword, passwordScore } from "~/lib/passwordStrength";
import { Action } from "~/ui/Button";
import { TextField, PasswordField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";

/** What the meter says at each score. Words, not a colour: somebody who cannot
    tell the red bar from the green one still reads "Weak". */
const SCORE_WORDS = ["Too weak", "Weak", "Getting there", "Good", "Strong"];

/**
 * Creating an account.
 *
 * The password rules are checked here as you type, against a byte-for-byte copy
 * of the server's own rules (`lib/passwordStrength.ts`, kept in step by
 * `npm run check:rules` in the backend). That matters more than it looks: the
 * registration endpoint is rate limited to five per hour per address, so a
 * password rejected by the server is not just an annoyance, it is one of five
 * chances gone.
 */
export function JoinPage() {
  const { c } = useCopy();
  const { register } = useSession();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  /* The identity is passed in so the rules can refuse a password built out of
     the person's own name or email, exactly as the server does. */
  const identity = useMemo(() => ({ name: name.trim(), email: email.trim() }), [name, email]);

  const strength = useMemo(() => {
    if (!password) return null;
    const complaint = checkPassword(password, identity);
    return {
      score: passwordScore(password, identity),
      label: SCORE_WORDS[passwordScore(password, identity)] ?? "",
      problems: complaint ? [complaint] : [],
    };
  }, [password, identity]);

  const join = useMutation(async () => {
    setProblem(null);
    const complaint = checkPassword(password, identity);
    if (complaint) {
      setProblem(complaint);
      return;
    }
    await register(name.trim(), email.trim(), password);
    navigate("/mine", { replace: true });
  });

  const ready = name.trim().length > 1 && email.trim().includes("@") && password.length > 0;

  return (
    <div className="page section auth">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.auth.joinTitle}</h1>
        <p className="lead">{c.auth.joinLead}</p>
      </header>

      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          await join.run();
          const error = join.readError();
          if (error) setProblem(say(error, "join"));
        }}
      >
        {problem ? <Notice tone="bad">{problem}</Notice> : null}

        <TextField
          label={c.auth.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />

        <TextField
          label={c.auth.email}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />

        <PasswordField
          label={c.auth.password}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          strength={strength}
          required
        />

        <Action
          type="submit"
          tone="primary"
          block
          pending={join.pending}
          pendingLabel={c.pending.creating}
          disabled={!ready}
        >
          {c.auth.join}
        </Action>
      </form>

      <p className="fine center muted">
        {c.auth.haveAccount}{" "}
        <Link to="/signin" className="link" viewTransition>
          {c.auth.signIn}
        </Link>
      </p>

      <p className="fine faint center">
        By creating an account you agree to our{" "}
        <Link to="/terms" className="link" viewTransition>
          {c.nav.terms}
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="link" viewTransition>
          {c.nav.privacy}
        </Link>
        .
      </p>
    </div>
  );
}
