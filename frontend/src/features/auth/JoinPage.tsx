import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "~/lib/http";
import { useAction } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useSession } from "~/state/session";

/** Minimum the server enforces. Said up front rather than after a rejection. */
const MIN_PASSWORD = 8;

export function JoinPage() {
  const { user, register } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/mine";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const create = useAction(async () => {
    await register(name.trim(), email.trim(), password);
    navigate(from, { replace: true });
  });

  if (user) return <Navigate to={from} replace />;

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  return (
    <div className="page auth">
      <div className="auth__card card stack">
        <h1 className="display display--lg">Create an account</h1>
        <p className="muted">It takes a minute and it is what lets you cancel or change a booking yourself.</p>

        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setProblem(null);
            if (password.length < MIN_PASSWORD) {
              setProblem(`Use at least ${MIN_PASSWORD} characters for your password.`);
              return;
            }
            await create.run();
            const failure = create.readError();
            if (failure) {
              setProblem(failure instanceof ApiError ? failure.message : "That did not work.");
            }
          }}
        >
          <TextField
            label="Your name"
            hint="What we will call out when your table is ready."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
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
            hint={`At least ${MIN_PASSWORD} characters.`}
            error={tooShort ? `That is only ${password.length} characters.` : null}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          {problem ? <Notice tone="bad">{problem}</Notice> : null}

          <Button type="submit" tone="primary" block size="lg" busy={create.busy}>
            Create account
          </Button>

          <p className="fine faint">
            By creating an account you accept our <Link to="/terms">terms</Link> and{" "}
            <Link to="/privacy">privacy policy</Link>.
          </p>
        </form>
      </div>

      <p className="auth__switch">
        Already have one? <Link to="/signin">Sign in</Link>
      </p>
    </div>
  );
}
