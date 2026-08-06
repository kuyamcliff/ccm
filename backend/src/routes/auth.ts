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
import { checkPassword } from "../lib/passwordStrength.js";
import { verifyTotp } from "../lib/totp.js";
import { clientIp, rateLimit, resetLimit } from "../middleware/security.js";

import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { openCeremony, passkeyOrigin, passkeyRpId, sealCeremony } from "../lib/passkeys.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

/**
 * A hash of a value nobody can supply. Compared against when the email is
 * unknown so a missing account costs the same time as a wrong password and
 * cannot be distinguished by response timing.
 */
const DUMMY_HASH = bcrypt.hashSync("password-that-matches-no-account", BCRYPT_ROUNDS);

/** Stored as JSON; a malformed value must not stop somebody signing in. */
function readTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuthenticatorTransportFuture[]) : undefined;
  } catch {
    return undefined;
  }
}

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
  /* Length, the guessed-first list, and anything built out of the name and
     email that were typed into the two fields above this one. */
  const weak = checkPassword(password, { name, email });
  if (weak) {
    res.status(400).json({ error: weak });
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

/*
 * Signing in with a passkey.
 *
 * No email, no password, and deliberately no `allowCredentials`. The keys are
 * discoverable, so the browser knows which ones belong to this site and offers
 * them itself; sending a list would mean asking who the visitor is before they
 * have proved anything, which is both a worse flow and a way of telling a
 * stranger whether an address has an account.
 *
 * The credential arrives with its own ID and that is what identifies the
 * account. Everything else is verified against the challenge we signed a moment
 * earlier.
 */
authRouter.post("/passkey/options", async (_req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: passkeyRpId,
    userVerification: "preferred",
  });

  res.json({ options, token: sealCeremony("login", options.challenge) });
});

authRouter.post("/passkey/verify", loginIpLimit, async (req, res) => {
  const claims = openCeremony(String(req.body?.token ?? ""), "login");
  if (!claims) {
    res.status(400).json({ error: "That took too long. Try again." });
    return;
  }

  const credentialId = String(req.body?.response?.id ?? "");
  if (!credentialId) {
    res.status(400).json({ error: "That passkey could not be read." });
    return;
  }

  const key = (await db
    .prepare(
      `SELECT k.id, k.user_id, k.credential_id, k.public_key, k.counter, k.transports
       FROM user_passkeys k WHERE k.credential_id = ?`
    )
    .get(credentialId)) as
    | { id: number; user_id: number; credential_id: string; public_key: string; counter: string | number; transports: string | null }
    | undefined;

  if (!key) {
    res.status(401).json({ error: "That passkey is not on any account here." });
    return;
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body?.response,
      expectedChallenge: claims.challenge,
      expectedOrigin: passkeyOrigin,
      expectedRPID: passkeyRpId,
      requireUserVerification: false,
      credential: {
        id: key.credential_id,
        publicKey: new Uint8Array(Buffer.from(key.public_key, "base64")),
        counter: Number(key.counter) || 0,
        transports: readTransports(key.transports),
      },
    });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : "That passkey was not accepted." });
    return;
  }

  if (!verification.verified) {
    res.status(401).json({ error: "That passkey was not accepted." });
    return;
  }

  const row = (await db
    .prepare(
      `SELECT id, name, email, role, banned_at, session_version, totp_enabled, totp_secret
       FROM users WHERE id = ?`
    )
    .get(key.user_id)) as UserRow | undefined;

  if (!row) {
    res.status(401).json({ error: "That account no longer exists." });
    return;
  }
  if (row.banned_at) {
    res.status(403).json({ error: "Your account has been suspended." });
    return;
  }

  /* The counter is the only defence against a cloned authenticator, and it is
     only meaningful when the device actually keeps one. Plenty report zero
     forever, so it is stored rather than enforced. */
  await db
    .prepare("UPDATE user_passkeys SET counter = ?, last_used_at = now_text() WHERE id = ?")
    .run(verification.authenticationInfo.newCounter, key.id);

  resetLimit("login-ip", clientIp(req));

  /*
   * A passkey is already two factors: something you have, and the fingerprint
   * or PIN that unlocked it. It satisfies the second step rather than being
   * sent round it, so an account with two step sign in on is not asked for a
   * code it does not need.
   */
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
