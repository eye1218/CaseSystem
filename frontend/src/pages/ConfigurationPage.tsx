import {
  ChevronRight,
  FileCode,
  Lock,
  Settings
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

interface SubModule {
  id: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  path: string;
  icon: ReactNode;
  tags: string[];
  adminOnly?: boolean;
}

const SUB_MODULES: SubModule[] = [
  {
    id: "templates",
    titleZh: "模板渲染",
    titleEn: "Template Rendering",
    descZh: "管理 Email 与 Webhook 通知模板，支持 Jinja2 语法，基于工单上下文进行渲染预览与测试。",
    descEn: "Manage Email and Webhook notification templates. Supports Jinja2 syntax with ticket context preview and test rendering.",
    path: "/configuration/templates",
    icon: <FileCode className="h-5 w-5 text-blue-500" />,
    tags: ["Email", "Webhook", "Jinja2"],
    adminOnly: true
  }
];

const PLACEHOLDER_MODULES = [
  {
    titleZh: "SLA 策略配置",
    titleEn: "SLA Policy",
    descZh: "配置工单响应与处置时限规则",
    descEn: "Configure response and resolution SLA policies"
  },
  {
    titleZh: "告警规则配置",
    titleEn: "Alert Rules",
    descZh: "管理告警分类与自动分派规则",
    descEn: "Manage alert categorization and auto-dispatch rules"
  },
  {
    titleZh: "渠道集成",
    titleEn: "Channel Integration",
    descZh: "配置 SMTP、Webhook 凭证等外部集成",
    descEn: "Configure SMTP, Webhook credentials, and external integrations"
  },
  {
    titleZh: "系统参数",
    titleEn: "System Parameters",
    descZh: "调整系统全局配置项与参数",
    descEn: "Adjust global system configuration parameters"
  }
];

export default function ConfigurationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const zh = language === "zh";

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <span>{zh ? "配置中心" : "Configuration"}</span>
        </div>
        <h1 className="text-slate-900 dark:text-white">{t("nav.configuration")}</h1>
        <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
          {zh
            ? "管理系统通知模板、SLA 策略、告警规则及全局配置项，仅限系统管理员访问。"
            : "Manage notification templates, SLA policies, alert rules, and global settings. Administrator access required."}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {zh ? "可用模块" : "Available Modules"}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SUB_MODULES.map((module) => {
            const isAccessible = !module.adminOnly || user?.active_role === "ADMIN";

            return (
              <div
                key={module.id}
                onClick={() => {
                  if (isAccessible) {
                    navigate(module.path);
                  }
                }}
                className={`group rounded-xl border border-slate-200 bg-white p-5 transition-all dark:border-slate-700 dark:bg-slate-800 ${
                  isAccessible
                    ? "cursor-pointer hover:border-blue-300 hover:shadow-md dark:hover:border-blue-700"
                    : "cursor-not-allowed opacity-60"
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/20">
                    {module.icon}
                  </div>
                  {isAccessible ? (
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-500 dark:text-slate-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                  )}
                </div>

                <h3 className="mb-1 text-sm text-slate-800 dark:text-slate-100">
                  {zh ? module.titleZh : module.titleEn}
                </h3>
                <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {zh ? module.descZh : module.descEn}
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                  {module.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                  {module.adminOnly ? (
                    <span className="ml-auto rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400">
                      {zh ? "仅管理员" : "Admin only"}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {zh ? "规划中模块" : "Planned Modules"}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLACEHOLDER_MODULES.map((module) => (
            <div
              key={module.titleEn}
              className="rounded-xl border border-dashed border-slate-200 bg-white p-4 opacity-50 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/60">
                <Settings className="h-4 w-4 text-slate-400" />
              </div>
              <h3 className="mb-1 text-xs text-slate-600 dark:text-slate-300">
                {zh ? module.titleZh : module.titleEn}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {zh ? module.descZh : module.descEn}
              </p>
              <div className="mt-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400 dark:bg-slate-700/60 dark:text-slate-500">
                  {zh ? "开发中" : "Coming soon"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
