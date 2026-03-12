import { ChevronRight, FileCog, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

export default function ConfigurationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const zh = language === "zh";
  const adminOnly = user?.active_role !== "ADMIN";

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-400">{zh ? "Configuration" : "Configuration"}</div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t("nav.configuration")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {zh
            ? "配置中心承接需要管理员维护的系统级能力。当前已接入报告模板管理，用于按工单类型维护可下载的模板文件。"
            : "Configuration hosts administrator-managed system capabilities. Report templates are now available for maintaining downloadable files by ticket category."}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!adminOnly) {
            navigate("/configuration/report-templates");
          }
        }}
        className={`group flex w-full max-w-3xl items-start justify-between rounded-3xl border p-6 text-left shadow-sm transition-all ${
          adminOnly
            ? "cursor-not-allowed border-slate-200 bg-white/70 opacity-70 dark:border-slate-800 dark:bg-slate-900/70"
            : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
        }`}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/40">
            <FileCog className="h-5 w-5 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              {zh ? "报告模板" : "Report Templates"}
            </div>
            <p className="mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              {zh
                ? "上传、启停、替换并下载工单类型关联的模板文件，供内部人员在工单处理过程中复用。"
                : "Upload, activate, replace, and download category-bound template files for internal report workflows."}
            </p>
          </div>
        </div>
        {adminOnly ? (
          <Lock className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-blue-500" />
        )}
      </button>
    </div>
  );
}
