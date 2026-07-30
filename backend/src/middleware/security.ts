import type { NextFunction, Request, Response } from "express";
import { ALLOWED_ORIGINS, IS_PROD } from "../config.js";

/* ── Security headers ──────────────────────────────────────────────────────
   The frontend is a Vite SPA served from the same origin in production.
   'unsafe-inline' on styles is needed because several components set inline
   style attributes; scripts stay locked to same-origin only.                */

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Menu seed data points at Unsplash; uploads are served from our own origin.
  "img-src 'self' data: blob: https://images.unsplash.com",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", CSP);
  res.removeHeader("X-Powered-By");
  if (IS_PROD) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
}

/* ── CSRF defence ──────────────────────────────────────────────────────────
   Session cookies are SameSite=Lax, which already blocks cross-site POSTs from
   forms. This closes the remaining gap: any state-changing request that
   arrives with a foreign Origin is rejected outright.                        */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) { next(); return; }

  const origin = req.get("origin");
  if (!origin) {
    // Same-origin fetches from some browsers omit Origin; fall back to Referer.
    const referer = req.get("referer");
    if (!referer) { next(); return; }
    try {
      const refOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(refOrigin)) { next(); return; }
    } catch { /* malformed referer falls through to the rejection below */ }
    res.status(403).json({ error: "Request blocked: unrecognised origin." });
    return;
  }

  if (ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(origin)) { next(); return; }
  res.status(403).json({ error: "Request blocked: unrecognised origin." });
}

/* ── Rate limiting ─────────────────────────────────────────────────────────
   In-memory fixed window. Adequate for a single-instance deployment; swap the
   store for Redis if this ever runs behind more than one process.            */

type Bucket = { count: number; resetAt: number };

interface LimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
  /** Message returned when the limit is hit. */
  message?: string;
  /** Derive the bucket key. Defaults to client IP. */
  key?: (req: Request) => string;
  /** Skip counting requests that succeeded (used for login). */
  skipSuccessful?: boolean;
}

const stores = new Map<string, Map<string, Bucket>>();

/** Sweeps expired buckets so the maps cannot grow without bound. */
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, bucket] of store) if (now >= bucket.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

export function rateLimit(name: string, opts: LimitOptions) {
  const store = new Map<string, Bucket>();
  stores.set(name, store);
  const keyFn = opts.key ?? clientIp;

  return function limiter(req: Request, res: Response, next: NextFunction) {
    const key = keyFn(req);
    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || now >= bucket.resetAt) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: opts.message ?? "Too many requests. Wait a moment and try again.",
        retry_after_seconds: retryAfter,
      });
      return;
    } else {
      bucket.count++;
    }

    if (opts.skipSuccessful) {
      res.on("finish", () => {
        if (res.statusCode < 400) store.delete(key);
      });
    }

    next();
  };
}

/** Clears a key from a named limiter — used to reset login throttling on success. */
export function resetLimit(name: string, key: string) {
  stores.get(name)?.delete(key);
}
