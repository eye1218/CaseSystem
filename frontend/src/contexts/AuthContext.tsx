import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import * as authApi from "../api/auth";
import { refreshSessionSilently } from "../api/client";
import {
  PROACTIVE_REFRESH_TICK_MS,
  refreshWithSingleRetry,
  shouldTriggerProactiveRefresh
} from "./sessionRefreshPolicy";
import type { AuthenticatedUser, RoleCode } from "../types/auth";

const SESSION_HINT_KEY = "casesystem.session";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (username: string, password: string) => Promise<AuthenticatedUser | null>;
  logout: () => Promise<void>;
  switchRole: (role: RoleCode) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const mountedRef = useRef(true);
  const hasSessionRef = useRef(false);
  const lastActivityAtRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const proactiveTickTimerRef = useRef<number | null>(null);
  const proactiveRefreshInFlightRef = useRef(false);
  const proactiveRefreshAbortRef = useRef<AbortController | null>(null);

  const clearLocalSession = useCallback(() => {
    setUser(null);
    window.localStorage.removeItem(SESSION_HINT_KEY);
  }, []);

  const markSessionActive = useCallback(() => {
    const now = Date.now();
    lastActivityAtRef.current = now;
    lastRefreshAtRef.current = now;
  }, []);

  const refreshUser = async () => {
    try {
      const response = await authApi.fetchCurrentUser();
      setUser(response.user);
      window.localStorage.setItem(SESSION_HINT_KEY, "1");
      markSessionActive();
    } catch {
      clearLocalSession();
    } finally {
      setAuthReady(true);
    }
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (proactiveTickTimerRef.current !== null) {
        window.clearInterval(proactiveTickTimerRef.current);
        proactiveTickTimerRef.current = null;
      }
      proactiveRefreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    hasSessionRef.current = user !== null;
    if (!user) {
      proactiveRefreshAbortRef.current?.abort();
      proactiveRefreshAbortRef.current = null;
      proactiveRefreshInFlightRef.current = false;
      if (proactiveTickTimerRef.current !== null) {
        window.clearInterval(proactiveTickTimerRef.current);
        proactiveTickTimerRef.current = null;
      }
    }
  }, [user]);

  useEffect(() => {
    const hasSessionHint = window.localStorage.getItem(SESSION_HINT_KEY) === "1";

    if (!hasSessionHint) {
      setAuthReady(true);
      return;
    }

    void refreshUser();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markActivity();
      }
    };

    markActivity();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity, { passive: true });
    window.addEventListener("wheel", markActivity, { passive: true });

    const tick = async () => {
      if (proactiveRefreshInFlightRef.current || !hasSessionRef.current) {
        return;
      }

      const shouldRefresh = shouldTriggerProactiveRefresh({
        nowMs: Date.now(),
        lastRefreshAtMs: lastRefreshAtRef.current,
        lastActivityAtMs: lastActivityAtRef.current,
        isVisible: document.visibilityState === "visible"
      });
      if (!shouldRefresh) {
        return;
      }

      proactiveRefreshInFlightRef.current = true;
      const controller = new AbortController();
      proactiveRefreshAbortRef.current?.abort();
      proactiveRefreshAbortRef.current = controller;

      try {
        const refreshed = await refreshWithSingleRetry({
          refresh: refreshSessionSilently,
          signal: controller.signal,
          shouldContinue: () => mountedRef.current && hasSessionRef.current,
          onSessionInvalid: clearLocalSession
        });
        if (refreshed) {
          const now = Date.now();
          lastRefreshAtRef.current = now;
          lastActivityAtRef.current = now;
        }
      } finally {
        if (proactiveRefreshAbortRef.current === controller) {
          proactiveRefreshAbortRef.current = null;
        }
        proactiveRefreshInFlightRef.current = false;
      }
    };

    proactiveTickTimerRef.current = window.setInterval(() => {
      void tick();
    }, PROACTIVE_REFRESH_TICK_MS);

    return () => {
      if (proactiveTickTimerRef.current !== null) {
        window.clearInterval(proactiveTickTimerRef.current);
        proactiveTickTimerRef.current = null;
      }
      proactiveRefreshAbortRef.current?.abort();
      proactiveRefreshAbortRef.current = null;
      proactiveRefreshInFlightRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
      window.removeEventListener("wheel", markActivity);
    };
  }, [clearLocalSession, user]);

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
          markSessionActive();
          return response.user;
        } catch {
          clearLocalSession();
          return null;
        }
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          clearLocalSession();
        }
      },
      switchRole: async (role: RoleCode) => {
        const response = await authApi.switchRole(role);
        setUser(response.user);
        lastActivityAtRef.current = Date.now();
      },
      refreshUser
    }),
    [authReady, clearLocalSession, markSessionActive, user]
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
