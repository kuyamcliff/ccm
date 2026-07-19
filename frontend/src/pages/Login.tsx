import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/reserve");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">Welcome back</p>
        <h1 className="page-title">Sign in</h1>
        <form className="form ticket" onSubmit={submit}>
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
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-red btn-big" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <p className="form-fine">
            First time here? <Link to="/register">Create an account</Link>. It takes a minute.
          </p>
        </form>
      </div>
    </section>
  );
}
