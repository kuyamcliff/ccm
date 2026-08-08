/**
 * Environment configuration, validated once at boot.
 *
 * Anything missing that would silently weaken security in production stops the
 * process here rather than failing quietly at request time.
 */

export const IS_PROD = process.env.NODE_ENV === "production";

const problems: string[] = [];

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (IS_PROD) {
    problems.push(`${name} is not set.`);
    return "";
  }
  return devFallback;
}

function optional(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export const JWT_SECRET = required("JWT_SECRET", "dev-only-secret-change-in-production");

/**
 * Signs the QR code on booking receipts. Kept separate from JWT_SECRET so that
 * rotating session keys does not invalidate every receipt already printed, and
 * so a leak of one does not compromise the other.
 */
export const QR_SIGNING_SECRET = required("QR_SIGNING_SECRET", "dev-only-qr-secret-change-in-production");

/** Origins allowed to make state-changing requests. Same-origin in production. */
export const FRONTEND_URL = optional("FRONTEND_URL", "http://localhost:5173").replace(/\/+$/, "");

export const ALLOWED_ORIGINS = new Set(
  [FRONTEND_URL, ...optional("EXTRA_ORIGINS").split(",")]
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean)
);

/* ── MTN MoMo Collections ──────────────────────────────────────────────────
   Credentials come from the MoMo developer portal. The subscription key is on
   your profile page; the API user and API key are provisioned against it. */

export const MOMO_SUBSCRIPTION_KEY = optional("MOMO_SUBSCRIPTION_KEY");
export const MOMO_API_USER = optional("MOMO_API_USER");
export const MOMO_API_KEY = optional("MOMO_API_KEY");

/** `sandbox` while testing; the live value MTN issues you when you go live. */
export const MOMO_TARGET_ENVIRONMENT = optional("MOMO_TARGET_ENVIRONMENT", "sandbox");

export const MOMO_BASE_URL = optional(
  "MOMO_BASE_URL",
  "https://sandbox.momodeveloper.mtn.com"
).replace(/\/+$/, "");

/** Sandbox only settles in EUR; live Cameroon accounts collect in XAF. */
export const MOMO_CURRENCY = optional(
  "MOMO_CURRENCY",
  MOMO_TARGET_ENVIRONMENT === "sandbox" ? "EUR" : "XAF"
);

/**
 * The shared secret MTN signs callbacks with. Without it the webhook route
 * refuses every delivery, and settlement falls back to polling — which is the
 * safe direction to fail in: a payment settling late is recoverable, a forged
 * "this is paid" is not.
 */
export const MOMO_WEBHOOK_SECRET = optional("MOMO_WEBHOOK_SECRET");

/* ── Orange Money ──────────────────────────────────────────────────────────
   Credentials come from the Orange developer portal once a merchant account
   exists. Until all three are set, Orange simply is not offered at checkout,
   exactly as MTN is not, so an unconfigured wallet is invisible rather than
   broken. */

export const ORANGE_CLIENT_ID = optional("ORANGE_CLIENT_ID");
export const ORANGE_CLIENT_SECRET = optional("ORANGE_CLIENT_SECRET");
/** The merchant's Orange Money account the money lands in. */
export const ORANGE_MERCHANT_KEY = optional("ORANGE_MERCHANT_KEY");
export const ORANGE_WEBHOOK_SECRET = optional("ORANGE_WEBHOOK_SECRET");

export const ORANGE_BASE_URL = optional("ORANGE_BASE_URL", "https://api.orange.com").replace(/\/+$/, "");

export const ORANGE_CURRENCY = optional("ORANGE_CURRENCY", "XAF");

export const PORT = Number(process.env.PORT ?? 4000);

/* ── Outgoing email (Resend) ───────────────────────────────────────────────
   Self-service "forgot password" needs somewhere to send the link. Until a
   Resend API key is supplied the feature stays switched off and the
   admin-issued reset flow covers recovery, so nothing breaks by leaving these
   unset. */
export const RESEND_API_KEY = optional("RESEND_API_KEY");

