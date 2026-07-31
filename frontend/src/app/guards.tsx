import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "~/state/session";
import { Skeleton } from "~/ui/Feedback";

/** Held while the session is being read, so a guard never flashes a redirect
    at somebody who is in fact signed in. */
function Settling() {
  return (
    <div className="page section stack">
      <Skeleton height="2.5rem" width="14rem" />
      <Skeleton height="12rem" radius="var(--r-lg)" />
    </div>
  );
}

/**
 * Requires a signed-in visitor.
 *
 * The attempted path travels with the redirect so signing in returns them to
 * what they were trying to do, rather than dumping them on the home page.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const location = useLocation();

  if (!ready) return <Settling />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Requires staff. An ordinary account gets sent home rather than shown a
    door it cannot open. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, ready, isStaff } = useSession();
  const location = useLocation();

  if (!ready) return <Settling />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  if (!isStaff) return <Navigate to="/" replace />;
  return <>{children}</>;
}
