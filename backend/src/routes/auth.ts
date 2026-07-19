import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { COOKIE_NAME, requireAuth, sessionCookieOptions, signSession } from "../auth.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post("/register", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (name.length < 2 || name.length > 60) {
    res.status(400).json({ error: "Tell us your name (2 to 60 characters)." });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "That email address does not look right." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password needs at least 8 characters." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name, email, hash);
  const id = Number(info.lastInsertRowid);

  res.cookie(COOKIE_NAME, signSession(id), sessionCookieOptions());
  res.status(201).json({ user: { id, name, email } });
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  const row = db
    .prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; name: string; email: string; password_hash: string } | undefined;

  const ok = row && (await bcrypt.compare(password, row.password_hash));
  if (!ok) {
    res.status(401).json({ error: "Email or password is wrong." });
    return;
  }

  res.cookie(COOKIE_NAME, signSession(row.id), sessionCookieOptions());
  res.json({ user: { id: row.id, name: row.name, email: row.email } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
