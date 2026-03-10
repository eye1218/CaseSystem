import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import * as authApi from "../api/auth";
import type { AuthenticatedUser, RoleCode } from "../types/auth";

const SESSION_HINT_KEY = "casesystem.session";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchRole: (role: RoleCode) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const refreshUser = async () => {
    try {
      const response = await authApi.fetchCurrentUser();
      setUser(response.user);
      window.localStorage.setItem(SESSION_HINT_KEY, "1");
    } catch {
      setUser(null);
      window.localStorage.removeItem(SESSION_HINT_KEY);
    } finally {
      setAuthReady(true);
    }
  };

  useEffect(() => {
    const hasSessionHint = window.localStorage.getItem(SESSION_HINT_KEY) === "1";

    if (!hasSessionHint) {
      setAuthReady(true);
      return;
    }

    void refreshUser();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      authReady,
      login: async (username: string, password: string) => {
        try {
          const response = await authApi.login(username, password);
          setUser(response.user);
          window.localStorage.setItem(SESSION_HINT_KEY, "1");
          return true;
        } catch {
          setUser(null);
          window.localStorage.removeItem(SESSION_HINT_KEY);
          return false;
        }
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          setUser(null);
          window.localStorage.removeItem(SESSION_HINT_KEY);
        }
      },
      switchRole: async (role: RoleCode) => {
        const response = await authApi.switchRole(role);
        setUser(response.user);
      },
      refreshUser
    }),
    [authReady, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function hasMenuAccess(role: RoleCode, menuItem: string): boolean {
  const accessMatrix: Record<RoleCode, string[]> = {
    T1: ["tickets", "ticketPool", "slaMonitor", "notifications", "knowledge", "reports"],
    T2: ["tickets", "ticketPool", "slaMonitor", "notifications", "knowledge", "reports", "kpi"],
    T3: ["tickets", "ticketPool", "slaMonitor", "notifications", "knowledge", "reports", "kpi"],
    ADMIN: ["dashboard", "tickets", "ticketPool", "slaMonitor", "notifications", "knowledge", "reports", "kpi", "configuration", "users", "audit", "recycle"],
    CUSTOMER: ["tickets", "knowledge", "reports", "notifications"]
  };

  return accessMatrix[role]?.includes(menuItem) ?? false;
}
