import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { IS_PROD, JWT_SECRET } from "./config.js";

export { JWT_SECRET };
export const COOKIE_NAME = "camchop_session";

/** Short-lived token issued between password check and 2FA code entry. */
export const CHALLENGE_TTL_SECONDS = 5 * 60;

export type UserRole = "user" | "admin" | "super_admin";

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
      .prepare("SELECT id, name, email, role, banned_at, session_version FROM users WHERE id = ?")
      .get(id)) as (AuthedUser & { session_version: number }) | undefined;
    if (!row) return undefined;

    // A stale token from before a password change or forced sign-out is refused.
    if (Number(payload.sv) !== row.session_version) return undefined;

    const { session_version: _ignored, ...user } = row;
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
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required." });
    return;
  }
  next();
}
