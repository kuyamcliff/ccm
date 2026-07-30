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
import { generateSecret, otpauthUri, verifyTotp } from "../lib/totp.js";
import { rateLimit } from "../middleware/security.js";

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

function currentHash(userId: number): string | undefined {
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as
    | { password_hash: string }
    | undefined;
  return row?.password_hash;
}

/** Re-issues this device's cookie after a session revocation so the user who
 *  made the change stays signed in while every other device is logged out. */
function reissueSession(userId: number, version: number, res: import("express").Response) {
  res.cookie(COOKIE_NAME, signSession(userId, version), sessionCookieOptions());
}

// ── Receipts ─────────────────────────────────────────────

accountRouter.get("/receipts", (req, res) => {
  const receipts = db
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

  const hash = currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(password, hash))) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, user.id);
  if (existing) { res.status(409).json({ error: "That email is already in use." }); return; }

  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, user.id);

  // The address a password reset would go to just changed — drop other sessions.
  const version = revokeSessions(user.id);
  reissueSession(user.id, version, res);

  res.json({ ok: true, email });
});

accountRouter.patch("/password", credentialLimit, async (req, res) => {
  const user = req.user!;
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Both passwords required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }
  if (newPassword.length > 200) {
    res.status(400).json({ error: "That password is too long. Keep it under 200 characters." });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ error: "Choose a password different from your current one." });
    return;
  }

  const hash = currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(currentPassword, hash))) {
    res.status(401).json({ error: "Incorrect current password." });
    return;
  }

  const next = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(next, user.id);

  // Any session token stolen before this point stops working now.
  const version = revokeSessions(user.id);
  reissueSession(user.id, version, res);

  res.json({ ok: true, signed_out_other_devices: true });
});

accountRouter.patch("/name", (req, res) => {
  const user = req.user!;
  const name = String(req.body?.name ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    res.status(400).json({ error: "Name must be between 2 and 60 characters." });
    return;
  }
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
  res.json({ ok: true, name });
});

// ── 2FA ──────────────────────────────────────────────────

accountRouter.get("/2fa/status", (req, res) => {
  const row = db.prepare("SELECT totp_enabled FROM users WHERE id = ?").get(req.user!.id) as
    | { totp_enabled: number }
    | undefined;
  res.json({ enabled: !!row?.totp_enabled });
});

accountRouter.post("/2fa/setup", credentialLimit, async (req, res) => {
  const user = req.user!;

  const row = db.prepare("SELECT totp_enabled FROM users WHERE id = ?").get(user.id) as
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
  db.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?").run(secret, user.id);
  res.json({ secret, uri, qrDataUrl });
});

accountRouter.post("/2fa/enable", totpLimit, (req, res) => {
  const user = req.user!;
  const code = String(req.body?.code ?? "");
  if (!code) { res.status(400).json({ error: "Verification code required." }); return; }

  const row = db.prepare("SELECT totp_secret FROM users WHERE id = ?").get(user.id) as
    | { totp_secret: string | null }
    | undefined;
  if (!row?.totp_secret) { res.status(400).json({ error: "Run 2FA setup first." }); return; }

  if (!verifyTotp(row.totp_secret, code)) {
    res.status(401).json({ error: "Incorrect code. Check your app and try again." });
    return;
  }

  db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run(user.id);

  const version = revokeSessions(user.id);
  reissueSession(user.id, version, res);

  res.json({ ok: true });
});

accountRouter.post("/2fa/disable", credentialLimit, async (req, res) => {
  const user = req.user!;
  const password = String(req.body?.password ?? "");
  if (!password) {
    res.status(400).json({ error: "Current password required to disable 2FA." });
    return;
  }

  const hash = currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(password, hash))) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?").run(user.id);

  const version = revokeSessions(user.id);
  reissueSession(user.id, version, res);

  res.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────

accountRouter.get("/passkeys", (req, res) => {
  const passkeys = db
    .prepare(
      "SELECT id, display_name, created_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(req.user!.id);
  res.json({ passkeys });
});

accountRouter.delete("/passkeys/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad passkey id." }); return; }
  db.prepare("DELETE FROM user_passkeys WHERE id = ? AND user_id = ?").run(id, req.user!.id);
  res.json({ ok: true });
});

// ── Delete account ────────────────────────────────────────

accountRouter.delete("/", credentialLimit, async (req, res) => {
  const user = req.user!;
  const password = String(req.body?.password ?? "");

  if (user.role === "admin" || user.role === "super_admin") {
    res.status(400).json({ error: "Admin accounts cannot be self-deleted. Contact the super admin." });
    return;
  }

  // Deletion is permanent and cascades to reservations and reviews, so it is
  // gated on the password rather than on holding a session cookie alone.
  if (!password) {
    res.status(400).json({ error: "Enter your password to confirm deleting your account." });
    return;
  }
  const hash = currentHash(user.id);
  if (!hash) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await bcrypt.compare(password, hash))) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});
