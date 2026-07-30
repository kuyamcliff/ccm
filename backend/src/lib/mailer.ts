import { EMAIL_ENABLED, EMAIL_FROM, EMAIL_REPLY_TO, RESEND_API_KEY } from "../config.js";

/*
 * Outgoing mail, via Resend's HTTP API.
 *
 * Deliberately no SDK: this is one authenticated POST, Node has fetch built in,
 * and a mail dependency is one more package with an install script sitting in
 * the path of password resets. If Resend is ever swapped out, only this file
 * changes.
 *
 * When no API key is configured `sendMail` reports { sent: false } rather than
 * pretending to have sent. Callers fall back to the admin-issued reset flow,
 * which needs no email at all.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** A stuck mail call must not hold a request open; the caller has a fallback. */
const SEND_TIMEOUT_MS = 10_000;

export interface MailResult {
  sent: boolean;
  /** Provider message id, when it went out. */
  id?: string;
  /** Why it did not go, for logs and admin-facing messages. */
  reason?: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function emailAvailable(): boolean {
  return EMAIL_ENABLED;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!EMAIL_ENABLED) {
    return { sent: false, reason: "No Resend API key is configured on this server." };
  }

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(EMAIL_REPLY_TO ? { reply_to: EMAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "Resend did not respond in time."
        : "Could not reach Resend.";
    return { sent: false, reason };
  }

  let payload: unknown = null;
  try { payload = await res.json(); } catch { /* non-JSON body, handled below */ }

  if (!res.ok) {
    // Resend returns { name, message } on failure. Surfacing the real message
    // is what makes an unverified sending domain diagnosable instead of a
    // silent non-delivery.
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `Resend returned ${res.status}.`;
    return { sent: false, reason: message };
  }

  const id =
    payload && typeof payload === "object" && "id" in payload
      ? String((payload as { id: unknown }).id)
      : undefined;

  return { sent: true, id };
}
