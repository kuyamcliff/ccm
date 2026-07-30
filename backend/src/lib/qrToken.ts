import { createHmac, timingSafeEqual } from "node:crypto";
import { QR_SIGNING_SECRET } from "../config.js";

/**
 * Signed payload carried by the QR code on a booking receipt.
 *
 * A plain reference in a QR proves nothing: anyone can encode arbitrary text
 * into a QR image. This wraps the reference in an HMAC-SHA256 signature keyed
 * to a server secret, so a fabricated code fails verification at the door even
 * if the forger knows the exact reference format.
 *
 * Wire format:  CCM1.<payload>.<signature>       (all base64url, no padding)
 *   payload   = {"c":<code>,"r":<reservationId>,"i":<issuedAtSeconds>}
 *   signature = HMAC-SHA256(payload) truncated to 16 bytes
 *
 * 128 signature bits is far past forgeable, and keeping it short matters: QR
 * density grows with payload length, and a dense code is slow to scan on a
 * cheap phone camera in restaurant lighting.
 */

const VERSION = "CCM1";
const SIGNATURE_BYTES = 16;

/** What the code refers to. Absent on tokens minted before takeaway existed. */
export type QrSubject = "reservation" | "takeaway";

export interface QrClaims {
  code: string;
  /** Row id of the reservation or the takeaway order, per `subject`. */
  reservationId: number;
  subject: QrSubject;
  issuedAt: number;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

function sign(payload: string): string {
  return b64url(createHmac("sha256", QR_SIGNING_SECRET).update(payload).digest().subarray(0, SIGNATURE_BYTES));
}

export function createQrToken(claims: Omit<QrClaims, "issuedAt" | "subject"> & { subject?: QrSubject }): string {
  const subject = claims.subject ?? "reservation";
  const body = JSON.stringify({
    c: claims.code,
    r: claims.reservationId,
    // Omitted for bookings so tokens already printed keep the same wire form
    // and stay byte-identical to what the old signer produced.
    ...(subject === "reservation" ? {} : { s: subject }),
    i: Math.floor(Date.now() / 1000),
  });
  const payload = b64url(Buffer.from(body, "utf8"));
  return `${VERSION}.${payload}.${sign(payload)}`;
}

export type QrVerdict =
  | { ok: true; claims: QrClaims }
  | { ok: false; reason: "format" | "signature" };

/**
 * Verifies a scanned token.
 *
 * Returns `signature` for anything that parses but does not authenticate — the
 * caller should treat that as a forgery attempt rather than a typo, and must
 * not fall back to trusting the reference inside it.
 */
export function verifyQrToken(raw: string): QrVerdict {
  const parts = String(raw ?? "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "format" };

  const [, payload, signature] = parts;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  // Length is checked first because timingSafeEqual throws on a mismatch.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "signature" };
  }

  let parsed: { c?: unknown; r?: unknown; s?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "format" };
  }

  const code = String(parsed.c ?? "");
  const reservationId = Number(parsed.r);
  const issuedAt = Number(parsed.i);
  const subject: QrSubject = parsed.s === "takeaway" ? "takeaway" : "reservation";
  if (!code || !Number.isInteger(reservationId) || !Number.isFinite(issuedAt)) {
    return { ok: false, reason: "format" };
  }

  return { ok: true, claims: { code, reservationId, subject, issuedAt } };
}
