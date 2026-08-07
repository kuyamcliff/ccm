import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "~/lib/http";
import { useAction } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { PasswordField } from "~/ui/PasswordField";
import { checkPassword } from "~/lib/passwordStrength";
import { useSession } from "~/state/session";

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

  /* The name and email above are what a password must not be built out of, so
     they travel with it into the same check the server runs. */
  const identity = { name: name.trim(), email: email.trim() };

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
            const weak = checkPassword(password, identity);
            if (weak) {
              setProblem(weak);
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
          <PasswordField
            value={password}
            onChange={setPassword}
            identity={identity}
            required
          />

          {problem ? <Notice tone="bad">{problem}</Notice> : null}

          <Button type="submit" tone="primary" block busy={create.busy}>
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
