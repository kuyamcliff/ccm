import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, api, needsTwoFactor } from "./api";
import type { LoginResult, User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  /** Resolves to a 2FA challenge when the account has it enabled. */
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTwoFactor: (challenge: string, code: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((r) => { if (!cancelled) setUser(r.user); })
      .catch((e) => {
        // 401 just means nobody is signed in — not worth logging.
        if (!(e instanceof ApiError && (e.status === 401 || e.isOffline))) console.error(e);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (!needsTwoFactor(result)) setUser(result.user);
    return result;
  }, []);

  const completeTwoFactor = useCallback(async (challenge: string, code: string) => {
    const r = await api.verify2fa(challenge, code);
    setUser(r.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await api.register(name, email, password);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // The local session is cleared even if the request failed, so the UI
      // never shows someone as signed in after they asked to leave.
      setUser(null);
    }
  }, []);

  const refetch = useCallback(async () => {
    try {
      const r = await api.me();
      setUser(r.user);
    } catch (e) {
      // A revoked or expired session should drop the user, but a network blip
      // should not sign them out.
      if (e instanceof ApiError && e.status === 401) setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === "admin" || user?.role === "super_admin",
      login,
      completeTwoFactor,
      register,
      logout,
      refetch,
    }),
    [user, loading, login, completeTwoFactor, register, logout, refetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
