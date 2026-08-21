import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "~/state/session";
import { PageLoading } from "~/ui/Feedback";

/**
 * Who is allowed to see a route.
 *
 * These hide screens. They do not protect anything, and it is worth being blunt
 * about that: every route behind them is enforced again on the server, by
 * `requireAuth`, `requireAdmin` and `requireScope`. What the console hides is
 * convenience, never the check.
 *
 * `ready` is the load-bearing part. Redirecting before the session has settled
 * bounces a signed-in person to the sign-in screen for a fraction of a second
 * and then back, which is worse than a short wait. Since v5 the session is
 * usually settled on the first frame, seeded from the cached boot payload, so
 * that wait is rare.
 */

/** Requires a signed-in visitor. The attempted path travels with the redirect,
    so signing in returns them to what they were trying to do rather than
    dumping them on the home page. */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const location = useLocation();

  if (!ready) return <PageLoading />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Requires staff. An ordinary account is sent home rather than shown a door it
    cannot open. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, ready, isStaff } = useSession();
  const location = useLocation();

  if (!ready) return <PageLoading />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  if (!isStaff) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Requires the developer tier. Sends anyone else to the console they do have,
    which for staff is the overview and for everyone else is home. */
export function RequireDeveloper({ children }: { children: ReactNode }) {
  const { ready, isStaff, isDeveloper } = useSession();

  if (!ready) return <PageLoading />;
  if (!isDeveloper) return <Navigate to={isStaff ? "/desk" : "/"} replace />;
  return <>{children}</>;
}
