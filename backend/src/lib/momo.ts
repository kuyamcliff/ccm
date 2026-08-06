import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import {
  IS_PROD,
  MOMO_API_KEY,
  MOMO_API_USER,
  MOMO_BASE_URL,
  MOMO_CURRENCY,
  MOMO_SUBSCRIPTION_KEY,
  MOMO_TARGET_ENVIRONMENT,
  MOMO_WEBHOOK_SECRET,
} from "../config.js";
import type { ChargeInput, WalletEvent } from "./wallets.js";

/**
 * MTN MoMo Collections client.
 *
 * Flow: exchange the API user + API key for a bearer token, POST a
 * requestToPay which pushes a PIN prompt to the customer's handset, then poll
 * the reference until MTN reports SUCCESSFUL or FAILED.
 *
 * Docs: https://momodeveloper.mtn.com/api-documentation
 */

const TOKEN_PATH = "/collection/token/";
const REQUEST_TO_PAY_PATH = "/collection/v1_0/requesttopay";
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * How long the customer has to approve on their phone. MTN times the request
 * out server-side; their guidance to integrators is to give up after 2–3
 * minutes and treat a still-PENDING transaction as failed. We allow three.
 */
export const APPROVAL_WINDOW_SECONDS = 180;

export type MomoStatus = "PENDING" | "SUCCESSFUL" | "FAILED";

export class MomoError extends Error {
  /** True when the failure is ours to fix rather than the customer's. */
  readonly configuration: boolean;
  constructor(message: string, configuration = false) {
    super(message);
    this.name = "MomoError";
    this.configuration = configuration;
  }
}

export function momoConfigured(): boolean {
  return Boolean(MOMO_SUBSCRIPTION_KEY && MOMO_API_USER && MOMO_API_KEY);
}

/* ── Access token ──────────────────────────────────────────────────────────
   Tokens last an hour. Caching one avoids a second round trip on every
   payment, and the early expiry margin stops us using one that dies in
   flight.                                                                   */

