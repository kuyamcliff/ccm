import jwt from "jsonwebtoken";
import { FRONTEND_URL, JWT_SECRET } from "../config.js";

/**
 * Passkeys, the parts that are not routes.
 *
 * Two decisions shape this file.
 *
 * The relying party ID is derived from the site's own URL rather than from the
 * request. A passkey is bound for life to the RP ID it was created under, so
 * getting this wrong once means every key made that day stops working when it
 * is fixed. It is the registrable domain and nothing else: no scheme, no port,
 * no path. `clipfx.me` in production, `localhost` in development.
 *
 * The challenge is a signed token rather than a row in a table. A WebAuthn
 * ceremony is two requests, and the second has to prove it is answering the
 * challenge issued by the first. A server-side store would work, but this API
 * runs behind a host that may have several instances up, and a challenge
 * written by one of them is not visible to the next. Signing the challenge into
 * a short-lived JWT and handing it to the browser makes the pair self
 * contained: nothing to share, nothing to expire out of a cache, and it cannot
 * be tampered with because the signature is checked before it is trusted.
 */

/** How long a browser has to finish a ceremony once it has been started. */
const CEREMONY_TTL_SECONDS = 300;

/**
 * The origin the browser will report. WebAuthn compares this exactly, so it
 * carries the scheme and the port and must match the address in the URL bar.
 */
export const passkeyOrigin: string = FRONTEND_URL;

/** The registrable domain, which is what a credential is bound to. */
export const passkeyRpId: string = (() => {
  try {
    return new URL(FRONTEND_URL).hostname;
  } catch {
    return "localhost";
  }
})();

export const PASSKEY_RP_NAME = "Cam Chop Meat";

type CeremonyKind = "register" | "login";

interface CeremonyClaims {
  kind: CeremonyKind;
  challenge: string;
  /** Present for registration, where we already know whose key this is. */
  userId?: number;
}

/** Wraps a challenge so the second half of the ceremony can be trusted. */
export function sealCeremony(kind: CeremonyKind, challenge: string, userId?: number): string {
  const claims: CeremonyClaims = { kind, challenge, userId };
  return jwt.sign(claims, JWT_SECRET, { expiresIn: CEREMONY_TTL_SECONDS });
}

/** Reads a ceremony token back, or null if it is missing, altered or stale. */
export function openCeremony(token: string, kind: CeremonyKind): CeremonyClaims | null {
  try {
    const claims = jwt.verify(token, JWT_SECRET) as CeremonyClaims;
    if (claims.kind !== kind || typeof claims.challenge !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * The passkey managers we can name from the authenticator's AAGUID.
 *
 * Every credential carries an AAGUID — a fixed id for the thing that made it,
 * the same for every iPhone using iCloud Keychain or every browser using
 * Google's manager. It is the one honest name available: it says where the key
 * actually lives, which is exactly what somebody deciding whether to remove it
 * needs to know. These are the common ones; anything else falls back to the
 * device guess below. (Values are the public AAGUID registry, lowercased.)
 */
const AAGUID_NAMES: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "cd69adb5-3c7a-deb9-3177-6800ea6cb72a": "Proton Pass",
  "b5397666-4885-aad6-e405-b90a6ff6d1a7": "Enpass",
  "891494da-2c90-4d31-a9d4-4eb0676a5300": "Devolutions",
};

/**
 * What to call a key in the list.
 *
 * The AAGUID names the manager the key lives in — "iCloud Keychain", "Windows
 * Hello", "1Password" — which is the real, stable answer to "which key is
 * this". When the AAGUID is one we do not recognise (or is all zeros, which a
 * few platforms send for privacy), it falls back to the device the browser
 * reports, so the guest still gets "iPhone" rather than a bare "Passkey".
 */
export function guessPasskeyName(userAgent: string | undefined, aaguid?: string): string {
  const id = (aaguid ?? "").toLowerCase();
  if (id && id !== "00000000-0000-0000-0000-000000000000" && AAGUID_NAMES[id]) return AAGUID_NAMES[id];

  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android phone";
  if (ua.includes("mac os")) return "Mac";
  if (ua.includes("windows")) return "Windows device";
  return "Passkey";
}
