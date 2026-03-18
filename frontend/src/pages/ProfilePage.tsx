import { KeyRound, LogOut, Shield, User } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

const roleColorMap: Record<string, string> = {
  ADMIN: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  T1: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  T2: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
  T3: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  CUSTOMER: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-none">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400 min-w-24">{label}</span>
      <span className="text-sm text-slate-900 dark:text-white text-right">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { language, t } = useLanguage();

  if (!user) return null;

  const zh = language === "zh";

  return (
    <div className="flex h-full flex-col gap-6 p-6 max-w-2xl mx-auto w-full">
      {/* Avatar + Name Banner */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-500" />
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white dark:border-slate-900 bg-slate-900 dark:bg-blue-500 text-white text-3xl font-bold shadow-lg">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="pb-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{user.display_name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">@{user.username}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <span
                key={role}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${roleColorMap[role] ?? roleColorMap["T1"]} ${role === user.active_role ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
              >
                {role === user.active_role && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                {role}
                {role === user.active_role && (
                  <span className="opacity-70">({zh ? "当前" : "active"})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <User className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {zh ? "账户信息" : "Account Information"}
          </h2>
        </div>
        <div className="px-5">
          <InfoRow
            label={zh ? "用户名" : "Username"}
            value={<span className="font-mono">{user.username}</span>}
          />
          <InfoRow
            label={zh ? "显示名称" : "Display Name"}
            value={user.display_name}
          />
          <InfoRow
            label={zh ? "账户状态" : "Account Status"}
            value={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {user.status}
              </span>
            }
          />
          <InfoRow
            label={zh ? "当前角色" : "Active Role"}
            value={
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleColorMap[user.active_role] ?? ""}`}>
                <Shield className="h-3 w-3" />
                {user.active_role}
              </span>
            }
          />
          <InfoRow
            label={zh ? "拥有角色" : "Roles"}
            value={
              <div className="flex flex-wrap gap-1 justify-end">
                {user.roles.map((role) => (
                  <span key={role} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {role}
                  </span>
                ))}
              </div>
            }
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <KeyRound className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {zh ? "快速操作" : "Quick Actions"}
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <Link
            to="/api-tokens"
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">
                {t("user.apiTokens")}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {zh ? "管理用于 API 认证的 Bearer Token" : "Manage Bearer Tokens for API authentication"}
              </div>
            </div>
          </Link>

          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-red-200 hover:bg-red-50/50 dark:border-slate-700 dark:hover:border-red-800 dark:hover:bg-red-900/10"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <LogOut className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-red-600 dark:text-red-400">
                {t("user.logout")}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {zh ? "退出当前登录会话" : "Sign out of the current session"}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
