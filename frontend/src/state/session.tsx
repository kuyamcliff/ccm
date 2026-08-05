import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "~/lib/api";
import type { AdminScope, LoginOutcome, User } from "~/lib/api";

interface SessionValue {
  user: User | null;
  /** False until the first "who am I" has come back, so guards do not flash. */
  ready: boolean;
  isStaff: boolean;
  /** Super admin or the owner — everything that keeps working the way it
      always has for "the owner" in the console's older, two-tier sense. */
  isOwner: boolean;
  /** The one account above everyone else. Gates the Access page itself. */
  isTopOwner: boolean;
  /** Whether the signed-in admin can still reach one page. Always true for
      staff above plain admin. Defaults true while still loading, the same
      "hiding is not access control" the server already assumes — the route
      behind it is what actually refuses a locked-out admin. */
  can: (scope: AdminScope) => boolean;
  signIn: (email: string, password: string) => Promise<LoginOutcome>;
  completeTwoFactor: (challenge: string, code: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  /** Re-reads the session — after a name change, or a role change by an owner. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [scopes, setScopes] = useState<Partial<Record<AdminScope, boolean>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.me
      .current()
      .then((value) => {
        /* `?? null` rather than the value as typed. A 200 whose body is not the
           shape we expect resolves to undefined, and undefined is not null —
           so every `user !== null` check downstream would pass and then read a
           property off nothing, taking the whole page down with it. */
        if (!cancelled) setUser(value ?? null);
      })
      .catch(() => {
        // A 401 here is the normal state of a visitor who has not signed in.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Only a plain admin can ever be restricted, so this is the only role worth
     the extra round trip — everyone above it is unrestricted by definition,
     and a diner never touches /desk at all. */
  useEffect(() => {
    if (user?.role !== "admin") {
      setScopes(null);
      return;
    }
    let cancelled = false;
    api.me
      .permissions()
      .then((result) => {
        if (!cancelled) setScopes(result.scopes);
      })
      .catch(() => {
        if (!cancelled) setScopes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  const signIn = useCallback(async (email: string, password: string) => {
    const outcome = await api.me.signIn(email, password);
    if ("user" in outcome) setUser(outcome.user);
    return outcome;
  }, []);

  const completeTwoFactor = useCallback(async (challenge: string, code: string) => {
    const value = await api.me.answerTwoFactor(challenge, code);
    setUser(value);
    return value;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const value = await api.me.register(name, email, password);
    setUser(value);
    return value;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.me.signOut();
    } finally {
      // Even if the call fails, this browser is done with the session.
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me.current());
    } catch {
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (scope: AdminScope) => {
      if (user?.role !== "admin") return true;
      // Still loading, or the fetch failed: default to allowed, same as a
      // never-restricted account, and let the route itself be the real check.
      return scopes?.[scope] ?? true;
    },
    [user?.role, scopes]
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      isStaff: user?.role === "admin" || user?.role === "super_admin" || user?.role === "owner",
      isOwner: user?.role === "super_admin" || user?.role === "owner",
      isTopOwner: user?.role === "owner",
      can,
      signIn,
      completeTwoFactor,
      register,
      signOut,
      refresh,
    }),
    [user, ready, can, signIn, completeTwoFactor, register, signOut, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
