import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { useAction, useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Notice, Skeleton } from "~/ui/Feedback";
import { PasswordField } from "~/ui/PasswordField";
import { checkPassword } from "~/lib/passwordStrength";
import { useToast } from "~/state/toast";

/**
 * Resetting a forgotten password.
 *
 * Only offered when the server can actually send email. If it cannot, saying
 * "check your inbox" would be a lie, so the page says plainly that a person
 * has to do it and points at the ways to reach one.
 */
export function ResetPage() {
  const availability = useResource(() => api.me.resetAvailability(), []);
  const toast = useToast();
  const navigate = useNavigate();

  const [stage, setStage] = useState<"ask" | "redeem">("ask");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState("");

  const request = useAction(api.me.requestReset);
  const redeem = useAction(api.me.redeemReset);

  if (availability.loading) {
    return (
      <div className="page auth">
        <div className="auth__card stack">
          <Skeleton height="2.5rem" />
          <Skeleton height="12rem" radius="var(--r-lg)" />
        </div>
      </div>
    );
  }

  if (!availability.data?.self_service) {
    return (
      <div className="page auth">
        <div className="auth__card card stack">
          <h1 className="display display--lg">Password help</h1>
          <p className="muted">
            We cannot send reset emails at the moment, so this one goes through a person. Message us with the email
            address on your account and we will sort it out.
          </p>
          <Link to="/help" className="btn btn--primary btn--block">
            Message us
          </Link>
          <p className="auth__switch">
            <Link to="/signin">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  const codeLength = availability.data.code_length;
  const minutes = availability.data.expires_in_minutes;

  return (
    <div className="page auth">
      <div className="auth__card card stack">
        {stage === "ask" ? (
          <>
            <h1 className="display display--lg">Forgotten password</h1>
            <p className="muted">
              Type the email on your account. If it is one of ours, a {codeLength} digit code goes out to it.
            </p>

            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setProblem(null);
                const result = await request.run(email.trim());
                if (!result) {
                  const failure = request.readError();
                  setProblem(failure instanceof ApiError ? failure.message : "That did not send.");
                  return;
                }
                setSentMessage(result.message);
                setStage("redeem");
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
              {problem ? <Notice tone="bad">{problem}</Notice> : null}
              <Button type="submit" tone="primary" block busy={request.busy}>
                Send me a code
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="display display--lg">Check your email</h1>
            <p className="muted">{sentMessage || `The code lasts ${minutes} minutes.`}</p>

            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setProblem(null);
                const weak = checkPassword(password, { email: email.trim() });
                if (weak) {
                  setProblem(weak);
                  return;
                }
                const result = await redeem.run(email.trim(), code.trim(), password);
                if (!result) {
                  const failure = redeem.readError();
                  setProblem(failure instanceof ApiError ? failure.message : "That code was not accepted.");
                  return;
                }
                toast.done("Password changed. Sign in with the new one.");
                navigate("/signin", { replace: true });
              }}
            >
              <TextField
                label="Code from the email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={codeLength}
                autoComplete="one-time-code"
                required
                autoFocus
              />
              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                identity={{ email: email.trim() }}
                required
              />
              {problem ? <Notice tone="bad">{problem}</Notice> : null}
              <Button type="submit" tone="primary" block busy={redeem.busy}>
                Set the new password
              </Button>
              <button type="button" className="btn btn--quiet btn--block" onClick={() => setStage("ask")}>
                Send it again
              </button>
            </form>
          </>
        )}
      </div>

      <p className="auth__switch">
        <Link to="/signin">Back to sign in</Link>
      </p>
    </div>
  );
}
