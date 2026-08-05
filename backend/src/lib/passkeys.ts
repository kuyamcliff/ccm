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
 * What to call a key in the list, guessed from the browser's user agent.
 *
 * A passkey has no name of its own, and "Passkey 1, Passkey 2" tells somebody
 * with three devices nothing about which one to remove. This is a guess and it
 * is editable nowhere, so it stays deliberately vague rather than claiming to
 * know the model.
 */
export function guessPasskeyName(userAgent: string | undefined): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android phone";
  if (ua.includes("mac os")) return "Mac";
  if (ua.includes("windows")) return "Windows device";
  return "Passkey";
}
