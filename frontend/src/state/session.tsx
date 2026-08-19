import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "~/lib/api";
import type { AdminScope, LoginOutcome, User } from "~/lib/api";
import { setUnauthorizedHandler } from "~/lib/http";
import { useToast } from "~/state/toast";

/**
 * Broadcasts a sign-in or sign-out to every other tab on this browser.
 *
 * The cookie is shared between tabs the instant it changes, but each tab's
 * React state is not: a tab left open on the account page, or on a page that
 * only fetched its data once, would otherwise keep showing that account until
 * something made it ask again. `storage` only fires in *other* tabs than the
 * one that wrote the key, which is exactly the tabs that need telling.
 */
const SESSION_EVENT_KEY = "ccm.session.event";
function announceSessionChange() {
  try {
    localStorage.setItem(SESSION_EVENT_KEY, String(Date.now()));
  } catch {
    /* Private browsing. Other tabs just will not hear about this one. */
  }
}

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
  const toast = useToast();

  /* Read from the 401 handler and the storage listener below, both of which
     are registered once and must always see the current user, not the one
     from whichever render happened to set them up. */
  const userRef = useRef(user);
  userRef.current = user;

  /* A 401 on any request, from any page, means this tab's cookie no longer
     works: it expired, "sign out everywhere" fired from another device, or
     an admin banned the account. If this tab still thinks somebody is signed
     in, that belief is now wrong, so drop it at once rather than leaving
     whatever that account's data was on screen. A guest's normal 401s (the
     first "who am I", a wrong password on the sign-in form) never reach this
     branch, because userRef is still null when they happen. */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current !== null) {
        setUser(null);
        /* Says what happened and what to do about it. "You have been signed
           out" reads as something the site chose to do to them; a session
           that ran out is a fact with an obvious next step, and the guard
           that redirects carries the page they were on so signing in again
           returns them to it rather than to the home page. */
        toast.say("Your session has expired. Sign in again to pick up where you were.");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  /* Signing out in one tab clears the cookie for every tab, but only this
     one re-renders. Without this, a tab left open on the account page, or on
     anything that only fetched its data once, keeps showing that account
     until something makes it ask again. */
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== SESSION_EVENT_KEY) return;
      api.me
        .current()
        .then((value) => setUser(value ?? null))
        .catch(() => setUser(null));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    if ("user" in outcome) {
      setUser(outcome.user);
      announceSessionChange();
    }
    return outcome;
  }, []);

  const completeTwoFactor = useCallback(async (challenge: string, code: string) => {
    const value = await api.me.answerTwoFactor(challenge, code);
    setUser(value);
    announceSessionChange();
    return value;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const value = await api.me.register(name, email, password);
    setUser(value);
    announceSessionChange();
    return value;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.me.signOut();
    } finally {
      // Even if the call fails, this browser is done with the session, and
      // every other tab it has open needs to hear that too.
      setUser(null);
      announceSessionChange();
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
