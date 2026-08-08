import { Router } from "express";
import { db } from "../db.js";
import { SMS_CALLBACK_SECRET } from "../config.js";
import { rateLimit } from "../middleware/security.js";

export const smsRouter = Router();

/* Generous for the same reason the payment webhook's limit is: a busy night
   is a lot of genuine deliveries, and MTN retrying a delivery report that got
   throttled is worse than letting a stranger grind against this endpoint for
   free — which the secret in the path already stops. */
const deliveryLimit = rateLimit("sms-delivery-webhook", {
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many delivery report deliveries.",
});

/**
 * Where MTN posts a delivery report for a message `notify()` sent.
 *
 * Register this exact URL, secret segment included, as the deliveryReportUrl
 * (and, since the SMS v3 API requires one, the callbackUrl too) when calling
 * POST /messages/sms/subscription — see backend/SMS-SETUP.md for the full
 * request. The secret is this app's own defence, not MTN's: the SMS v3 API
 * documents no signature on this callback, so without it anyone who found the
 * URL could write fake delivery statuses into the log. A missing or wrong
 * secret just means a delivery report is quietly ignored, never that the
 * message failed to send — the send already happened by the time this
 * arrives, so nothing here can undo it.
 */
smsRouter.post("/delivery/:secret", deliveryLimit, async (req, res) => {
  if (!SMS_CALLBACK_SECRET || req.params.secret !== SMS_CALLBACK_SECRET) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const body = req.body as {
    clientCorrelatorId?: string;
    deliveryStatus?: string;
    error?: string;
  };

  const reference = String(body?.clientCorrelatorId ?? "");
  const status = String(body?.deliveryStatus ?? "").toUpperCase();

  // No reference, nothing to reconcile. Answered 200 regardless: MTN retries
  // a delivery it does not get acknowledged, and a malformed one will not
  // read any differently on a second attempt.
  if (reference && status && status !== "DELIVERED" && status !== "ENROUTE") {
    await db
      .prepare("UPDATE notifications SET status = 'failed', error = ? WHERE provider_ref = ? AND status = 'sent'")
      .run(body?.error ? String(body.error) : `MTN reported ${status}.`, reference);
  }

  res.json({ ok: true });
});
