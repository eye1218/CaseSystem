import { NavLink } from "react-router-dom";
import {
  Bell,
  BookOpen,
  FileCheck,
  FileText,
  Inbox,
  LayoutDashboard,
  Settings,
  Ticket,
  Clock,
  Trash2,
  TrendingUp,
  Users
} from "lucide-react";

import { hasMenuAccess, useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import logoDark from "../styles/logo-dark.svg";
import logoLight from "../styles/logo-light.svg";

const menuItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "nav.dashboard", path: "/" },
  { id: "tickets", icon: Ticket, label: "nav.tickets", path: "/tickets" },
  { id: "ticketPool", icon: Inbox, label: "nav.ticketPool", path: "/ticket-pool" },
  { id: "slaMonitor", icon: Clock, label: "nav.slaMonitor", path: "/sla-monitor" },
  { id: "notifications", icon: Bell, label: "nav.notifications", path: "/notifications" },
  { id: "knowledge", icon: BookOpen, label: "nav.knowledge", path: "/knowledge" },
  { id: "reports", icon: FileText, label: "nav.reports", path: "/reports" },
  { id: "kpi", icon: TrendingUp, label: "nav.kpi", path: "/kpi" },
  { id: "configuration", icon: Settings, label: "nav.configuration", path: "/configuration" },
  { id: "users", icon: Users, label: "nav.users", path: "/users" },
  { id: "audit", icon: FileCheck, label: "nav.audit", path: "/audit" },
  { id: "recycle", icon: Trash2, label: "nav.recycle", path: "/recycle-bin" }
];

export default function AppSidebar() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();

  if (!user) return null;

  return (
    <aside className="hidden w-72 flex-col border-r border-slate-200 bg-white/90 backdrop-blur md:flex dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex h-18 items-center gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <img
          src={theme === "light" ? logoLight : logoDark}
          alt="CaseSystem logo"
          className="h-10 w-10 rounded-xl"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide text-slate-900 dark:text-white">CaseSystem</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">SOC 7x24 Security Operations</div>
        </div>
      </div>

      <nav className="flex-1 overflow-auto px-4 py-5">
        <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          Workspace
        </div>
        <div className="space-y-1.5">
          {menuItems
            .filter((item) => hasMenuAccess(user.active_role, item.id))
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{t(item.label)}</span>
                </NavLink>
              );
            })}
        </div>
      </nav>

      <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        当前角色：{user.active_role}
      </div>
    </aside>
  );
}
