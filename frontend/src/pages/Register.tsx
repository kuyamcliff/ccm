import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(name, email, password);
      navigate("/reserve");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">Join the table</p>
        <h1 className="page-title">Create an account</h1>
        <form className="form ticket" onSubmit={submit}>
          <label>
            Your name
            <input
              required
              minLength={2}
              maxLength={60}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password <span className="optional">(at least 8 characters)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-red btn-big" disabled={busy}>
            {busy ? "Creating..." : "Create account"}
          </button>
          <p className="form-fine">
            Already have one? <Link to="/login">Sign in</Link>.
          </p>
        </form>
      </div>
    </section>
  );
}
