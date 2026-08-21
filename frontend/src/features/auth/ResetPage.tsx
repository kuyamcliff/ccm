import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import { useMutation, useQuery } from "~/lib/store";
import { say } from "~/lib/say";
import { checkPassword, passwordScore } from "~/lib/passwordStrength";
import { Action } from "~/ui/Button";
import { TextField, PasswordField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";

const SCORE_WORDS = ["Too weak", "Weak", "Getting there", "Good", "Strong"];

/**
 * Resetting a forgotten password.
 *
 * Two steps on one screen: ask for a code, then use it. The step is local state
 * rather than a route, because there is nothing here worth a back gesture and a
 * code that has already been sent should not be lost to one.
 *
 * The "we have sent a code" message is shown whether or not the address exists.
 * That is the server's behaviour and it is deliberate: telling somebody an email
 * is not registered is telling anybody who asks which of your customers have
 * accounts.
 */
export function ResetPage() {
  const { c } = useCopy();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* Whether self-service reset is even available: it needs email to be
     configured on the server, and when it is not the honest answer is to say so
     and point at the phone rather than to send somebody into a form that cannot
     work. */
  const availability = useQuery("auth.reset.availability", () => api.me.resetAvailability(), {
    staleMs: 10 * 60 * 1000,
  });

  const identity = useMemo(() => ({ email: email.trim() }), [email]);

  const strength = useMemo(() => {
    if (!password) return null;
    const complaint = checkPassword(password, identity);
    return {
      score: passwordScore(password, identity),
      label: SCORE_WORDS[passwordScore(password, identity)] ?? "",
      problems: complaint ? [complaint] : [],
    };
  }, [password, identity]);

  const request = useMutation(async () => {
    setProblem(null);
    await api.me.requestReset(email.trim());
    setSent(true);
  });

  const redeem = useMutation(async () => {
    setProblem(null);
    const complaint = checkPassword(password, identity);
    if (complaint) {
      setProblem(complaint);
      return;
    }
    await api.me.redeemReset(email.trim(), code.trim(), password);
    toast.done(c.auth.passwordSet);
    navigate("/signin", { replace: true });
  });

  if (availability.data && availability.data.self_service === false) {
    return (
      <div className="page section auth">
        <header className="stack stack--tight">
          <h1 className="display display--xl">{c.auth.resetTitle}</h1>
        </header>
        <Notice tone="info" title="Give us a call">
          We cannot send reset codes at the moment. Ring the restaurant and we will sort your account out.
        </Notice>
        <Link to="/signin" className="link fine center" viewTransition>
          {c.common.back}
        </Link>
      </div>
    );
  }

  return (
    <div className="page section auth">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.auth.resetTitle}</h1>
        <p className="lead">{sent ? c.auth.codeSent : c.auth.resetLead}</p>
      </header>

      {sent ? (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await redeem.run();
            const error = redeem.readError();
            if (error) setProblem(say(error, "reset"));
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

          <PasswordField
            label={c.auth.newPassword}
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
            pending={redeem.pending}
            pendingLabel={c.pending.resetting}
            disabled={code.length < 6 || !password}
          >
            {c.auth.setPassword}
          </Action>

          <button
            type="button"
            className="link fine center"
            onClick={() => {
              setSent(false);
              setCode("");
              setProblem(null);
            }}
          >
            {c.common.back}
          </button>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await request.run();
            const error = request.readError();
            if (error) setProblem(say(error, "reset"));
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
            autoFocus
          />

          <Action
            type="submit"
            tone="primary"
            block
            pending={request.pending}
            pendingLabel={c.pending.sending}
            disabled={!email.trim().includes("@")}
          >
            {c.auth.sendCode}
          </Action>
        </form>
      )}

      <p className="fine center muted">
        <Link to="/signin" className="link" viewTransition>
          {c.auth.signIn}
        </Link>
      </p>
    </div>
  );
}
