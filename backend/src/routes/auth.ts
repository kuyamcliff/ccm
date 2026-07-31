import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import {
  COOKIE_NAME,
  clearSessionCookie,
  readChallenge,
  requireAuth,
  revokeSessions,
  sessionCookieOptions,
  signChallenge,
  signSession,
} from "../auth.js";
import { verifyTotp } from "../lib/totp.js";
import { clientIp, rateLimit, resetLimit } from "../middleware/security.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

/**
 * A hash of a value nobody can supply. Compared against when the email is
 * unknown so a missing account costs the same time as a wrong password and
 * cannot be distinguished by response timing.
 */
const DUMMY_HASH = bcrypt.hashSync("password-that-matches-no-account", BCRYPT_ROUNDS);

type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  banned_at: string | null;
  session_version: number;
  totp_enabled: number;
  totp_secret: string | null;
};

/** Throttle per IP and per email so neither a single host nor a single account
 *  can be hammered, even from a rotating address pool. */
const loginIpLimit = rateLimit("login-ip", {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many sign-in attempts from this device. Wait 15 minutes and try again.",
});

const loginEmailLimit = rateLimit("login-email", {
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many sign-in attempts for this account. Wait 15 minutes and try again.",
  key: (req) => String(req.body?.email ?? "").trim().toLowerCase() || clientIp(req),
});

const registerLimit = rateLimit("register", {
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many accounts created from this device. Try again later.",
});

const twoFactorLimit = rateLimit("login-2fa", {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many codes tried. Start the sign-in again in 15 minutes.",
});

function publicUser(row: { id: number; name: string; email: string; role: string }) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

authRouter.post("/register", registerLimit, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (name.length < 2 || name.length > 60) {
    res.status(400).json({ error: "Tell us your name (2 to 60 characters)." });
    return;
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ error: "That email address does not look right." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password needs at least 8 characters." });
    return;
  }
  if (password.length > 200) {
    res.status(400).json({ error: "That password is too long. Keep it under 200 characters." });
    return;
  }

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const info = await db
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name, email, hash);
  const id = Number(info.lastInsertRowid);

  res.cookie(COOKIE_NAME, signSession(id, 1), sessionCookieOptions());
  res.status(201).json({ user: { id, name, email, role: "user" } });
});

authRouter.post("/login", loginIpLimit, loginEmailLimit, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  const row = (await db
    .prepare(
      `SELECT id, name, email, password_hash, role, banned_at, session_version, totp_enabled, totp_secret
       FROM users WHERE email = ?`
    )
    .get(email)) as UserRow | undefined;

  // Always run a comparison, even with no matching row, to keep timing flat.
  const passwordOk = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);

  if (!row || !passwordOk) {
    res.status(401).json({ error: "Email or password is wrong." });
    return;
  }

  if (row.banned_at) {
    res.status(403).json({ error: "Your account has been suspended." });
    return;
  }

  // Credentials are correct — stop counting this account and device as suspect.
  resetLimit("login-ip", clientIp(req));
  resetLimit("login-email", email);

  // With 2FA on, no session is issued until the code is verified. The challenge
  // token proves the password step passed and expires in five minutes.
  if (row.totp_enabled && row.totp_secret) {
    res.json({ requires_2fa: true, challenge: signChallenge(row.id) });
    return;
  }

  res.cookie(COOKIE_NAME, signSession(row.id, row.session_version), sessionCookieOptions());
  res.json({ user: publicUser(row) });
});

authRouter.post("/login/2fa", twoFactorLimit, async (req, res) => {
  const challenge = String(req.body?.challenge ?? "");
  const code = String(req.body?.code ?? "");

  const userId = readChallenge(challenge);
  if (!userId) {
    res.status(401).json({ error: "That sign-in attempt expired. Enter your password again." });
    return;
  }

  const row = (await db
    .prepare(
      `SELECT id, name, email, role, banned_at, session_version, totp_enabled, totp_secret
       FROM users WHERE id = ?`
    )
    .get(userId)) as UserRow | undefined;

  if (!row || !row.totp_enabled || !row.totp_secret) {
    res.status(401).json({ error: "That sign-in attempt is no longer valid." });
    return;
  }
  if (row.banned_at) {
    res.status(403).json({ error: "Your account has been suspended." });
    return;
  }
  if (!verifyTotp(row.totp_secret, code)) {
    res.status(401).json({ error: "That code is wrong or has expired. Check your app and try again." });
    return;
  }

  resetLimit("login-2fa", clientIp(req));
  res.cookie(COOKIE_NAME, signSession(row.id, row.session_version), sessionCookieOptions());
  res.json({ user: publicUser(row) });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Signs the account out of every device, including this one. */
authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await revokeSessions(req.user!.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
