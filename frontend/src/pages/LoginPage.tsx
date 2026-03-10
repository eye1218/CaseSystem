import { AlertCircle, Languages, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import logoDark from "../styles/logo-dark.svg";
import logoLight from "../styles/logo-light.svg";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { isAuthenticated, login } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/tickets", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const success = await login(username, password);
      if (!success) {
        setError(t("login.invalid"));
        return;
      }
      navigate("/tickets", { replace: true });
    } catch {
      setError(t("login.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="rounded-lg border border-slate-200 bg-white/80 p-2 text-slate-600 shadow-sm transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        <button
          onClick={toggleLanguage}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-sm transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          <Languages className="h-4 w-4" />
          {language === "zh" ? "EN" : "中"}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src={theme === "light" ? logoLight : logoDark}
            alt="CaseSystem logo"
            className="mx-auto mb-6 h-16 w-16 rounded-2xl"
          />
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{t("login.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("login.subtitle")}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-2xl shadow-slate-300/30 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/30">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("login.username")}
              </label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={language === "zh" ? "请输入用户名" : "Enter username"}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("login.password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={language === "zh" ? "请输入密码" : "Enter password"}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t("common.loading") : t("login.signin")}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-5 text-center dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("login.securityNote")}</p>
            <div className="mt-4 space-y-1 text-left font-mono text-[11px] text-slate-400 dark:text-slate-500">
              <div>admin / AdminPass123</div>
              <div>analyst / AnalystPass123</div>
              <div>customer / CustomerPass123</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
