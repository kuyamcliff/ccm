import bcrypt from "bcryptjs";
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin, revokeSessions } from "../auth.js";
import { audit } from "../lib/audit.js";
import { emailAvailable, sendMail } from "../lib/mailer.js";
import {
  CODE_TTL_MINUTES,
  consumeReset,
  issueCode,
  purgeExpiredResets,
  verifyCode,
} from "../lib/passwordReset.js";
import { rateLimit } from "../middleware/security.js";

export const recoveryRouter = Router();

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The per-code attempt cap stops one code being guessed. These stop someone
   cycling through fresh codes to get more attempts, and are the second half of
   what makes a 6-digit code safe. */
const requestLimit = rateLimit("reset-request", {
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many reset requests from here. Try again later, or message us on the chat.",
});

const redeemLimit = rateLimit("reset-redeem", {
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many attempts. Wait a few minutes and try again.",
});

/** Tells the sign-in page whether to offer the reset flow at all. */
recoveryRouter.get("/status", (_req, res) => {
  res.json({ self_service: emailAvailable(), code_length: 6, expires_in_minutes: CODE_TTL_MINUTES });
});

/**
 * Step one: email a 6-digit code.
 *
 * The reply is the same whether or not the address has an account, so this
 * cannot be used to find out who is registered.
 */
recoveryRouter.post("/request", requestLimit, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();

  if (!emailAvailable()) {
    res.status(503).json({
      error: "Password reset by email is not available right now. Message us on the chat and we will help.",
    });
    return;
  }

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const generic = {
    ok: true as const,
    message: `If that email has an account, a ${6}-digit code is on its way. It expires in ${CODE_TTL_MINUTES} minutes.`,
  };

  const user = (await db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email)) as
    | { id: number; name: string; email: string }
    | undefined;

  if (!user) { res.json(generic); return; }

  const { code } = await issueCode(user.id);

  const result = await sendMail({
    to: user.email,
    subject: `${code} is your Cam Chop Meat reset code`,
    text:
      `Hi ${user.name},\n\n` +
      `Your password reset code is:\n\n` +
      `    ${code}\n\n` +
      `Enter it on the reset page. It expires in ${CODE_TTL_MINUTES} minutes and can only be used once.\n\n` +
      `If you did not ask to reset your password, ignore this email and nothing changes. ` +
      `Do not share this code with anyone, including staff.`,
  });

  if (result.sent) {
    console.log(`[recovery] code emailed to user ${user.id} (resend id ${result.id ?? "?"})`);
  } else {
    console.error(`[recovery] code email to user ${user.id} FAILED: ${result.reason}`);
  }

  res.json(generic);
});

/**
 * Step two: code plus the new password, in one call.
 *
 * Kept as a single request on purpose. A separate "check this code" endpoint
 * would hand an attacker a free oracle to test codes against without ever
 * committing to a password change.
 */
recoveryRouter.post("/redeem", redeemLimit, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const code = String(req.body?.code ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (password.length < MIN_PASSWORD) {
    res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the new password.` });
    return;
  }

  const user = (await db.prepare("SELECT id FROM users WHERE email = ?").get(email)) as
    | { id: number }
    | undefined;

  /* An unknown address is answered exactly like a wrong code, so this endpoint
     does not reveal who has an account either. */
  const wrongCode = { error: "That code is not right, or it has expired. Ask for a new one." };
  if (!user) { res.status(400).json(wrongCode); return; }

  const check = await verifyCode(user.id, code);

  if (!check.ok) {
    if (check.reason === "locked") {
      res.status(400).json({
        error: `Too many wrong codes. That code is now dead — ask for a new one.`,
      });
      return;
    }
    if (check.reason === "wrong" && check.attemptsLeft !== undefined) {
      res.status(400).json({
        error: `That code is not right. ${check.attemptsLeft} attempt${check.attemptsLeft === 1 ? "" : "s"} left before you need a new one.`,
      });
      return;
    }
    res.status(400).json(wrongCode);
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  await consumeReset(check.resetId);

  // Anyone already signed in as this user is signed out. If the account had
  // been taken over, the attacker's session dies with the password change.
  await revokeSessions(user.id);
  await purgeExpiredResets();

  console.log(`[recovery] password reset completed for user ${user.id}`);
  res.json({ ok: true, message: "Password changed. You can sign in now." });
});

/**
 * Admin diagnostic only: proves the Resend key and sending domain work, so a
 * broken setup is found before a customer needs a reset. This does not issue or
 * reveal reset codes; recovery is entirely self-service.
 */
recoveryRouter.post("/admin/test-email", requireAuth, requireAdmin, async (req, res) => {
  const to = String(req.body?.to ?? "").trim() || req.user!.email;

  if (!EMAIL_RE.test(to)) {
    res.status(400).json({ ok: false, error: "Enter a valid email address." });
    return;
  }

  if (!emailAvailable()) {
    res.status(503).json({
      ok: false,
      error: "No Resend API key is set. Add RESEND_API_KEY to the server environment and restart.",
    });
    return;
  }

  const result = await sendMail({
    to,
    subject: "Cam Chop Meat: email is working",
    text:
      "This is a test from your Cam Chop Meat admin dashboard.\n\n" +
      "If you are reading this, password reset codes will reach your customers.",
  });

  audit(req, { action: "email.test", targetType: "email", detail: result.sent ? "sent" : String(result.reason) });

  if (!result.sent) {
    res.status(502).json({ ok: false, error: result.reason });
    return;
  }
  res.json({ ok: true, id: result.id, to });
});
