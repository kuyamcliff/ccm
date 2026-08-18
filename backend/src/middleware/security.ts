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
setInterval(() => { const now = Date.now(); for (const store of stores.values()) for (const [key, bucket] of store) if (now >= bucket.resetAt) store.delete(key); }, 5 * 60 * 1000).unref();
export function clientIp(req: Request): string { return req.ip ?? req.socket?.remoteAddress ?? "unknown"; }
export function rateLimit(name: string, opts: LimitOptions) {
  const store = new Map<string, Bucket>(); stores.set(name, store); const keyFn = opts.key ?? clientIp;
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
