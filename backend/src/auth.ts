import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { IS_PROD, JWT_SECRET } from "./config.js";
import { revokeAllUserSessions, sessionIsValid, touchSession } from "./lib/userSessions.js";
export { JWT_SECRET };
export const COOKIE_NAME = "camchop_session";
export const CHALLENGE_TTL_SECONDS = 5 * 60;
/**
 * Ranked, low to high.
 *
 * `developer` sits above the owner because it exists to look at the machinery
 * the owner's business runs on: health, recent failures, feature flags, the
 * database. It is not a bigger owner, it is a different job, and the reason it
 * is a role rather than a flag is that everything downstream already switches on
 * role and would otherwise need a second concept threaded through it.
 */
export type UserRole = "user" | "admin" | "super_admin" | "owner" | "developer";

/** Everyone who may open the console at all. */
export const STAFF_ROLES = ["admin", "super_admin", "owner", "developer"] as const;

/** Everyone the per-scope restrictions do not apply to. Only a plain `admin`
    can ever be restricted; everything above it is unrestricted by definition. */
export const UNRESTRICTED_ROLES = ["super_admin", "owner", "developer"] as const;
export const ADMIN_SCOPES = [
  { key: "door", label: "Door", hint: "Scanning passes and orders in at the counter." }, { key: "bookings", label: "Bookings", hint: "Every table reservation." }, { key: "takeaway", label: "Takeaway", hint: "Orders placed ahead of collection." }, { key: "queue", label: "Queue", hint: "The walk-in waitlist." }, { key: "floor", label: "Floor", hint: "Tables, fixtures and the room plan." }, { key: "menu", label: "Menu", hint: "Dishes, descriptions and prices." }, { key: "offers", label: "Offers", hint: "Deals shown on the site." }, { key: "gallery", label: "Photos", hint: "What shows in the site's gallery." }, { key: "reviews", label: "Reviews", hint: "Guest reviews and replies." }, { key: "events", label: "Events", hint: "Private event enquiries." }, { key: "payments", label: "Payments", hint: "Payment records and receipts." }, { key: "promos", label: "Promo codes", hint: "Discount codes." }, { key: "giftcards", label: "Gift cards", hint: "Issuing and redeeming gift cards." }, { key: "messages", label: "Messages", hint: "The guest support inbox." }, { key: "guests", label: "Guests", hint: "Accounts: blocking, points and staff access." }, { key: "insights", label: "Insights", hint: "Analytics and reporting." }, { key: "settings", label: "Details", hint: "Location, phone, hours and deposit — what the site says about the place." }, { key: "legal", label: "Terms and privacy", hint: "The legal pages." },
] as const;
export type AdminScope = (typeof ADMIN_SCOPES)[number]["key"];
const SCOPE_KEYS = new Set<string>(ADMIN_SCOPES.map((s) => s.key));
export function isAdminScope(value: unknown): value is AdminScope { return typeof value === "string" && SCOPE_KEYS.has(value); }
export const ADMIN_ACTIONS = ["view", "create", "edit", "delete", "cancel", "refund", "export", "manage"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
const ACTION_KEYS = new Set<string>(ADMIN_ACTIONS);
export function isAdminAction(value: unknown): value is AdminAction { return typeof value === "string" && ACTION_KEYS.has(value); }
declare module "express-serve-static-core" { interface Request { user?: AuthedUser; } }
/** `sid` is the id of the row in `user_sessions` this cookie belongs to — null
    for a cookie signed before that table existed, or wherever a caller has
    not yet been given one to open (registration's very first request, before
    the session row can be created, signs without it and the route that
    follows opens one and reissues). */
export interface AuthedUser { id: number; name: string; email: string; role: UserRole; banned_at: string | null; sid: string | null; }
export function signSession(userId: number, sessionVersion: number, sessionId?: string): string { return jwt.sign({ sub: String(userId), sv: sessionVersion, sid: sessionId, typ: "session" }, JWT_SECRET, { expiresIn: "30d" }); }
export function signChallenge(userId: number): string { return jwt.sign({ sub: String(userId), typ: "2fa" }, JWT_SECRET, { expiresIn: CHALLENGE_TTL_SECONDS }); }
export function readChallenge(token: string): number | null { try { const payload = jwt.verify(token, JWT_SECRET); if (typeof payload !== "object" || payload.typ !== "2fa") return null; const id = Number(payload.sub); return Number.isInteger(id) ? id : null; } catch { return null; } }
export function sessionCookieOptions() { return { httpOnly: true, sameSite: "lax" as const, secure: IS_PROD, maxAge: 30 * 24 * 60 * 60 * 1000, path: "/" }; }
export function clearSessionCookie(res: Response) { res.clearCookie(COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "lax", secure: IS_PROD }); }
export async function revokeSessions(userId: number): Promise<number> { await db.prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ?").run(userId); await revokeAllUserSessions(userId); const row = (await db.prepare("SELECT session_version FROM users WHERE id = ?").get(userId)) as { session_version: number } | undefined; return row?.session_version ?? 1; }
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
      .get(id)) as (Omit<AuthedUser, "sid"> & { session_version: number; deleted_at: string | null }) | undefined;
    if (!row || row.deleted_at || Number(payload.sv) !== row.session_version) return undefined;

    const sid = typeof payload.sid === "string" ? payload.sid : null;
    // A cookie naming a session that has been individually signed out on this
    // one device — the session_version match above only proves nobody has
    // signed out *everywhere*.
    if (sid !== null && !(await sessionIsValid(sid))) return undefined;

    const { session_version: _ignored, deleted_at: _closed, ...user } = row;
    return { ...user, sid };
  } catch {
    return undefined;
  }
}
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = await loadUser(req);
  if (req.user?.sid) touchSession(req.user.sid);
  next();
}
export function requireAuth(req: Request, res: Response, next: NextFunction) { if (!req.user) { res.status(401).json({ error: "You need to sign in first." }); return; } if (req.user.banned_at) { res.status(403).json({ error: "Your account has been suspended." }); return; } next(); }
export function requireAdmin(req: Request, res: Response, next: NextFunction) { if (!req.user) { res.status(401).json({ error: "You need to sign in first." }); return; } if (req.user.banned_at) { res.status(403).json({ error: "Your account has been suspended." }); return; } if (!(STAFF_ROLES as readonly string[]).includes(req.user.role)) { res.status(403).json({ error: "Admin access required." }); return; } next(); }
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) { if (!(UNRESTRICTED_ROLES as readonly string[]).includes(req.user?.role ?? "")) { res.status(403).json({ error: "Super admin access required." }); return; } next(); }

