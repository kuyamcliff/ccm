import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "~/lib/api";
import type { AdminScope, LoginOutcome, User } from "~/lib/api";
import { setUnauthorizedHandler } from "~/lib/http";
import { readBoot, clearBoot } from "~/lib/boot";
import { resetCache } from "~/lib/store";
import { useToast } from "./toast";

/**
 * Who is using the site.
 *
 * ── What changed in v5 ─────────────────────────────────────────────────────
 *
 * `ready` used to start false and stay false until `/api/auth/me` came back,
 * and the whole app refused to render until then. On a cold connection that is
 * a black screen for a second or more, for a page that in most cases was going
 * to say "signed out" anyway.
 *
 * Now the answer usually arrives with the boot payload, which the browser
 * already has in localStorage from the last visit. A returning customer is
 * rendered as themselves on the first frame, and the fresh answer confirms it a
 * moment later. Only a genuinely first-ever visit waits, and even then it waits
 * on one request rather than three.
 *
 * The stale answer is never trusted for anything that matters. It decides what
 * to *draw* and nothing else. Every route the console exposes is enforced on the
 * server, so the worst case for a cached "you are staff" that is no longer true
 * is a menu item that 403s when pressed.
 *
 * ── Roles ──────────────────────────────────────────────────────────────────
 *
 * user < admin < super_admin < owner < developer
 *
 * `developer` is new. It sits above owner because it exists to look at the thing
 * the owner runs: health, errors, flags, the database. Hiding is not access
 * control here either; `backend/src/routes/dev.ts` is what actually refuses.
 */

/**
 * Broadcasts a sign-in or sign-out to every other tab on this browser.
 *
 * The cookie is shared between tabs the instant it changes, but each tab's React
 * state is not: a tab left open on the account page would keep showing that
 * account until something made it ask again. `storage` fires only in *other*
 * tabs than the one that wrote the key, which is exactly the tabs that need
 * telling.
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
  /** False only until the first real answer has come back. Usually true on the
      first frame, because the boot payload carries it. */
  ready: boolean;
  isStaff: boolean;
  /** Super admin, owner or developer: everything the console's older two-tier
      sense of "the owner" gated on. */
  isOwner: boolean;
  /** The one account above the rest of the staff. Gates the Access page. */
  isTopOwner: boolean;
  /** The tier above that, which exists to look at the machinery. */
  isDeveloper: boolean;
  /**
   * Whether the signed-in admin can still reach one page.
   *
   * Always true for anyone above plain admin, and true by default while the
   * permission map is still loading. That is deliberate and matches what the
   * server already assumes: hiding is not access control, and the route behind
   * the link is what refuses a restricted admin.
   */
  can: (scope: AdminScope) => boolean;
  signIn: (email: string, password: string) => Promise<LoginOutcome>;
  completeTwoFactor: (challenge: string, code: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  /** Re-reads the session, after a name change or a role change by an owner. */
  refresh: () => Promise<void>;
  /** Called by the boot fetch once the authoritative answer lands. */
  settle: (user: User | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

const STAFF = new Set(["admin", "super_admin", "owner", "developer"]);
const ABOVE_ADMIN = new Set(["super_admin", "owner", "developer"]);

export function SessionProvider({ children }: { children: ReactNode }) {
  /* Seeded straight from the cached boot payload, so a returning customer is
     drawn as themselves on the very first frame. */
  const cached = readBoot();
  const [user, setUser] = useState<User | null>(cached?.user ?? null);
  const [ready, setReady] = useState(cached !== null);
  const [scopes, setScopes] = useState<Partial<Record<AdminScope, boolean>> | null>(null);
  const toast = useToast();

  /* Read by the 401 handler and the storage listener, both registered once and
     both of which must see the current user rather than the one from whichever
     render happened to set them up. */
  const userRef = useRef(user);
  userRef.current = user;

  /*
   * A 401 on any request, from any page.
   *
   * It means this tab's cookie no longer works: it expired, "sign out
   * everywhere" fired from another device, or an admin banned the account. If
   * this tab still believes somebody is signed in, that belief is now wrong, so
   * drop it at once rather than leaving that account's data on screen.
   *
   * A guest's ordinary 401s (a first "who am I", a wrong password on the sign-in
   * form) never reach this branch, because `userRef` is still null when they
   * happen.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current === null) return;
      setUser(null);
      clearBoot();
      resetCache();
      /* Says what happened and what to do about it. "You have been signed out"
         reads as something the site chose to do to them; a session that ran out
         is a fact with an obvious next step, and the guard that redirects
         carries the page they were on. */
      toast.say("Your session has expired. Sign in again to pick up where you were.");
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== SESSION_EVENT_KEY) return;
      api.me
        .current()
        .then((value) => setUser(value ?? null))
        .catch(() => setUser(null))
        .finally(() => setReady(true));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* Only a plain admin can ever be restricted, so this is the only role worth
     the extra round trip. Everyone above it is unrestricted by definition, and a
     diner never touches /desk at all. */
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

  const settle = useCallback((value: User | null) => {
    setUser(value);
    setReady(true);
  }, []);

  /**
   * Everything that changes who is holding the phone.
   *
   * The cache and the boot payload both go, because both are keyed to a person
   * and neither is safe to hand to the next one. Signing in clears them too: the
   * pages cached while signed out are a visitor's pages.
   */
  const changeHands = useCallback((next: User | null) => {
    setUser(next);
    setReady(true);
    clearBoot();
    resetCache();
    announceSessionChange();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const outcome = await api.me.signIn(email, password);
      /* A 2FA challenge is not a sign-in yet: nothing has changed hands until
         the code is accepted. */
      if ("user" in outcome) changeHands(outcome.user);
      return outcome;
    },
    [changeHands]
  );

  const completeTwoFactor = useCallback(
    async (challenge: string, code: string) => {
      const value = await api.me.answerTwoFactor(challenge, code);
      changeHands(value);
      return value;
    },
    [changeHands]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const value = await api.me.register(name, email, password);
      changeHands(value);
      return value;
    },
    [changeHands]
  );

  const signOut = useCallback(async () => {
    try {
      await api.me.signOut();
    } finally {
      /* Even if the call fails, this browser is done with the session, and every
         other tab it has open needs to hear that too. */
      changeHands(null);
    }
  }, [changeHands]);

  const refresh = useCallback(async () => {
    try {
      setUser((await api.me.current()) ?? null);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  const can = useCallback(
    (scope: AdminScope) => {
      if (user?.role !== "admin") return true;
      return scopes?.[scope] ?? true;
    },
    [user?.role, scopes]
  );

  const value = useMemo<SessionValue>(() => {
    const role = user?.role;
    return {
      user,
      ready,
      isStaff: role !== undefined && STAFF.has(role),
      isOwner: role !== undefined && ABOVE_ADMIN.has(role),
      isTopOwner: role === "owner" || role === "developer",
      isDeveloper: role === "developer",
      can,
      signIn,
      completeTwoFactor,
      register,
      signOut,
      refresh,
      settle,
    };
  }, [user, ready, can, signIn, completeTwoFactor, register, signOut, refresh, settle]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
