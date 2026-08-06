import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import {
  IS_PROD,
  ORANGE_BASE_URL,
  ORANGE_CLIENT_ID,
  ORANGE_CLIENT_SECRET,
  ORANGE_CURRENCY,
  ORANGE_MERCHANT_KEY,
  ORANGE_WEBHOOK_SECRET,
} from "../config.js";
import type { ChargeInput, WalletEvent, WalletTransaction } from "./wallets.js";

/**
 * Orange Money Web Payment.
 *
 * Flow: exchange the client id and secret for a bearer token, POST a webpayment
 * to get a pay token and a payment URL, then either follow the notification
 * Orange sends to our callback or poll the transaction status with the token.
 *
 * The shape differs from MTN in one way that matters to the rest of the app:
 * MTN pushes a PIN prompt to the handset and there is nothing for the customer
 * to open, while Orange returns a URL the customer is sent to. `paymentUrl`
 * below is that URL, and checkout redirects to it when the wallet is Orange.
 *
 * Docs: https://developer.orange.com/apis/om-webpay
 *
 * Written against the documented API and config-gated: with no credentials set,
 * `orangeConfigured()` is false and Orange is never offered at checkout. It has
 * not been exercised against a live merchant account, so treat the first real
 * transaction as the test.
 */

const TOKEN_PATH = "/oauth/v3/token";
const WEBPAYMENT_PATH = "/orange-money-webpay/cm/v1/webpayment";
const TRANSACTION_PATH = "/orange-money-webpay/cm/v1/transactionstatus";
const REQUEST_TIMEOUT_MS = 20_000;

export class OrangeError extends Error {
  readonly configuration: boolean;
  constructor(message: string, configuration = false) {
    super(message);
    this.name = "OrangeError";
    this.configuration = configuration;
  }
}

export function orangeConfigured(): boolean {
  return Boolean(ORANGE_CLIENT_ID && ORANGE_CLIENT_SECRET && ORANGE_MERCHANT_KEY);
}

/* ── Access token ────────────────────────────────────────────────────────── */

let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const basic = Buffer.from(`${ORANGE_CLIENT_ID}:${ORANGE_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(`${ORANGE_BASE_URL}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OrangeError(
      `Orange token request failed (${res.status}). ${detail.slice(0, 200)}`,
      res.status === 401 || res.status === 403
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new OrangeError("Orange returned no access token.", true);

  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs - TOKEN_EXPIRY_MARGIN_MS };
  return cachedToken.value;
}

/* ── Phone numbers ───────────────────────────────────────────────────────── */

/**
 * Orange Cameroon numbers are nine digits starting 69, or 655 to 659.
 * Rejecting an MTN number here is the point: sending it to Orange would fail
 * at the wallet with a message the customer cannot act on.
 */
export function toOrangeMsisdn(rawPhone: string): string | null {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  const local = digits.replace(/^237/, "");
  if (!/^(69\d{7}|65[5-9]\d{6})$/.test(local)) return null;
  return `237${local}`;
}

/* ── Starting a payment ──────────────────────────────────────────────────── */

/**
 * Where Orange sends the customer back to, and where it posts the result.
 * Set from the site's own address so the two stay in step across environments.
 */
function callbackUrls() {
  const base = (process.env.FRONTEND_URL ?? "").replace(/\/+$/, "");
  return {
    return_url: `${base}/mine`,
    cancel_url: `${base}/mine`,
    notif_url: `${base}/api/payments/webhook/orange_money`,
  };
}

/** Pay tokens Orange handed back, kept so a status poll can find one by our
 *  own reference. Orange keys status lookups on its pay token, not on the
 *  order id, and the payments table stores our reference. */
const payTokens = new Map<string, string>();

export interface OrangeCharge {
  /** Our own reference, stored on the payment row. */
  reference: string;
  /** Where the customer must be sent to authorise. */
  paymentUrl: string;
}

export async function orangeRequestToPay(input: ChargeInput): Promise<string> {
  const charge = await startOrangePayment(input);
  return charge.reference;
}

/**
 * The full result, including the URL. `orangeRequestToPay` exists to satisfy
 * the shared Wallet shape, which only needs a reference; checkout calls this
 * one because it also has to know where to send the customer.
 */
