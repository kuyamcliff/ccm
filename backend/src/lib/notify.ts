import { randomUUID } from "node:crypto";
import { DEFAULT_PHONE_COUNTRY_CODE, SMS_ENABLED } from "../config.js";
import { db } from "../db.js";
import { sendSms } from "./mtnSms.js";

/*
 * Messages to a guest's phone.
 *
 * Nothing in this product told anyone anything: a booking was confirmed, a
 * deposit was taken, a table came free, and the guest found out by being in
 * the room. Email is the wrong channel here — this is Buea, and the number is
 * what people actually read.
 *
 * MTN's SMS v3 API is spoken to directly for the same reason `mailer.ts`
 * speaks to Resend that way: it is a couple of authenticated POSTs, and a
 * booking is not worth putting a package with an install script in front of.
 *
 * Until credentials exist every message is still composed, addressed and
 * recorded — it is written to `notifications` with status 'logged' rather than
 * sent. That way the wiring is verifiable before anyone pays a provider, and
 * turning it on later changes no call site.
 */

export type Channel = "sms";

export type NotificationStatus = "sent" | "failed" | "logged" | "skipped";

export interface NotifyInput {
  /** The guest's number as they typed it; normalised here. */
  to: string;
  /** Which message this is, for the console and for support questions. */
  template: string;
  body: string;
  userId?: number | null;
  reservationId?: number | null;
}

export interface NotifyResult {
  status: NotificationStatus;
  channel: Channel;
  reason?: string;
}

/**
 * Turns what somebody typed into E.164.
 *
 * Cameroon numbers are nine digits and are almost always written without the
 * country code, so a bare nine-digit number gets one. Anything already carrying
 * a code is left alone.
 */
export function toE164(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 0) return null;
  const trimmed = digits.replace(/^0+/, "");
  if (trimmed.length === 9) return `+${DEFAULT_PHONE_COUNTRY_CODE}${trimmed}`;
  if (trimmed.length < 8 || trimmed.length > 15) return null;
  return `+${trimmed}`;
}

async function record(
  input: NotifyInput,
  channel: Channel,
  recipient: string,
  status: NotificationStatus,
  providerRef: string | null,
  error: string | null
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO notifications (channel, recipient, template, body, status, provider_ref, error, user_id, reservation_id, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === "sent" ? "now_text()" : "NULL"})`
      )
      .run(
        channel,
        recipient,
        input.template,
        input.body,
        status,
        providerRef,
        error,
        input.userId ?? null,
        input.reservationId ?? null
      );
  } catch (err) {
    // The record is the audit trail, not the delivery. Losing it must not lose
    // the message, and must certainly not fail the booking that triggered it.
    console.error("[notify] could not record notification:", err instanceof Error ? err.message : err);
  }
}

/**
 * Sends one message and records it.
 *
 * Never throws and never rejects. Everything that calls this is in the middle
 * of something that matters more than the message — taking a deposit, freeing a
 * table — and none of it should come apart because a phone network did.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const channel: Channel = "sms";
  const recipient = toE164(input.to);

  if (!recipient) {
    await record(input, channel, String(input.to ?? ""), "skipped", null, "Not a phone number we can send to.");
    return { status: "skipped", channel, reason: "Not a phone number we can send to." };
  }

  if (!SMS_ENABLED) {
    await record(input, channel, recipient, "logged", null, null);
    return { status: "logged", channel, reason: "No provider is configured yet." };
  }

  // Doubles as the notifications row's provider_ref, so a delivery report
  // arriving later (see routes/sms.ts) can find its way back to this row.
  const clientCorrelatorId = randomUUID();

  const result = await sendSms(recipient, input.body, clientCorrelatorId);
  if (!result.ok) {
    await record(input, channel, recipient, "failed", null, result.reason);
    console.error(`[notify] ${input.template} to ${recipient} failed: ${result.reason}`);
    return { status: "failed", channel, reason: result.reason };
  }

  await record(input, channel, recipient, "sent", clientCorrelatorId, null);
  return { status: "sent", channel };
}

/** True when anything at all can actually leave the building. */
export function messagingAvailable(): boolean {
  return SMS_ENABLED;
}
