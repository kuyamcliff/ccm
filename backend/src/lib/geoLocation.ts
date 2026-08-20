/**
 * Where a request came from, city and country, when we are told to look.
 *
 * There is no default provider baked in here. Calling out to a third party
 * with a guest's IP address on every sign-in is a real decision — cost, a
 * dependency the site now needs to stay up, and someone else's copy of where
 * your customers are — and it should not happen unless the owner deliberately
 * turned it on by setting an API token. Until IPINFO_TOKEN is set, this
 * module says "Unknown location" and means it: a session list showing nothing
 * is honest, where a made-up city is not.
 *
 * ipinfo.io was picked because it answers over plain HTTPS with a bearer
 * token and nothing else — no SDK, no billing surprise on a free token, and a
 * response shape stable enough to parse by hand.
 */

import { IPINFO_TOKEN } from "../config.js";

const LOOKUP_TIMEOUT_MS = 2_500;

/** Looking a guest's IP up is not the request; it must never make one slower
    than this to fail closed. */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { value: string | null; at: number }>();

const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1$|f[cd][0-9a-f]{2}:)/i;

/**
 * Whether an address is even worth asking a third party about.
 *
 * A dev box, a container's loopback, or anything in a private range has no
 * geography a public lookup can give back — at best it is noise, at worst it
 * is a wasted call on every local request. Kept separate from the network
 * call so this rule is checked without a token, a mock, or a live socket.
 */
export function isPubliclyLocatable(ip: string): boolean {
  return ip !== "" && ip !== "unknown" && !PRIVATE_IP_RE.test(ip);
}

export function geoLocationAvailable(): boolean {
  return IPINFO_TOKEN !== "";
}

interface IpInfoResponse {
  city?: string;
  country?: string;
  bogon?: boolean;
}

/**
 * "Buea, CM" for an IP ipinfo can place, or null when it cannot — or should
 * not — be asked. Never throws: a lookup failure is exactly as informative as
 * no lookup at all, so callers get the same null either way.
 */
export async function locateIp(ip: string): Promise<string | null> {
  if (!IPINFO_TOKEN || !isPubliclyLocatable(ip)) return null;

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  let result: string | null = null;
  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
      headers: { Authorization: `Bearer ${IPINFO_TOKEN}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (res.ok) {
      const body = (await res.json()) as IpInfoResponse;
      if (!body.bogon && (body.city || body.country)) {
        result = [body.city, body.country].filter(Boolean).join(", ") || null;
      }
    }
  } catch {
    /* Timed out, offline, or a malformed response. Same as "we don't know". */
  }

  cache.set(ip, { value: result, at: Date.now() });
  return result;
}
