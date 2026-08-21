import { Router } from "express";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { db } from "../db.js";
import {
  COOKIE_NAME,
  clearSessionCookie,
  requireAuth,
  revokeSessions,
  sessionCookieOptions,
  signSession,
} from "../auth.js";
import { checkPassword } from "../lib/passwordStrength.js";
import { closeAccount } from "../lib/closeAccount.js";
import { generateSecret, otpauthUri, verifyTotp } from "../lib/totp.js";
import { rateLimit } from "../middleware/security.js";
import { listUserSessions, openUserSession, revokeUserSession } from "../lib/userSessions.js";
import { emailAvailable, sendMail } from "../lib/mailer.js";
import { CODE_TTL_MINUTES, issueEmailChangeCode, purgeExpiredEmailChanges, verifyEmailChangeCode } from "../lib/emailChange.js";
import { VENUE_NAME } from "../config.js";

import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import {
  PASSKEY_RP_NAME,
  guessPasskeyName,
  openCeremony,
  passkeyOrigin,
  passkeyRpId,
  sealCeremony,
} from "../lib/passkeys.js";

/** Stored as JSON; a malformed value must not stop somebody signing in. */
function parseTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuthenticatorTransportFuture[]) : undefined;
  } catch {
    return undefined;
  }
}

export const accountRouter = Router();
accountRouter.use(requireAuth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

/** Guards the endpoints that check a password, so the account settings page
 *  cannot be used as an oracle to brute-force the current password. */
const credentialLimit = rateLimit("account-credentials", {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts. Wait 15 minutes and try again.",
  key: (req) => String(req.user?.id ?? "anon"),
});

const totpLimit = rateLimit("account-totp", {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many codes tried. Wait 15 minutes and try again.",
  key: (req) => String(req.user?.id ?? "anon"),
});

async function currentHash(userId: number): Promise<string | undefined> {
  const row = (await db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId)) as
    | { password_hash: string }
    | undefined;
  return row?.password_hash;
}

/** Re-issues this device's cookie after a session revocation so the user who
 *  made the change stays signed in while every other device is logged out.
 *  `revokeSessions` just closed every session row too, this device's own
 *  included, so a fresh one is opened here rather than left with none. */
async function reissueSession(userId: number, version: number, req: import("express").Request, res: import("express").Response) {
  const sid = await openUserSession(userId, req);
  res.cookie(COOKIE_NAME, signSession(userId, version, sid), sessionCookieOptions());
}

// ── Receipts ─────────────────────────────────────────────

accountRouter.get("/receipts", async (req, res) => {
  const receipts = await db
    .prepare(
      `SELECT r.id, r.date, r.time, r.party_size, r.status, r.payment_status,
              r.ccm_code, r.created_at, t.label as table_label,
              p.amount_fcfa, p.method as pay_method
       FROM reservations r
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'reservation'
       WHERE r.user_id = ? AND r.payment_status = 'paid'
       ORDER BY r.created_at DESC
       LIMIT 200`
    )
    .all(req.user!.id);
  res.json({ receipts });
});

// ── Profile ───────────────────────────────────────────────

/**
 * Step one of changing an email: check the password, check the address is
 * free, and prove the guest can actually read mail sent there.
 *
 * Applies immediately, with no code, when Resend is not configured — the
 * same graceful fallback password reset uses. A guest is never blocked from
 * changing their email by a piece of infrastructure they did not set up;
 * they just do not get the extra proof step while it is off.
 */
accountRouter.patch("/email", credentialLimit, async (req, res) => {
  const user = req.user!;
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    res.status(400).json({ error: "Email and current password required." });
    return;
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ error: "That email address does not look right." });
    return;
  }
  if (email === user.email) {
    res.status(400).json({ error: "That is already your email." });
    return;
  }

  const hash = await currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(password, hash))) {
    res.status(400).json({ error: "Incorrect password." });
    return;
  }

  const existing = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, user.id);
  if (existing) { res.status(409).json({ error: "That email is already in use." }); return; }

  if (!emailAvailable()) {
    await db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, user.id);
    const version = await revokeSessions(user.id);
    await reissueSession(user.id, version, req, res);
    res.json({ ok: true, pending: false, email });
    return;
  }

  const { code, expiresAt } = await issueEmailChangeCode(user.id, email);
  const result = await sendMail({
    to: email,
    subject: `${code} confirms your new ${VENUE_NAME} email`,
    text:
      `Someone asked to change the email on your ${VENUE_NAME} account to this address.\n\n` +
      `Your confirmation code is:\n\n    ${code}\n\n` +
      `It expires in ${CODE_TTL_MINUTES} minutes. If this was not you, ignore this message. ` +
      `your account keeps its current email and nothing changes.`,
  });
  if (!result.sent) console.error(`[account] email-change code to user ${user.id} FAILED: ${result.reason}`);

  res.json({
    ok: true,
    pending: true,
    expires_in_minutes: CODE_TTL_MINUTES,
    message: `We sent a code to ${email}. Enter it to finish changing your email.`,
  });
});