/** Must be an address on a domain verified in the Resend dashboard. */
export const EMAIL_FROM = optional("EMAIL_FROM", "Cam Chop Meat <onboarding@resend.dev>");

/** Where Resend should send replies, when it differs from the from address. */
export const EMAIL_REPLY_TO = optional("EMAIL_REPLY_TO");

/** True only when the key needed to actually send is present. */
export const EMAIL_ENABLED = RESEND_API_KEY.startsWith("re_");

/* ── Outgoing SMS (MTN SMS v3 API) ─────────────────────────────────────────
   Most guests here are reached on a phone number, not an inbox. Until these
   are supplied every message is still composed, still addressed and still
   written to the `notifications` table — it just gets marked 'logged' instead
   of going out, so the wiring can be checked before a provider is paid for.

   This is a different MTN portal from the Collections block above:
   developers.mtn.com, not momodeveloper.mtn.com. Register an App against the
   "SMS v3 API" product there to get a consumer key and secret. Full setup,
   including what to register as the callback and delivery report URLs, is in
   backend/SMS-SETUP.md. */
export const MTN_SMS_CLIENT_ID = optional("MTN_SMS_CLIENT_ID");
export const MTN_SMS_CLIENT_SECRET = optional("MTN_SMS_CLIENT_SECRET");

/** The approved short code messages go out under. */
export const MTN_SMS_SERVICE_CODE = optional("MTN_SMS_SERVICE_CODE");

/** Optional alphanumeric sender name. Takes precedence over the service code when set. */
export const MTN_SMS_SENDER_ADDRESS = optional("MTN_SMS_SENDER_ADDRESS");

export const MTN_SMS_BASE_URL = optional("MTN_SMS_BASE_URL", "https://api.mtn.com").replace(/\/+$/, "");

/** Country code assumed for a local number typed without one. 237 is Cameroon. */
export const DEFAULT_PHONE_COUNTRY_CODE = optional("DEFAULT_PHONE_COUNTRY_CODE", "237");

/** True only once a consumer key, secret and service code are all present. */
export const SMS_ENABLED =
  MTN_SMS_CLIENT_ID.length > 0 && MTN_SMS_CLIENT_SECRET.length > 0 && MTN_SMS_SERVICE_CODE.length > 0;

/**
 * Shared secret this server expects on the delivery report URL it hands to
 * MTN (as a path segment — see SMS-SETUP.md), since the SMS v3 API documents
 * no signature on that callback. Without it the route still records what
 * arrives, since a late or missing delivery report is recoverable and the
 * report carries no money, but anyone who guesses the path can write fake
 * delivery statuses into the log — set this before relying on the callback
 * for anything more than a nicety. */
export const SMS_CALLBACK_SECRET = optional("SMS_CALLBACK_SECRET");

/** Public base URL the API is reachable at — used to build absolute image URLs. */
export const PUBLIC_API_URL = optional("PUBLIC_API_URL", "").replace(/\/+$/, "");

if (IS_PROD) {
  if (JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters in production.");
  }
  if (QR_SIGNING_SECRET.length < 32) {
    problems.push("QR_SIGNING_SECRET must be at least 32 characters in production.");
  }
  if (QR_SIGNING_SECRET === JWT_SECRET) {
    problems.push("QR_SIGNING_SECRET must be different from JWT_SECRET.");
  }
  if (!MOMO_SUBSCRIPTION_KEY || !MOMO_API_USER || !MOMO_API_KEY) {
    problems.push(
      "MOMO_SUBSCRIPTION_KEY, MOMO_API_USER and MOMO_API_KEY must all be set — payments cannot run without them."
    );
  }
  if (MOMO_TARGET_ENVIRONMENT === "sandbox") {
    problems.push("MOMO_TARGET_ENVIRONMENT is still 'sandbox' — real payments would not be collected.");
  }
  if (!FRONTEND_URL.startsWith("https://")) {
    problems.push("FRONTEND_URL must be an https:// origin in production.");
  }
}

if (problems.length > 0) {
  console.error("Refusing to start. Fix the configuration:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (!IS_PROD) {
  console.warn("[config] Running in development mode with fallback secrets. Do not deploy like this.");
}
