import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { IS_PROD, JWT_SECRET } from "./config.js";

export { JWT_SECRET };
export const COOKIE_NAME = "camchop_session";

/** Short-lived token issued between password check and 2FA code entry. */
export const CHALLENGE_TTL_SECONDS = 5 * 60;

export type UserRole = "user" | "admin" | "super_admin" | "owner";

/**
 * Every page or capability in the console that a plain admin can be locked
 * out of, one per nav destination. `super_admin` and `owner` never consult
 * this list — restricting them is not what "make somebody a super admin"
 * means — only a plain `admin` is ever checked against it.
 */
export const ADMIN_SCOPES = [
  { key: "door", label: "Door", hint: "Scanning passes and orders in at the counter." },
  { key: "bookings", label: "Bookings", hint: "Every table reservation." },
  { key: "takeaway", label: "Takeaway", hint: "Orders placed ahead of collection." },
  { key: "queue", label: "Queue", hint: "The walk-in waitlist." },
  { key: "floor", label: "Floor", hint: "Tables, fixtures and the room plan." },
  { key: "menu", label: "Menu", hint: "Dishes, descriptions and prices." },
  { key: "offers", label: "Offers", hint: "Deals shown on the site." },
  { key: "gallery", label: "Photos", hint: "What shows in the site's gallery." },
  { key: "reviews", label: "Reviews", hint: "Guest reviews and replies." },
  { key: "events", label: "Events", hint: "Private event enquiries." },
  { key: "payments", label: "Payments", hint: "Payment records and receipts." },
  { key: "promos", label: "Promo codes", hint: "Discount codes." },
  { key: "giftcards", label: "Gift cards", hint: "Issuing and redeeming gift cards." },
  { key: "messages", label: "Messages", hint: "The guest support inbox." },
  { key: "guests", label: "Guests", hint: "Accounts: blocking, points and staff access." },
  { key: "insights", label: "Insights", hint: "Analytics and reporting." },
  { key: "settings", label: "Details", hint: "Location, phone, hours and deposit — what the site says about the place." },
  { key: "legal", label: "Terms and privacy", hint: "The legal pages." },
] as const;

export type AdminScope = (typeof ADMIN_SCOPES)[number]["key"];
const SCOPE_KEYS = new Set<string>(ADMIN_SCOPES.map((s) => s.key));
export function isAdminScope(value: unknown): value is AdminScope {
  return typeof value === "string" && SCOPE_KEYS.has(value);
}

export interface AuthedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  banned_at: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedUser;
  }
}

/**
 * Sessions carry the user's current session_version. Bumping that column
 * (on password change, 2FA change, or "sign out everywhere") invalidates every
 * token already issued, which a plain 30-day JWT could not do.
 */
export function signSession(userId: number, sessionVersion: number): string {
  return jwt.sign({ sub: String(userId), sv: sessionVersion, typ: "session" }, JWT_SECRET, {
    expiresIn: "30d",
  });
}

export function signChallenge(userId: number): string {
  return jwt.sign({ sub: String(userId), typ: "2fa" }, JWT_SECRET, {
    expiresIn: CHALLENGE_TTL_SECONDS,
  });
}

/** Returns the user id if the token is a valid, unexpired 2FA challenge. */
export function readChallenge(token: string): number | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== "object" || payload.typ !== "2fa") return null;
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: IS_PROD,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "lax", secure: IS_PROD });
}

/** Invalidates every session token already issued for this user. */
export async function revokeSessions(userId: number): Promise<number> {
  await db.prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ?").run(userId);
  const row = (await db.prepare("SELECT session_version FROM users WHERE id = ?").get(userId)) as
    | { session_version: number }
    | undefined;
  return row?.session_version ?? 1;
}

async function loadUser(req: Request): Promise<AuthedUser | undefined> {
  const token: string | undefined = req.cookies?.[COOKIE_NAME];
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== "object" || payload.typ !== "session") return undefined;

    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return undefined;

    const row = (await db
      .prepare("SELECT id, name, email, role, banned_at, session_version, deleted_at FROM users WHERE id = ?")
      .get(id)) as (AuthedUser & { session_version: number; deleted_at: string | null }) | undefined;
    if (!row) return undefined;

    /* A closed account keeps its row so the restaurant's records survive, but
       it is nobody's account any more. Treated exactly like a row that is not
       there, rather than as a sign-in to refuse with an explanation. */
    if (row.deleted_at) return undefined;

    // A stale token from before a password change or forced sign-out is refused.
    if (Number(payload.sv) !== row.session_version) return undefined;

    const { session_version: _ignored, deleted_at: _closed, ...user } = row;
    return user;
  } catch {
    return undefined;
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = await loadUser(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "You need to sign in first." });
    return;
  }
  if (req.user.banned_at) {
    res.status(403).json({ error: "Your account has been suspended." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "You need to sign in first." });
    return;
  }
  if (req.user.banned_at) {
    res.status(403).json({ error: "Your account has been suspended." });
    return;
  }
  if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "owner") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

/** The owner and anyone promoted to super admin — a super admin has every
    power the owner has, short of outranking the owner itself. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "super_admin" && req.user?.role !== "owner") {
    res.status(403).json({ error: "Super admin access required." });
    return;
  }
  next();
}

/** The single account above everyone else. What it changes is absolute — no
    admin permission and no super admin action can override it. */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "owner") {
    res.status(403).json({ error: "Owner access required." });
    return;
  }
  next();
}

/**
 * Whether a plain admin has been locked out of one scope by the owner.
 *
 * The absence of a row is the same as "allowed" — an admin account that
 * existed before this system was built loses nothing until the owner
 * deliberately restricts it. Super admins and the owner never look anything
 * up here; they are unrestricted by definition.
 */
export async function canAccessScope(userId: number, role: UserRole, scope: AdminScope): Promise<boolean> {
  if (role !== "admin") return true;
  const row = (await db
    .prepare("SELECT granted FROM admin_permissions WHERE user_id = ? AND scope = ?")
    .get(userId, scope)) as { granted: boolean | number } | undefined;
  return row ? !!row.granted : true;
}

/** Every scope for one admin, defaulting to allowed. Powers both the Access
    page's grid and the console's own "am I locked out of this" check. */
export async function scopeMapForUser(userId: number, role: UserRole): Promise<Record<AdminScope, boolean>> {
  const map = Object.fromEntries(ADMIN_SCOPES.map((s) => [s.key, true])) as Record<AdminScope, boolean>;
  if (role !== "admin") return map;
  const rows = (await db.prepare("SELECT scope, granted FROM admin_permissions WHERE user_id = ?").all(userId)) as
    { scope: string; granted: boolean | number }[];
  for (const r of rows) if (isAdminScope(r.scope)) map[r.scope] = !!r.granted;
  return map;
}

export function requireScope(scope: AdminScope) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "You need to sign in first." });
      return;
    }
    if (req.user.banned_at) {
      res.status(403).json({ error: "Your account has been suspended." });
      return;
    }
    if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "owner") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    if (!(await canAccessScope(req.user.id, req.user.role, scope))) {
      res.status(403).json({ error: "The owner has restricted this for your account." });
      return;
    }
    next();
  };
}
