import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 4226 / 6238 TOTP, shared by account setup and the login challenge. */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buf: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

function base32Decode(secret: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of secret.toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) continue;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hash = createHmac("sha1", key).update(msg).digest();
  const offset = hash[19] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Constant-time comparison so a wrong code leaks nothing through timing. */
function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a 6-digit code against the secret, allowing one step of clock drift
 * either side (±30 seconds).
 */
export function verifyTotp(secret: string, token: string): boolean {
  const code = String(token ?? "").replace(/\D/g, "");
  if (code.length !== 6) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const step of [-1, 0, 1]) {
    if (codesMatch(hotp(secret, counter + step), code)) return true;
  }
  return false;
}

export function otpauthUri(secret: string, account: string, issuer = "Cam Chop Meat"): string {
  const i = encodeURIComponent(issuer);
  const a = encodeURIComponent(account);
  return `otpauth://totp/${i}:${a}?secret=${secret}&issuer=${i}&algorithm=SHA1&digits=6&period=30`;
}