export async function startOrangePayment(input: ChargeInput): Promise<OrangeCharge> {
  if (!orangeConfigured()) {
    throw new OrangeError("Orange Money is not configured on this server.", true);
  }

  /* The caller's reference, written to the payments table before this call, so
     a retry reuses the same order_id rather than opening a second payment. */
  const reference = input.reference;
  const urls = callbackUrls();

  const res = await fetch(`${ORANGE_BASE_URL}${WEBPAYMENT_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      merchant_key: ORANGE_MERCHANT_KEY,
      currency: ORANGE_CURRENCY,
      order_id: reference,
      amount: Math.round(input.amount),
      return_url: urls.return_url,
      cancel_url: urls.cancel_url,
      notif_url: urls.notif_url,
      lang: "fr",
      reference: input.payeeNote.slice(0, 60),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    throw new OrangeError(`Orange rejected our credentials (${res.status}).`, true);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OrangeError(`Orange could not start the payment (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { pay_token?: string; payment_url?: string };
  if (!data.pay_token || !data.payment_url) {
    throw new OrangeError("Orange did not return a payment link.", true);
  }

  payTokens.set(reference, data.pay_token);
  return { reference, paymentUrl: data.payment_url };
}

/* ── Status ──────────────────────────────────────────────────────────────── */

export async function getOrangeTransaction(reference: string): Promise<WalletTransaction> {
  const payToken = payTokens.get(reference);

  /* The process restarted, or another instance started this payment. Polling
     cannot answer, so the payment stays pending and the webhook settles it.
     Reporting PENDING is the honest answer, and the approval window will
     expire it if nothing ever arrives. */
  if (!payToken) return { status: "PENDING", providerTransactionId: null, reason: null };

  const res = await fetch(`${ORANGE_BASE_URL}${TRANSACTION_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      order_id: reference,
      amount: undefined,
      pay_token: payToken,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) cachedToken = null;
    throw new OrangeError(`Orange status check failed (${res.status}).`, res.status === 401);
  }

  const data = (await res.json()) as { status?: string; txnid?: string };
  return {
    status: readOrangeStatus(data.status),
    providerTransactionId: data.txnid ?? null,
    reason: readOrangeStatus(data.status) === "FAILED" ? String(data.status ?? "").toUpperCase() : null,
  };
}

function readOrangeStatus(raw: unknown): WalletTransaction["status"] {
  switch (String(raw ?? "").toUpperCase()) {
    case "SUCCESS":
    case "SUCCESSFUL":
    case "COMPLETED":
      return "SUCCESSFUL";
    case "FAILED":
    case "CANCELLED":
    case "EXPIRED":
    case "REJECTED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

/* ── Webhook ─────────────────────────────────────────────────────────────── */

/**
 * Proves a delivery came from Orange before a single row is written.
 *
 * The signature covers the raw body, so it is compared against the bytes that
 * arrived rather than against a re-serialised object — JSON.stringify does not
 * promise the same key order, and a signature over a different string is a
 * signature over nothing. Compared in constant time, because a byte-by-byte
 * comparison that returns early tells an attacker how much of a guess was
 * right.
 */
export function verifyOrangeWebhook(req: Request): WalletEvent | null {
  if (!ORANGE_WEBHOOK_SECRET) return null;

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = String(req.get("x-orange-signature") ?? "");
  if (!raw || !signature) return null;

  const expected = createHmac("sha256", ORANGE_WEBHOOK_SECRET).update(raw).digest("hex");
  const given = Buffer.from(signature, "hex");
  const mine = Buffer.from(expected, "hex");
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) return null;

  const body = req.body as { order_id?: string; status?: string; txnid?: string; notif_token?: string };
  const reference = String(body?.order_id ?? "");
  const status = readOrangeStatus(body?.status);

  // Nothing to record for a delivery that says the payment is still in flight.
  if (!reference || status === "PENDING") return null;

  /* Orange does not send a dedicated event id, so the delivery is identified by
     the transaction it concerns and the state it reports. Two deliveries of the
     same outcome collapse to one row, which is what dedup has to mean. */
  return {
    eventId: `orange_money:${reference}:${status}`,
    reference,
    status,
    providerTransactionId: body?.txnid ?? null,
    reason: status === "FAILED" ? String(body?.status ?? "").toUpperCase() : null,
  };
}

export function explainOrangeFailure(reason: string | null): string {
  switch ((reason ?? "").toUpperCase()) {
    case "CANCELLED":
      return "The payment was cancelled before it was approved.";
    case "EXPIRED":
      return "The payment link expired before it was paid. Start the payment again.";
    case "REJECTED":
      return "Orange Money declined that payment.";
    case "INSUFFICIENT_FUNDS":
      return "There was not enough balance in that Orange Money account.";
    default:
      return "The payment did not go through. Try again, or use a different number.";
  }
}

if (!orangeConfigured() && IS_PROD) {
  console.warn("[orange] Orange Money credentials are missing — that wallet will not be offered.");
}
