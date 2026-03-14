import { Bell, ChevronDown, Languages, LogOut, Moon, Sun, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { useTheme } from "../contexts/ThemeContext";
import type { RoleCode } from "../types/auth";

const routeTitleMap: Record<string, string> = {
  "/tickets": "nav.tickets",
  "/sla-monitor": "nav.slaMonitor",
  "/notifications": "nav.notifications",
  "/knowledge": "nav.knowledge",
  "/tasks": "nav.tasks",
  "/reports": "nav.reports",
  "/kpi": "nav.kpi",
  "/configuration": "nav.configuration",
  "/users": "nav.users",
  "/audit": "nav.audit",
  "/recycle-bin": "nav.recycle"
};

export default function AppHeader() {
  const { user, logout, switchRole } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { realtimeStatus, unreadCount } = useRealtime();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setRoleMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  const pageTitleKey = useMemo(() => {
    if (location.pathname.startsWith("/tickets/")) {
      return "nav.tickets";
    }
    if (location.pathname.startsWith("/knowledge")) {
      return "nav.knowledge";
    }
    if (location.pathname.startsWith("/events")) {
      return "nav.events";
    }
    if (location.pathname.startsWith("/tasks")) {
      return "nav.tasks";
    }
    if (location.pathname.startsWith("/configuration")) {
      return "nav.configuration";
    }
    return routeTitleMap[location.pathname] ?? "dashboard.title";
  }, [location.pathname]);

  if (!user) return null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{t(pageTitleKey)}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">CaseSystem security workflow console</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="toggle theme"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        <button
          onClick={toggleLanguage}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="toggle language"
        >
          <Languages className="h-4 w-4" />
          <span>{language === "zh" ? "EN" : "中"}</span>
        </button>

        <Link
          to="/notifications"
          className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              realtimeStatus === "connected"
                ? "bg-emerald-500"
                : realtimeStatus === "connecting"
                  ? "bg-amber-500"
                  : realtimeStatus === "error"
                    ? "bg-red-500"
                    : "bg-slate-400"
            }`}
          />
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        {user.roles.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setRoleMenuOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            >
              <span>{user.active_role}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {roleMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {user.roles.map((role) => (
                  <button
                    key={role}
                    onClick={() => void switchRole(role as RoleCode)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                      role === user.active_role
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{role}</span>
                    <span className="text-xs">{t(`role.${role.toLowerCase()}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((current) => !current)}
            className="inline-flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white dark:bg-blue-500">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-left md:block">
              <div className="font-medium text-slate-800 dark:text-white">{user.display_name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{user.username}</div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <Link
                to="/tickets"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <User className="h-4 w-4" />
                {t("user.profile")}
              </Link>
              <button
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-4 w-4" />
                {t("user.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