let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const basic = Buffer.from(`${MOMO_API_USER}:${MOMO_API_KEY}`).toString("base64");

  const res = await fetch(`${MOMO_BASE_URL}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Ocp-Apim-Subscription-Key": MOMO_SUBSCRIPTION_KEY,
      "X-Target-Environment": MOMO_TARGET_ENVIRONMENT,
      "Content-Length": "0",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 401 here is always bad credentials, never a customer problem.
    throw new MomoError(
      `MoMo token request failed (${res.status}). ${detail.slice(0, 200)}`,
      res.status === 401 || res.status === 403
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new MomoError("MoMo returned no access token.", true);

  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs - TOKEN_EXPIRY_MARGIN_MS };
  return cachedToken.value;
}

async function authorisedHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Ocp-Apim-Subscription-Key": MOMO_SUBSCRIPTION_KEY,
    "X-Target-Environment": MOMO_TARGET_ENVIRONMENT,
    ...extra,
  };
}

/* ── Phone numbers ─────────────────────────────────────────────────────────
   MoMo expects an MSISDN in international format with no plus sign.         */

export function toMsisdn(rawPhone: string): string | null {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  const local = digits.replace(/^237/, "");
  // Cameroon mobile numbers are nine digits and begin with 6.
  if (!/^6\d{8}$/.test(local)) return null;
  return `237${local}`;
}

/* ── Request to pay ────────────────────────────────────────────────────── */

/**
 * Sends the payment prompt. Returns the reference used to track it.
 *
 * The reference comes from the caller, which wrote it to the payments table
 * before calling this. MoMo treats X-Reference-Id as the idempotency key for
 * the charge, so a retry that reuses the value cannot take the money twice —
 * which only holds because the value survives the retry. Minting one here per
 * attempt, as this used to, made every retry a fresh charge.
 */
export async function requestToPay(input: ChargeInput): Promise<string> {
  if (!momoConfigured()) {
    throw new MomoError("Mobile Money is not configured on this server.", true);
  }

  const referenceId = input.reference;

  const res = await fetch(`${MOMO_BASE_URL}${REQUEST_TO_PAY_PATH}`, {
    method: "POST",
    headers: await authorisedHeaders({
      "X-Reference-Id": referenceId,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      amount: String(Math.round(input.amount)),
      currency: MOMO_CURRENCY,
      externalId: input.externalId,
      payer: { partyIdType: "MSISDN", partyId: input.msisdn },
      payerMessage: input.payerMessage.slice(0, 60),
      payeeNote: input.payeeNote.slice(0, 60),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  // 202 Accepted with an empty body is the success case.
  if (res.status === 202) return referenceId;

  const detail = await res.text().catch(() => "");

  if (res.status === 400) {
    throw new MomoError("That Mobile Money number was not accepted. Check it and try again.");
  }
  if (res.status === 409) {
    throw new MomoError("That payment was already submitted. Give it a moment.");
  }
  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    throw new MomoError(`MoMo rejected our credentials (${res.status}).`, true);
  }

  throw new MomoError(`MoMo could not start the payment (${res.status}). ${detail.slice(0, 200)}`);
}

/* ── Status ─────────────────────────────────────────────────────────────── */

export interface MomoTransaction {
  status: MomoStatus;
  /** MTN's own transaction id, present once the payment succeeds. */
  financialTransactionId: string | null;
  /** Set on failure, e.g. PAYER_NOT_FOUND, NOT_ENOUGH_FUNDS, EXPIRED. */
  reason: string | null;
}

export async function getTransaction(referenceId: string): Promise<MomoTransaction> {
  const res = await fetch(`${MOMO_BASE_URL}${REQUEST_TO_PAY_PATH}/${encodeURIComponent(referenceId)}`, {
    method: "GET",
    headers: await authorisedHeaders(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 404) {
    throw new MomoError("That payment could not be found at MoMo.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) cachedToken = null;
    throw new MomoError(`MoMo status check failed (${res.status}).`, res.status === 401);
  }

  const data = (await res.json()) as {
    status?: string;
    financialTransactionId?: string;
    reason?: string | { code?: string; message?: string };
  };

  const raw = String(data.status ?? "").toUpperCase();
  const status: MomoStatus = raw === "SUCCESSFUL" ? "SUCCESSFUL" : raw === "FAILED" ? "FAILED" : "PENDING";

  // `reason` comes back as a bare string in some environments and an object in
  // others; normalise so callers only deal with one shape.
  let reason: string | null = null;
  if (typeof data.reason === "string") reason = data.reason;
  else if (data.reason && typeof data.reason === "object") reason = data.reason.code ?? data.reason.message ?? null;

  return {
    status,
    financialTransactionId: data.financialTransactionId ?? null,
    reason,
  };
}

/* ── Webhook ─────────────────────────────────────────────────────────────── */

/**
 * Proves a callback came from MTN before anything is settled on the strength
 * of it.
 *
 * This endpoint is the one place on the site where an unauthenticated request
 * can mark money as received, so the bar is a signature or nothing. Without
 * MOMO_WEBHOOK_SECRET set, every delivery is refused and settlement falls back
 * to polling: a payment confirmed late is an inconvenience, a forged
 * confirmation is a free dinner for anyone who can spell our domain.
 *
 * The HMAC is taken over the raw bytes that arrived. Re-serialising the parsed
 * body would produce a different string whenever key order or number
 * formatting differed, so the comparison has to be against what was actually
 * sent. `timingSafeEqual` because a comparison that stops at the first wrong
 * byte leaks how much of a forged signature was correct.
 */
export function verifyMomoWebhook(req: Request): WalletEvent | null {
  if (!MOMO_WEBHOOK_SECRET) return null;

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = String(req.get("x-momo-signature") ?? "");
  if (!raw || !signature) return null;

  const expected = createHmac("sha256", MOMO_WEBHOOK_SECRET).update(raw).digest("hex");
  const given = Buffer.from(signature, "hex");
  const mine = Buffer.from(expected, "hex");
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) return null;

  const body = req.body as {
    referenceId?: string;
    externalId?: string;
    status?: string;
    financialTransactionId?: string;
    reason?: string | { code?: string };
  };

  const reference = String(body?.referenceId ?? "");
  const raw_status = String(body?.status ?? "").toUpperCase();
  if (!reference || (raw_status !== "SUCCESSFUL" && raw_status !== "FAILED")) return null;

  const reason =
    typeof body?.reason === "string" ? body.reason : (body?.reason?.code ?? null);

  return {
    eventId: `mtn_momo:${reference}:${raw_status}`,
    reference,
    status: raw_status === "SUCCESSFUL" ? "SUCCESSFUL" : "FAILED",
    providerTransactionId: body?.financialTransactionId ?? null,
    reason,
  };
}

/** Turns a MoMo failure code into something a customer can act on. */
export function explainFailure(reason: string | null): string {
  switch ((reason ?? "").toUpperCase()) {
    case "PAYER_NOT_FOUND":
    case "PAYEE_NOT_FOUND":
      return "That number is not registered for Mobile Money.";
    case "NOT_ENOUGH_FUNDS":
      return "There was not enough balance in that Mobile Money account.";
    case "PAYER_LIMIT_REACHED":
      return "That account has reached its transaction limit for now.";
    case "EXPIRED":
    case "TIMEOUT":
      return "The request expired before it was approved. Start the payment again.";
    case "APPROVAL_REJECTED":
      return "The payment was declined on the handset.";
    case "INVALID_AUTH":
      return "The PIN was entered incorrectly too many times.";
    case "INTERNAL_PROCESSING_ERROR":
      return "Mobile Money had a problem processing that. Try again in a moment.";
    default:
      return "The payment did not go through. Try again, or use a different number.";
  }
}

if (!momoConfigured() && IS_PROD) {
  console.warn("[momo] Collections credentials are missing — payments will fail.");
}
