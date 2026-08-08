import {
  MTN_SMS_BASE_URL,
  MTN_SMS_CLIENT_ID,
  MTN_SMS_CLIENT_SECRET,
  MTN_SMS_SENDER_ADDRESS,
  MTN_SMS_SERVICE_CODE,
} from "../config.js";

/**
 * MTN SMS v3 API client.
 *
 * A different MTN developer portal from the MoMo one `momo.ts` speaks to:
 * developers.mtn.com, not momodeveloper.mtn.com. The auth pattern is the one
 * documented platform-wide at developers.mtn.com/getting-started/
 * understanding-oauth-20 — exchange a consumer key and secret for a bearer
 * token, then call the product's own endpoint with it.
 *
 * Docs: https://developers.mtn.com/products/sms-v3-api
 */

const TOKEN_URL = "https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials";
const SEND_PATH = "/v3/sms/messages/sms/outbound";
const REQUEST_TIMEOUT_MS = 15_000;

export class MtnSmsError extends Error {
  /** True when the failure is ours to fix rather than the guest's. */
  readonly configuration: boolean;
  constructor(message: string, configuration = false) {
    super(message);
    this.name = "MtnSmsError";
    this.configuration = configuration;
  }
}

export function mtnSmsConfigured(): boolean {
  return Boolean(MTN_SMS_CLIENT_ID && MTN_SMS_CLIENT_SECRET && MTN_SMS_SERVICE_CODE);
}

/* ── Access token ──────────────────────────────────────────────────────────
   Cached the same way the MoMo client caches its token: a round trip saved on
   every message, with enough margin that a token does not die mid-request. */

let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MTN_SMS_CLIENT_ID,
      client_secret: MTN_SMS_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 401 here is always bad credentials, never a guest problem.
    throw new MtnSmsError(
      `MTN SMS token request failed (${res.status}). ${detail.slice(0, 200)}`,
      res.status === 401 || res.status === 403
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number | string };
  if (!data.access_token) throw new MtnSmsError("MTN SMS returned no access token.", true);

  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs - TOKEN_EXPIRY_MARGIN_MS };
  return cachedToken.value;
}

/* ── Send ──────────────────────────────────────────────────────────────────
   The outbound endpoint wants receiverAddress as E.164 digits with no leading
   plus (that is how MTN's own example shows it), so the plus `toE164` in
   notify.ts adds is stripped again here rather than asking every caller to
   know two phone formats. */

export async function sendSms(
  to: string,
  body: string,
  clientCorrelatorId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!mtnSmsConfigured()) {
    return { ok: false, reason: "MTN SMS is not configured on this server." };
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Could not authenticate with MTN SMS." };
  }

  let res: Response;
  try {
    res = await fetch(`${MTN_SMS_BASE_URL}${SEND_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: body,
        serviceCode: MTN_SMS_SERVICE_CODE,
        receiverAddress: [to.replace(/^\+/, "")],
        // Max 36 characters, so the caller's reference is truncated rather
        // than rejected outright.
        clientCorrelatorId: clientCorrelatorId.slice(0, 36),
        ...(MTN_SMS_SENDER_ADDRESS ? { senderAddress: MTN_SMS_SENDER_ADDRESS } : {}),
        requestDeliveryReceipt: true,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "MTN SMS did not respond in time."
        : "Could not reach MTN SMS.";
    return { ok: false, reason };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* A non-JSON body is handled by the res.ok check below. */
  }

  if (!res.ok) {
    // A dead token is worth clearing so the next attempt fetches a fresh one
    // rather than failing the same way for up to an hour.
    if (res.status === 401 || res.status === 403) cachedToken = null;
    const message =
      payload && typeof payload === "object" && "statusMessage" in payload
        ? String((payload as { statusMessage: unknown }).statusMessage)
        : `MTN SMS returned ${res.status}.`;
    return { ok: false, reason: message };
  }

  return { ok: true };
}
