import type { NextFunction, Request, Response } from "express";
import { ALLOWED_ORIGINS, IS_PROD } from "../config.js";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  /* The Door screen explicitly uses getUserMedia for QR scanning. Keep every
     other powerful browser capability disabled while allowing the camera on
     the same origin. */
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), interest-cohort=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", CSP);
  res.removeHeader("X-Powered-By");
  if (IS_PROD) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) { next(); return; }

  /* Payment providers call the webhook endpoint directly and do not send a
     browser Origin header. Its signature verification is the boundary there,
     so it must remain reachable without a browser origin. */
  if (req.path.startsWith("/api/payments/webhook/")) { next(); return; }

  const origin = req.get("origin");
  if (!origin) {
    const referer = req.get("referer");
    if (!referer) {
      res.status(403).json({ error: "Request blocked: origin could not be verified." });
      return;
    }
    try {
      const refOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(refOrigin)) { next(); return; }
    } catch { /* malformed referer rejected below */ }
    res.status(403).json({ error: "Request blocked: unrecognised origin." });
    return;
  }

  if (ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(origin)) { next(); return; }
  res.status(403).json({ error: "Request blocked: unrecognised origin." });
}

type Bucket = { count: number; resetAt: number };
interface LimitOptions { windowMs: number; max: number; message?: string; key?: (req: Request) => string; skipSuccessful?: boolean; }
const stores = new Map<string, Map<string, Bucket>>();
/* Each limiter's ceiling, so `limitSnapshot` can tell counting from blocking.
   A bucket exists from the first request; it only turns anybody away at `max`. */
const ceilings = new Map<string, number>();
setInterval(() => { const now = Date.now(); for (const store of stores.values()) for (const [key, bucket] of store) if (now >= bucket.resetAt) store.delete(key); }, 5 * 60 * 1000).unref();
export function clientIp(req: Request): string { return req.ip ?? req.socket?.remoteAddress ?? "unknown"; }
export function rateLimit(name: string, opts: LimitOptions) {
  const store = new Map<string, Bucket>(); stores.set(name, store); ceilings.set(name, opts.max); const keyFn = opts.key ?? clientIp;
  return function limiter(req: Request, res: Response, next: NextFunction) {
    const key = keyFn(req); const now = Date.now(); const bucket = store.get(key);
    if (!bucket || now >= bucket.resetAt) store.set(key, { count: 1, resetAt: now + opts.windowMs });
    else if (bucket.count >= opts.max) { const retryAfter = Math.ceil((bucket.resetAt - now) / 1000); res.setHeader("Retry-After", String(retryAfter)); res.status(429).json({ error: opts.message ?? "Too many requests. Wait a moment and try again.", retry_after_seconds: retryAfter }); return; }
    else bucket.count++;
    if (opts.skipSuccessful) res.on("finish", () => { if (res.statusCode < 400) store.delete(key); });
    next();
  };
}
export function resetLimit(name: string, key: string) { stores.get(name)?.delete(key); }

export interface LimitEntry {
  /** Which limiter: "login-ip", "login-email", "register" and so on. */
  bucket: string;
  /** What it is counting against. An address or an email, depending on the
      limiter, which is why the screen that shows this is developer-only. */
  key: string;
  count: number;
  /** What this limiter allows in a window. */
  max: number;
  /**
   * Whether this key is actually being turned away.
   *
   * The distinction matters and the first version of this screen got it wrong:
   * a bucket exists from somebody's very first request, so listing every live
   * bucket as "throttled" reported two people locked out when neither had been
   * refused anything. Counting is not blocking.
   */
  blocked: boolean;
  resetInSeconds: number;
}

/**
 * Who is currently being throttled.
 *
 * Exists for one real and recurring situation: somebody mistypes their password
 * five times, the limiter does exactly its job, and now the owner cannot get
 * into their own console for fifteen minutes on a Friday evening. Until now the
 * only remedies were to wait or to restart the service.
 *
 * Expired buckets are skipped rather than reported: a limiter that has run out
 * is not throttling anybody, and listing it would bury the one that is. They
 * are also deleted on the way past, which keeps the map from holding yesterday's
 * addresses forever.
 */
export function limitSnapshot(): LimitEntry[] {
  const now = Date.now();
  const out: LimitEntry[] = [];

  for (const [bucket, store] of stores) {
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
        continue;
      }
      const max = ceilings.get(bucket) ?? 0;
      out.push({
        bucket,
        key,
        count: entry.count,
        max,
        blocked: max > 0 && entry.count >= max,
        resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
      });
    }
  }

  /* Anybody actually turned away comes first: that is who somebody is ringing
     about. Within each group, the longest wait leads. */
  return out.sort(
    (a, b) => Number(b.blocked) - Number(a.blocked) || b.resetInSeconds - a.resetInSeconds
  );
}

/** Every limiter that exists, so the screen can say "nothing is throttled"
    rather than "no limiters found", which reads like a bug. */
export function limitBuckets(): string[] {
  return [...stores.keys()].sort();
}
