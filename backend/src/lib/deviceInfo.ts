/**
 * What a session's browser tells us about the device it is running on.
 *
 * There is no dependency here on purpose — the same discipline the passkey
 * naming already follows. A user-agent string is a handful of substrings to
 * match, and a parsing library earns its place only once the matching gets
 * genuinely hard, which it has not for the handful of platforms a guest of
 * this restaurant actually shows up on.
 *
 * Deliberately readable over exhaustive: "iPhone · Safari" is what someone
 * scanning a list of their own sessions needs to recognise a device, not a
 * precise build number nobody asked for.
 */

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export interface DeviceInfo {
  /** "iPhone · Safari", "Windows · Chrome" — what to show in a list. */
  name: string;
  type: DeviceType;
}

function browserOf(ua: string): string | null {
  // Order matters: several of these UAs contain "Safari" or "Chrome" as a
  // compatibility token even when that is not the real engine running.
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("crios")) return "Chrome";
  if (ua.includes("fxios")) return "Firefox";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("safari")) return "Safari";
  return null;
}

/**
 * Reads a device name and rough form factor from a browser's user-agent.
 *
 * Never throws and never returns an empty name — an unrecognised string still
 * produces something a person can read ("Unknown device"), because a blank
 * row in a security-sensitive list reads as broken, not as "we don't know".
 */
export function describeDevice(userAgent: string | undefined): DeviceInfo {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return { name: "Unknown device", type: "unknown" };

  const browser = browserOf(ua);
  const suffix = browser ? ` · ${browser}` : "";

  if (ua.includes("ipad")) return { name: `iPad${suffix}`, type: "tablet" };
  if (ua.includes("iphone")) return { name: `iPhone${suffix}`, type: "mobile" };
  if (ua.includes("android")) {
    // Android's own UA does not distinguish phone from tablet; "mobile" is the
    // one token that does, and Android tablets omit it.
    const type: DeviceType = ua.includes("mobile") ? "mobile" : "tablet";
    return { name: `Android${type === "tablet" ? " tablet" : ""}${suffix}`, type };
  }
  if (ua.includes("mac os")) return { name: `Mac${suffix}`, type: "desktop" };
  if (ua.includes("windows")) return { name: `Windows${suffix}`, type: "desktop" };
  if (ua.includes("cros")) return { name: `Chromebook${suffix}`, type: "desktop" };
  if (ua.includes("linux")) return { name: `Linux${suffix}`, type: "desktop" };

  return { name: "Unknown device", type: "unknown" };
}