/** Step two: the code from the new inbox, which is what actually applies the
    change. Wrong or missing on purpose does not say why — the same shape as
    every other code check in this codebase — so a stolen session cannot be
    used to probe whether a request is even pending. */
accountRouter.post("/email/confirm", credentialLimit, async (req, res) => {
  const user = req.user!;
  const code = String(req.body?.code ?? "").trim();

  const check = await verifyEmailChangeCode(user.id, code);
  if (!check.ok) {
    const message =
      check.reason === "locked"
        ? "Too many wrong codes. Start the email change again."
        : check.reason === "expired"
          ? "That code expired. Start the email change again."
          : check.reason === "no_code"
            ? "No email change is waiting. Start one first."
            : `That code is wrong.${check.attemptsLeft ? ` ${check.attemptsLeft} tries left.` : ""}`;
    res.status(400).json({ error: message });
    return;
  }

  await db.prepare("UPDATE users SET email = ? WHERE id = ?").run(check.newEmail, user.id);

  // The address a password reset would go to just changed — drop other sessions.
  const version = await revokeSessions(user.id);
  await reissueSession(user.id, version, req, res);
  await purgeExpiredEmailChanges();

  res.json({ ok: true, email: check.newEmail });
});

accountRouter.patch("/password", credentialLimit, async (req, res) => {
  const user = req.user!;
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Both passwords required." });
    return;
  }
  const weak = checkPassword(newPassword, { name: user.name, email: user.email });
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ error: "Choose a password different from your current one." });
    return;
  }

  const hash = await currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(currentPassword, hash))) {
    res.status(400).json({ error: "Incorrect current password." });
    return;
  }

  const next = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(next, user.id);

  // Any session token stolen before this point stops working now.
  const version = await revokeSessions(user.id);
  await reissueSession(user.id, version, req, res);

  res.json({ ok: true, signed_out_other_devices: true });
});

accountRouter.patch("/name", async (req, res) => {
  const user = req.user!;
  const name = String(req.body?.name ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    res.status(400).json({ error: "Name must be between 2 and 60 characters." });
    return;
  }
  await db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
  res.json({ ok: true, name });
});

// ── 2FA ──────────────────────────────────────────────────

accountRouter.get("/2fa/status", async (req, res) => {
  const row = (await db.prepare("SELECT totp_enabled FROM users WHERE id = ?").get(req.user!.id)) as
    | { totp_enabled: number }
    | undefined;
  res.json({ enabled: !!row?.totp_enabled });
});

accountRouter.post("/2fa/setup", credentialLimit, async (req, res) => {
  const user = req.user!;

  const row = (await db.prepare("SELECT totp_enabled FROM users WHERE id = ?").get(user.id)) as
    | { totp_enabled: number }
    | undefined;
  if (row?.totp_enabled) {
    res.status(409).json({ error: "Two-factor authentication is already on. Turn it off first to re-enrol." });
    return;
  }

  const secret = generateSecret();
  const uri = otpauthUri(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 });

  // Held as pending until a valid code proves the authenticator app has it.
  await db.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?").run(secret, user.id);
  res.json({ secret, uri, qrDataUrl });
});

accountRouter.post("/2fa/enable", totpLimit, async (req, res) => {
  const user = req.user!;
  const code = String(req.body?.code ?? "");
  if (!code) { res.status(400).json({ error: "Verification code required." }); return; }

  const row = (await db.prepare("SELECT totp_secret FROM users WHERE id = ?").get(user.id)) as
    | { totp_secret: string | null }
    | undefined;
  if (!row?.totp_secret) { res.status(400).json({ error: "Run 2FA setup first." }); return; }

  if (!verifyTotp(row.totp_secret, code)) {
    res.status(400).json({ error: "Incorrect code. Check your app and try again." });
    return;
  }

  await db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(user.id);

  const version = await revokeSessions(user.id);
  await reissueSession(user.id, version, req, res);

  res.json({ ok: true });
});

accountRouter.post("/2fa/disable", credentialLimit, async (req, res) => {
  const user = req.user!;
  const password = String(req.body?.password ?? "");
  if (!password) {
    res.status(400).json({ error: "Current password required to disable 2FA." });
    return;
  }

  const hash = await currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(password, hash))) {
    res.status(400).json({ error: "Incorrect password." });
    return;
  }

  await db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?").run(user.id);

  const version = await revokeSessions(user.id);
  await reissueSession(user.id, version, req, res);

  res.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────

