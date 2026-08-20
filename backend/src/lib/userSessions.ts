/**
 * One row per signed-in device.
 *
 * A session cookie has always carried a `session_version` that lets every
 * cookie for an account be invalidated at once — "sign out everywhere". What
 * it never had was an identity of its own, so there was no way to show a
 * guest their own devices or sign one of them out individually without
 * signing out all of them. This gives each session an id (the JWT's `jti`
 * claim) and a row that can be listed, and revoked, on its own.
 *
 * A cookie signed before this table existed carries no jti. `sessionIsValid`
 * treats that as "nothing to check here" rather than "invalid" — the
 * session_version comparison in loadUser() is still the thing keeping it
 * secure, exactly as it was before this file existed. It simply will not
 * appear in the guest's own session list until they sign in again.
 */

import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { clientIp } from "../middleware/security.js";
import { describeDevice, type DeviceType } from "./deviceInfo.js";
import { locateIp } from "./geoLocation.js";

/* A type alias rather than an interface so a row straight out of the database
   can be asserted into it, the same way every other query in this codebase
   does — an interface has no implicit index signature and needs the
   `as unknown as` double hop to say exactly the same thing. */
export type SessionRow = {
  id: string;
  device_name: string;
  device_type: DeviceType;
  location: string | null;
  created_at: string;
  last_seen_at: string;
};

/**
 * Opens a session row for a request that just signed in, and returns its id.
 *
 * The row exists the moment this returns — location is filled in afterwards,
 * in the background, so a slow or unconfigured geolocation lookup never adds
 * a millisecond to how long signing in takes.
 */
export async function openUserSession(userId: number, req: Request): Promise<string> {
  const id = randomUUID();
  const ip = clientIp(req);
  const device = describeDevice(req.get("user-agent"));

  await db
    .prepare(
      `INSERT INTO user_sessions (id, user_id, device_name, device_type, ip)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, userId, device.name, device.type, ip);

  // Fire-and-forget: a guest signing in must never wait on a third party.
  locateIp(ip)
    .then((location) => {
      if (location) return db.prepare("UPDATE user_sessions SET location = ? WHERE id = ?").run(location, id);
    })
    .catch((err) => console.error("[sessions] location lookup failed", err));

  return id;
}

/** Whether a session id still names a live, un-revoked row — or is simply not
    one this table knows about, which is not the same thing as invalid. */
export async function sessionIsValid(id: string): Promise<boolean> {
  const row = await db.prepare("SELECT revoked_at FROM user_sessions WHERE id = ?").get(id) as
    | { revoked_at: string | null }
    | undefined;
  return row === undefined || row.revoked_at === null;
}

/** Throttled to roughly once every five minutes per session: "last active"
    only needs to be roughly right, and a write on every single request would
    be a database write for every page a guest looks at. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouch = new Map<string, number>();

export function touchSession(id: string): void {
  const now = Date.now();
  const last = lastTouch.get(id);
  if (last !== undefined && now - last < TOUCH_INTERVAL_MS) return;
  lastTouch.set(id, now);
  db.prepare("UPDATE user_sessions SET last_seen_at = now_text() WHERE id = ? AND revoked_at IS NULL")
    .run(id)
    .catch((err) => console.error("[sessions] could not record activity", err));
}

/** Every live session for an account, most recently active first. */
export async function listUserSessions(userId: number): Promise<SessionRow[]> {
  return (await db
    .prepare(
      `SELECT id, device_name, device_type, location, created_at, last_seen_at
       FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY last_seen_at DESC`
    )
    .all(userId)) as SessionRow[];
}

/** Ends one session. Scoped to `userId` so a guest can only ever revoke their
    own device, never guess another account's session id. Returns whether a
    live session actually matched — a caller telling a guest "signed out"
    about a session that was never theirs would be a real information leak. */
export async function revokeUserSession(userId: number, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE user_sessions SET revoked_at = now_text() WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .run(id, userId);
  return result.changes > 0;
}

/** Ends every session for an account. Paired with the session_version bump
    that already does the actual, immediate invalidating — this keeps the
    list itself honest afterwards, rather than leaving revoked rows that read
    as still signed in. */
export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db.prepare("UPDATE user_sessions SET revoked_at = now_text() WHERE user_id = ? AND revoked_at IS NULL").run(userId);
}
