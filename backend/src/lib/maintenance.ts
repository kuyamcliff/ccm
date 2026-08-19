/**
 * Whether the site is closed to customers while work is done on it.
 *
 * The hard rule here is that turning this on must never lock the owner out of
 * turning it off again. Everything below follows from that:
 *
 *   - staff are let through, always;
 *   - signing in stays open, or a signed-out owner could never become staff;
 *   - the settings the site reads to know it is in maintenance stay readable,
 *     or the console cannot render the switch to turn it off;
 *   - the health check stays open, or the platform decides the service is dead
 *     and stops routing to it — including to the console.
 *
 * Anything not on that list is closed, because a half-open site during
 * maintenance is worse than a closed one: a customer gets far enough to pay
 * and then hits a wall.
 */

export type MaintenanceDecision = "open" | "closed";

/**
 * Paths that stay reachable no matter what.
 *
 * Prefix matches on the full path. Deliberately short: every entry is a way
 * into the application while it is supposed to be shut, so each one has to
 * earn its place by being necessary to get out of maintenance.
 */
const ALWAYS_OPEN = [
  /* Signing in, signing out, and "who am I". Without these a signed-out owner
     can never become staff, and staff already signed in cannot be recognised. */
  "/api/auth",
  /* The console reads these to render the switch that turns maintenance off,
     and the customer maintenance screen reads them for the message to show. */
  "/api/site-settings",
  /* The platform's own check. A 503 here and the host stops routing to the
     service, taking the console down with the site. */
  "/api/health",
  /* Account recovery, so a locked-out owner who has also lost their password
     is not locked out twice over. */
  "/api/recovery",
] as const;

/** Everything a signed-in member of staff is, in the one place. */
const STAFF_ROLES = new Set(["admin", "super_admin", "owner"]);

export interface MaintenanceState {
  enabled: boolean;
}

/** Reads the maintenance block off the untrusted config blob. */
export function readMaintenance(config: Record<string, unknown> | undefined): MaintenanceState {
  const raw = config?.maintenance;
  if (!raw || typeof raw !== "object") return { enabled: false };
  return { enabled: (raw as Record<string, unknown>).enabled === true };
}

/**
 * The whole decision for one request.
 *
 * `role` is whatever the session resolved to, or undefined for a visitor with
 * no session at all.
 */
export function decide(state: MaintenanceState, path: string, role: string | undefined): MaintenanceDecision {
  if (!state.enabled) return "open";
  if (role !== undefined && STAFF_ROLES.has(role)) return "open";
  if (ALWAYS_OPEN.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return "open";
  return "closed";
}