/*
 * Adding a passkey, in two requests.
 *
 * The first hands the browser a challenge and the list of keys this account
 * already has, so an authenticator that is already enrolled says so instead of
 * quietly making a second credential for the same device. The second takes what
 * the authenticator produced and checks it against the challenge we issued,
 * the origin we expect and the RP ID the credential is bound to.
 *
 * `residentKey: required` is what makes these discoverable, which is the whole
 * point: at the sign-in screen the browser can offer the key without anybody
 * typing an email address first.
 */
accountRouter.post("/passkeys/options", async (req, res) => {
  const existing = (await db
    .prepare("SELECT credential_id, transports FROM user_passkeys WHERE user_id = ? AND credential_id IS NOT NULL")
    .all(req.user!.id)) as { credential_id: string; transports: string | null }[];

  const options = await generateRegistrationOptions({
    rpName: PASSKEY_RP_NAME,
    rpID: passkeyRpId,
    userID: new TextEncoder().encode(String(req.user!.id)),
    userName: req.user!.email,
    userDisplayName: req.user!.name,
    attestationType: "none",
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: parseTransports(row.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  res.json({ options, token: sealCeremony("register", options.challenge, req.user!.id) });
});

accountRouter.post("/passkeys/verify", async (req, res) => {
  const token = String(req.body?.token ?? "");
  const claims = openCeremony(token, "register");

  if (!claims || claims.userId !== req.user!.id) {
    res.status(400).json({ error: "That took too long. Try adding the passkey again." });
    return;
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body?.response,
      expectedChallenge: claims.challenge,
      expectedOrigin: passkeyOrigin,
      expectedRPID: passkeyRpId,
      requireUserVerification: false,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "That passkey could not be checked." });
    return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "That passkey could not be checked." });
    return;
  }

  const { credential, aaguid } = verification.registrationInfo;
  const name = guessPasskeyName(req.get("user-agent"), aaguid);

  try {
    await db
      .prepare(
        `INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, transports, display_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user!.id,
        credential.id,
        Buffer.from(credential.publicKey).toString("base64"),
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        name
      );
  } catch {
    // The unique index caught a key that is already on an account.
    res.status(409).json({ error: "That passkey is already saved." });
    return;
  }

  res.json({ ok: true, display_name: name });
});

accountRouter.get("/passkeys", async (req, res) => {
  const passkeys = await db
    .prepare(
      `SELECT id, display_name, created_at, last_used_at FROM user_passkeys
       WHERE user_id = ? AND credential_id IS NOT NULL ORDER BY created_at DESC`
    )
    .all(req.user!.id);
  res.json({ passkeys });
});

accountRouter.delete("/passkeys/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad passkey id." }); return; }
  await db.prepare("DELETE FROM user_passkeys WHERE id = ? AND user_id = ?").run(id, req.user!.id);
  res.json({ ok: true });
});

// ── Sessions ─────────────────────────────────────────────

accountRouter.get("/sessions", async (req, res) => {
  const sessions = await listUserSessions(req.user!.id);
  res.json({
    sessions: sessions.map((s) => ({ ...s, current: s.id === req.user!.sid })),
  });
});

accountRouter.delete("/sessions/:id", async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.sid) {
    // Ending your own session through the list is what the sign-out button is
    // for, and that path also clears this device's cookie — deleting it here
    // would leave a guest holding a cookie the server has already discarded.
    res.status(400).json({ error: "Use sign out for this device." });
    return;
  }
  const found = await revokeUserSession(req.user!.id, id);
  if (!found) { res.status(404).json({ error: "Session not found." }); return; }
  res.json({ ok: true });
});

// ── Delete account ────────────────────────────────────────

accountRouter.delete("/", credentialLimit, async (req, res) => {
  const user = req.user!;
  const password = String(req.body?.password ?? "");

  if (user.role === "admin" || user.role === "super_admin" || user.role === "owner") {
    res.status(400).json({ error: "Admin accounts cannot be self-deleted. Contact the super admin." });
    return;
  }

  // Deletion is permanent and cascades to reservations and reviews, so it is
  // gated on the password rather than on holding a session cookie alone.
  if (!password) {
    res.status(400).json({ error: "Enter your password to confirm deleting your account." });
    return;
  }
  const hash = await currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(password, hash))) {
    res.status(400).json({ error: "Incorrect password." });
    return;
  }

  /* Settles what is in flight and empties the row rather than deleting it.
     See lib/closeAccount.ts for why a plain DELETE could not work here. */
  await closeAccount(user.id);

  clearSessionCookie(res);
  res.json({ ok: true });
});
