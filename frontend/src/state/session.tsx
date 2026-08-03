import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "~/lib/api";
import type { LoginOutcome, User } from "~/lib/api";

interface SessionValue {
  user: User | null;
  /** False until the first "who am I" has come back, so guards do not flash. */
  ready: boolean;
  isStaff: boolean;
  isOwner: boolean;
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

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      isStaff: user?.role === "admin" || user?.role === "super_admin",
      isOwner: user?.role === "super_admin",
      signIn,
      completeTwoFactor,
      register,
      signOut,
      refresh,
    }),
    [user, ready, signIn, completeTwoFactor, register, signOut, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