/**
 * The developer tier, and nothing below it.
 *
 * Deliberately not "owner or above": the owner runs the restaurant and has no
 * business being handed a database console or an impersonation button, and a
 * developer has no business being the only one who can. Two different jobs, two
 * different doors.
 */
export function requireDeveloper(req: Request, res: Response, next: NextFunction) { if (!req.user) { res.status(401).json({ error: "You need to sign in first." }); return; } if (req.user.role !== "developer") { res.status(403).json({ error: "Developer access required." }); return; } next(); }
export function requireOwner(req: Request, res: Response, next: NextFunction) { if (req.user?.role !== "owner") { res.status(403).json({ error: "Owner access required." }); return; } next(); }
export async function canAccessScope(userId: number, role: UserRole, scope: AdminScope): Promise<boolean> { if (role !== "admin") return true; const row = (await db.prepare("SELECT granted FROM admin_permissions WHERE user_id = ? AND scope = ?").get(userId, scope)) as { granted: boolean | number } | undefined; return row ? !!row.granted : true; }
export async function canAccessAction(userId: number, role: UserRole, scope: AdminScope, action: AdminAction): Promise<boolean> { if (role !== "admin") return true; if (!(await canAccessScope(userId, role, scope))) return false; const row = (await db.prepare("SELECT granted FROM admin_action_permissions WHERE user_id = ? AND scope = ? AND action = ?").get(userId, scope, action)) as { granted: boolean | number } | undefined; return row ? !!row.granted : true; }
export async function scopeMapForUser(userId: number, role: UserRole): Promise<Record<AdminScope, boolean>> { const map = Object.fromEntries(ADMIN_SCOPES.map((s) => [s.key, true])) as Record<AdminScope, boolean>; if (role !== "admin") return map; const rows = (await db.prepare("SELECT scope, granted FROM admin_permissions WHERE user_id = ?").all(userId)) as { scope: string; granted: boolean | number }[]; for (const r of rows) if (isAdminScope(r.scope)) map[r.scope] = !!r.granted; return map; }
export async function actionMapForUser(userId: number, role: UserRole): Promise<Record<AdminScope, Record<AdminAction, boolean>>> { const map = Object.fromEntries(ADMIN_SCOPES.map((scope) => [scope.key, Object.fromEntries(ADMIN_ACTIONS.map((action) => [action, true]))])) as Record<AdminScope, Record<AdminAction, boolean>>; if (role !== "admin") return map; const rows = (await db.prepare("SELECT scope, action, granted FROM admin_action_permissions WHERE user_id = ?").all(userId)) as { scope: string; action: string; granted: boolean | number }[]; for (const r of rows) if (isAdminScope(r.scope) && isAdminAction(r.action)) map[r.scope][r.action] = !!r.granted; return map; }
export function inferAction(req: Request): AdminAction { const path = `${req.baseUrl}${req.path}`.toLowerCase(); if (path.includes("/refund")) return "refund"; if (path.includes("/cancel")) return "cancel"; if (path.includes("/export")) return "export"; if (path.includes("/delete")) return "delete"; if (path.includes("/manage")) return "manage"; if (path.includes("/reply")) return "edit"; if (req.method === "GET") return "view"; if (req.method === "DELETE") return "delete"; if (req.method === "PATCH" || req.method === "PUT") return "edit"; return "create"; }
export function requireScope(scope: AdminScope, explicitAction?: AdminAction) { return async (req: Request, res: Response, next: NextFunction) => { if (!req.user) { res.status(401).json({ error: "You need to sign in first." }); return; } if (req.user.banned_at) { res.status(403).json({ error: "Your account has been suspended." }); return; } if (!(STAFF_ROLES as readonly string[]).includes(req.user.role)) { res.status(403).json({ error: "Admin access required." }); return; } const action = explicitAction ?? inferAction(req); if (!(await canAccessAction(req.user.id, req.user.role, scope, action))) { res.status(403).json({ error: "The owner has restricted this action for your account." }); return; } next(); }; }
