import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle,
  Code,
  Copy,
  Database,
  Edit,
  Eye,
  FileCode,
  Info,
  Lock,
  Mail,
  Play,
  Plus,
  PlusCircle,
  Power,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  ToggleLeft,
  ToggleRight,
  X,
  Zap,
  ChevronRight
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ApiError } from "../api/client";
import {
  createTemplate,
  getTemplateDetail,
  listTemplateTypes,
  listTemplates,
  previewTemplate,
  updateTemplate,
  updateTemplateStatus
} from "../api/templates";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type {
  HttpMethod,
  LocalizedText,
  TemplateDetailResponse,
  TemplateFieldDefinition,
  TemplateFieldError,
  TemplateFieldKey,
  TemplateFieldsPayload,
  TemplateHeaderPayload,
  TemplatePreviewResponse,
  TemplateStatus,
  TemplateSummary,
  TemplateType,
  TemplateTypeDefinition
} from "../types/template";

type Language = "zh" | "en";
type ViewMode = "list" | "detail" | "create" | "edit" | "preview";
type FilterType = "all" | TemplateType;
type FilterStatus = "all" | TemplateStatus;
type FeedbackTone = "success" | "error" | "info";

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

interface EditableHeaderRow extends TemplateHeaderPayload {
  id: string;
}

interface TemplateEditorDraft {
  templateId: string | null;
  name: string;
  code: string;
  templateType: TemplateType;
  description: string;
  status: TemplateStatus;
  fields: {
    subject: string;
    body: string;
    url: string;
    method: HttpMethod | "";
    headers: EditableHeaderRow[];
  };
}

type FormErrorMap = Partial<Record<"name" | "code" | TemplateFieldKey, string[]>>;

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const TEMPLATE_VARIABLES = [
  { name: "ticket.id", group: "ticket", descZh: "工单编号", descEn: "Ticket ID" },
  { name: "ticket.title", group: "ticket", descZh: "工单标题", descEn: "Ticket Title" },
  { name: "ticket.priority", group: "ticket", descZh: "优先级", descEn: "Priority" },
  { name: "ticket.status", group: "ticket", descZh: "工单状态", descEn: "Status" },
  { name: "ticket.category", group: "ticket", descZh: "告警分类", descEn: "Category" },
  { name: "ticket.source", group: "ticket", descZh: "告警来源", descEn: "Alert Source" },
  { name: "ticket.risk_score", group: "ticket", descZh: "风险评分", descEn: "Risk Score" },
  { name: "ticket.assignee", group: "ticket", descZh: "当前处置人", descEn: "Assignee" },
  { name: "ticket.creator", group: "ticket", descZh: "创建人", descEn: "Creator" },
  { name: "ticket.created_at", group: "ticket", descZh: "创建时间", descEn: "Created At" },
  { name: "ticket.updated_at", group: "ticket", descZh: "最近更新时间", descEn: "Updated At" },
  { name: "ticket.sla_deadline", group: "ticket", descZh: "SLA 截止时间", descEn: "SLA Deadline" },
  { name: "ticket.url", group: "ticket", descZh: "工单链接", descEn: "Ticket URL" },
  { name: "customer.name", group: "customer", descZh: "客户名称", descEn: "Customer Name" },
  { name: "customer.email", group: "customer", descZh: "客户邮箱", descEn: "Customer Email" },
  { name: "analyst.name", group: "analyst", descZh: "分析员姓名", descEn: "Analyst Name" },
  { name: "analyst.email", group: "analyst", descZh: "分析员邮箱", descEn: "Analyst Email" },
  { name: "now", group: "system", descZh: "当前时间", descEn: "Current Timestamp" }
] as const;

const DEFAULT_PREVIEW_CONTEXT: Record<string, string> = {
  "ticket.id": "TK-2026-0421",
  "ticket.title": "SQL 注入攻击告警",
  "ticket.priority": "P1",
  "ticket.status": "处理中",
  "ticket.category": "入侵检测",
  "ticket.source": "SIEM",
  "ticket.risk_score": "94",
  "ticket.assignee": "Alice Wang",
  "ticket.creator": "System",
  "ticket.created_at": "2026-03-11 14:30",
  "ticket.updated_at": "2026-03-11 15:00",
  "ticket.sla_deadline": "2026-03-11 16:30",
  "ticket.url": "https://soc.example.com/tickets/TK-2026-0421",
  "customer.name": "Acme Corp",
  "customer.email": "security@acme.com",
  "analyst.name": "Alice Wang",
  "analyst.email": "alice@soc.example.com",
  now: "2026-03-11 15:30"
};

const FALLBACK_TEMPLATE_TYPES: Record<TemplateType, TemplateTypeDefinition> = {
  EMAIL: {
    template_type: "EMAIL",
    label: { zh: "Email 模板", en: "Email Template" },
    description: {
      zh: "用于邮件通知，固定字段为 subject 与 body。",
      en: "Used for email notifications with fixed subject and body fields."
    },
    fields: [
      {
        key: "subject",
        label: { zh: "邮件主题", en: "Subject" },
        description: {
          zh: "必填字段，支持 Jinja2 变量渲染。",
          en: "Required field with Jinja2 variable rendering."
        },
        field_kind: "text",
        required: true,
        supports_jinja: true,
        enum_options: []
      },
      {
        key: "body",
        label: { zh: "邮件正文", en: "Body" },
        description: {
          zh: "必填字段，支持 Jinja2 变量渲染。",
          en: "Required field with Jinja2 variable rendering."
        },
        field_kind: "textarea",
        required: true,
        supports_jinja: true,
        enum_options: []
      }
    ]
  },
  WEBHOOK: {
    template_type: "WEBHOOK",
    label: { zh: "Webhook 模板", en: "Webhook Template" },
    description: {
      zh: "用于回调外部系统，固定字段为 url、method、headers、body。",
      en: "Used for outbound callbacks with url, method, headers, and body."
    },
    fields: [
      {
        key: "url",
        label: { zh: "请求地址", en: "URL" },
        description: {
          zh: "必填字段，渲染后必须得到最终可用地址。",
          en: "Required field and must render to a usable final URL."
        },
        field_kind: "text",
        required: true,
        supports_jinja: true,
        enum_options: []
      },
      {
        key: "method",
        label: { zh: "请求方法", en: "Method" },
        description: {
          zh: "固定枚举，本次实现按常见 HTTP 方法提供。",
          en: "Fixed enum implemented with a common HTTP method set."
        },
        field_kind: "select",
        required: true,
        supports_jinja: false,
        enum_options: [...HTTP_METHODS]
      },
      {
        key: "headers",
        label: { zh: "请求头", en: "Headers" },
        description: {
          zh: "按结构化键值对维护，仅 value 参与模板渲染。",
          en: "Managed as key-value pairs with templating on the value only."
        },
        field_kind: "headers",
        required: false,
        supports_jinja: true,
        enum_options: []
      },
      {
        key: "body",
        label: { zh: "请求体", en: "Body" },
        description: {
          zh: "可选字段；method=GET 时允许保存，发送侧忽略。",
          en: "Optional field; when method=GET it can be saved and later ignored by delivery."
        },
        field_kind: "textarea",
        required: false,
        supports_jinja: true,
        enum_options: []
      }
    ]
  }
};

const FIELD_KEYS = new Set<keyof FormErrorMap>(["name", "code", "subject", "body", "url", "method", "headers"]);

function textForLanguage(language: Language, value: LocalizedText) {
  return language === "zh" ? value.zh : value.en;
}

function createHeaderRow(key = "", value = ""): EditableHeaderRow {
  return {
    id: `header-${Math.random().toString(36).slice(2, 10)}`,
    key,
    value
  };
}

function buildTypeMap(items: TemplateTypeDefinition[]) {
  return items.reduce<Record<TemplateType, TemplateTypeDefinition>>((result, item) => {
    result[item.template_type] = item;
    return result;
  }, { ...FALLBACK_TEMPLATE_TYPES });
}

function createEmptyDraft(templateType: TemplateType = "EMAIL"): TemplateEditorDraft {
  return {
    templateId: null,
    name: "",
    code: "",
    templateType,
    description: "",
    status: "DRAFT",
    fields:
      templateType === "WEBHOOK"
        ? {
            subject: "",
            body: "",
            url: "",
            method: "POST",
            headers: [createHeaderRow("Content-Type", "application/json")]
          }
        : {
            subject: "",
            body: "",
            url: "",
            method: "",
            headers: []
          }
  };
}

function buildDraftFromDetail(detail: TemplateDetailResponse): TemplateEditorDraft {
  const { template, fields } = detail;
  return {
    templateId: template.id,
    name: template.name,
    code: template.code ?? "",
    templateType: template.template_type,
    description: template.description ?? "",
    status: template.status,
    fields: {
      subject: fields.subject,
      body: fields.body,
      url: fields.url,
      method: fields.method ?? "",
      headers: fields.headers.length
        ? fields.headers.map((header) => createHeaderRow(header.key, header.value))
        : template.template_type === "WEBHOOK"
          ? [createHeaderRow("Content-Type", "application/json")]
          : []
    }
  };
}

function buildFieldsPayload(draft: TemplateEditorDraft): TemplateFieldsPayload {
  if (draft.templateType === "EMAIL") {
    return {
      subject: draft.fields.subject,
      body: draft.fields.body,
      url: "",
      method: null,
      headers: []
    };
  }

  return {
    subject: "",
    body: draft.fields.body,
    url: draft.fields.url,
    method: (draft.fields.method || null) as HttpMethod | null,
    headers: draft.fields.headers.map(({ key, value }) => ({ key, value }))
  };
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function pushFormError(map: FormErrorMap, field: keyof FormErrorMap, message: string) {
  map[field] = [...(map[field] ?? []), message];
}

function extractFormErrors(error: unknown): FormErrorMap {
  const errors: FormErrorMap = {};

  if (!(error instanceof ApiError)) {
    return errors;
  }

  const { detail } = error;

  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as Record<string, unknown>;
      const loc = Array.isArray(record.loc) ? record.loc : [];
      const message = typeof record.msg === "string" ? record.msg : null;
      const field = loc.length ? String(loc[loc.length - 1]) : null;
      if (!field || !message || !FIELD_KEYS.has(field as keyof FormErrorMap)) {
        continue;
      }
      pushFormError(errors, field as keyof FormErrorMap, message);
    }
    return errors;
  }

  if (!detail || typeof detail !== "object") {
    return errors;
  }

  const record = detail as Record<string, unknown>;
  if (!Array.isArray(record.field_errors)) {
    return errors;
  }

  for (const item of record.field_errors) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const field = String((item as Record<string, unknown>).field ?? "");
    const message = String((item as Record<string, unknown>).message ?? "");
    if (!field || !message || !FIELD_KEYS.has(field as keyof FormErrorMap)) {
      continue;
    }
    pushFormError(errors, field as keyof FormErrorMap, message);
  }

  return errors;
}

function groupPreviewErrors(errors: TemplateFieldError[]) {
  return errors.reduce<Record<string, string[]>>((result, item) => {
    result[item.field] = [...(result[item.field] ?? []), item.message];
    return result;
  }, {});
}

function nestPreviewContext(flatContext: Record<string, string>) {
  const nested: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(flatContext)) {
    const segments = path.split(".");
    const lastSegment = segments.pop();
    if (!lastSegment) {
      continue;
    }

    let current: Record<string, unknown> = nested;
    for (const segment of segments) {
      const next = current[segment];
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }
    current[lastSegment] = value;
  }

  return nested;
}

function formatTimestamp(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function TypeBadge({ type }: { type: TemplateType }) {
  if (type === "EMAIL") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-700/50 dark:bg-blue-900/30 dark:text-blue-300">
        <Mail className="h-3 w-3" />
        Email
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-700 dark:border-purple-700/50 dark:bg-purple-900/30 dark:text-purple-300">
      <Zap className="h-3 w-3" />
      Webhook
    </span>
  );
}

function StatusBadge({ status, language }: { status: TemplateStatus; language: Language }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {language === "zh" ? "启用" : "Enabled"}
      </span>
    );
  }

  if (status === "INACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-600/50 dark:bg-slate-700/50 dark:text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {language === "zh" ? "停用" : "Disabled"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {language === "zh" ? "草稿" : "Draft"}
    </span>
  );
}

function Jinja2Tag() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
      <Code className="h-2.5 w-2.5" />
      Jinja2
    </span>
  );
}

function MethodBadge({ method }: { method: HttpMethod | "" | null }) {
  if (!method) {
    return null;
  }

  const toneMap: Record<HttpMethod, string> = {
    GET: "border-green-200 bg-green-50 text-green-700 dark:border-green-700/40 dark:bg-green-900/20 dark:text-green-300",
    POST: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/40 dark:bg-blue-900/20 dark:text-blue-300",
    PUT: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700/40 dark:bg-orange-900/20 dark:text-orange-300",
    PATCH: "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-700/40 dark:bg-yellow-900/20 dark:text-yellow-300",
    DELETE: "border-red-200 bg-red-50 text-red-700 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-300"
  };

  return <span className={`inline-flex rounded border px-2 py-0.5 font-mono text-xs ${toneMap[method]}`}>{method}</span>;
}

function Breadcrumb({ crumbs }: { crumbs: string[] }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      {crumbs.map((crumb, index) => (
        <div key={`${crumb}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
          <span className={index === crumbs.length - 1 ? "text-slate-700 dark:text-slate-200" : ""}>{crumb}</span>
        </div>
      ))}
    </div>
  );
}

const textareaClass =
  "w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-700 transition-colors placeholder-slate-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-600";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 transition-colors placeholder-slate-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-600";
const inputBaseClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors placeholder-slate-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-600";
const selectClass =
  "w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  const toneClasses: Record<FeedbackTone, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300",
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300",
    info: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300"
  };

  return <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[feedback.tone]}`}>{feedback.message}</div>;
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-blue-500" />
      {message}
    </div>
  );
}

function ModulePageHeader({
  language,
  viewMode
}: {
  language: Language;
  viewMode: Exclude<ViewMode, "list">;
}) {
  const crumbs: Record<Exclude<ViewMode, "list">, string[]> = {
    detail: [language === "zh" ? "配置中心" : "Configuration", language === "zh" ? "模板渲染" : "Template Rendering", language === "zh" ? "模板详情" : "Template Detail"],
    create: [language === "zh" ? "配置中心" : "Configuration", language === "zh" ? "模板渲染" : "Template Rendering", language === "zh" ? "新建模板" : "New Template"],
    edit: [language === "zh" ? "配置中心" : "Configuration", language === "zh" ? "模板渲染" : "Template Rendering", language === "zh" ? "编辑模板" : "Edit Template"],
    preview: [language === "zh" ? "配置中心" : "Configuration", language === "zh" ? "模板渲染" : "Template Rendering", language === "zh" ? "渲染测试" : "Render Test"]
  };

  return (
    <div className="flex items-start justify-between">
      <div className="space-y-1">
        <Breadcrumb crumbs={crumbs[viewMode]} />
        <div className="flex items-center gap-3">
          <h1 className="text-slate-900 dark:text-white">{language === "zh" ? "模板渲染" : "Template Rendering"}</h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
            <Settings className="h-2.5 w-2.5" />
            {language === "zh" ? "配置中心" : "Configuration"}
          </span>
        </div>
      </div>
    </div>
  );
}

function NoPermissionView({ language }: { language: Language }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
          <Lock className="h-6 w-6 text-slate-400" />
        </div>
        <h2 className="mb-2 text-slate-800 dark:text-slate-100">{language === "zh" ? "无访问权限" : "Access Denied"}</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {language === "zh"
            ? "模板渲染模块仅对系统管理员开放。请先将当前活动角色切换为 ADMIN 后再继续。"
            : "The Template Rendering module is restricted to administrators. Switch your active role to ADMIN before continuing."}
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          <Shield className="h-3.5 w-3.5" />
          {language === "zh" ? "所需角色：系统管理员 (ADMIN)" : "Required role: Administrator (ADMIN)"}
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  description,
  error,
  children
}: {
  label: ReactNode;
  description?: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">{label}</div>
      {children}
      {description ? (
        <p className="flex items-start gap-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
          {description}
        </p>
      ) : null}
      {error && error.length ? (
        <div className="mt-2 space-y-1 text-xs leading-5 text-red-600 dark:text-red-400">
          {error.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VariableGuide({ language }: { language: Language }) {
  const [copied, setCopied] = useState<string | null>(null);

  const groups = [
    { key: "ticket", labelZh: "工单字段", labelEn: "Ticket Fields" },
    { key: "customer", labelZh: "客户信息", labelEn: "Customer Info" },
    { key: "analyst", labelZh: "分析员信息", labelEn: "Analyst Info" },
    { key: "system", labelZh: "系统变量", labelEn: "System" }
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-700/40 dark:text-slate-400">
        <Info className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
        <span>{language === "zh" ? "点击变量名即可复制 Jinja2 语法" : "Click a variable to copy its Jinja2 syntax"}</span>
      </div>

      {groups.map((group) => {
        const variables = TEMPLATE_VARIABLES.filter((item) => item.group === group.key);

        return (
          <div key={group.key}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Database className="h-3 w-3 text-slate-400" />
              <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {language === "zh" ? group.labelZh : group.labelEn}
              </span>
            </div>
            <div className="space-y-0.5">
              {variables.map((variable) => {
                const syntax = `{{ ${variable.name} }}`;
                return (
                  <button
                    key={variable.name}
                    onClick={() => {
                      navigator.clipboard.writeText(syntax).catch(() => undefined);
                      setCopied(variable.name);
                      window.setTimeout(() => setCopied(null), 1500);
                    }}
                    className="group flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60"
                    title={syntax}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {copied === variable.name ? (
                        <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3 flex-shrink-0 text-slate-300 transition-colors group-hover:text-slate-400 dark:text-slate-600 dark:group-hover:text-slate-400" />
                      )}
                      <code className="truncate text-xs text-blue-600 dark:text-blue-400">{syntax}</code>
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                        {language === "zh" ? variable.descZh : variable.descEn}
                      </span>
                    </div>
                    {copied === variable.name ? (
                      <span className="flex-shrink-0 text-[10px] text-emerald-500">
                        {language === "zh" ? "已复制" : "Copied!"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeadersEditor({
  headers,
  onChange,
  language,
  error
}: {
  headers: EditableHeaderRow[];
  onChange: (headers: EditableHeaderRow[]) => void;
  language: Language;
  error?: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {headers.length ? (
          <div className="grid grid-cols-[1fr_1fr_32px] bg-slate-50 px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
            <span>{language === "zh" ? "键名 (Key)" : "Key"}</span>
            <span>{language === "zh" ? "值 (Value)" : "Value"}</span>
            <span />
          </div>
        ) : null}
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {headers.length ? (
            headers.map((header, index) => (
              <div key={header.id} className="grid grid-cols-[1fr_1fr_32px] gap-px bg-slate-100 dark:bg-slate-700">
                <input
                  value={header.key}
                  onChange={(event) =>
                    onChange(headers.map((item) => (item.id === header.id ? { ...item, key: event.target.value } : item)))
                  }
                  placeholder={language === "zh" ? `键名 ${index + 1}` : `Key ${index + 1}`}
                  className="bg-white px-3 py-2 text-xs font-mono text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-600"
                />
                <div className="relative bg-white dark:bg-slate-800">
                  <input
                    value={header.value}
                    onChange={(event) =>
                      onChange(headers.map((item) => (item.id === header.id ? { ...item, value: event.target.value } : item)))
                    }
                    placeholder={language === "zh" ? "支持 Jinja2 变量" : "Jinja2 supported"}
                    className="w-full bg-transparent px-3 py-2 pr-8 text-xs font-mono text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:text-slate-200 dark:placeholder-slate-600"
                  />
                  {header.value.includes("{{") ? (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Jinja2Tag />
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => onChange(headers.filter((item) => item.id !== header.id))}
                  className="flex items-center justify-center bg-white text-slate-300 transition-colors hover:text-red-500 dark:bg-slate-800 dark:text-slate-600 dark:hover:text-red-400"
                  aria-label={language === "zh" ? "删除 Header" : "Delete header"}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
              {language === "zh" ? "暂无请求头，点击下方按钮添加" : "No headers. Click below to add."}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => onChange([...headers, createHeaderRow()])}
        className="flex items-center gap-1.5 text-xs text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        {language === "zh" ? "添加请求头" : "Add Header"}
      </button>
      {error && error.length ? (
        <div className="space-y-1 text-xs leading-5 text-red-600 dark:text-red-400">
          {error.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReadonlyField({
  label,
  description,
  children
}: {
  label: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">{label}</div>
      {description ? <div className="mb-3 text-[11px] leading-5 text-slate-400 dark:text-slate-500">{description}</div> : null}
      {children}
    </div>
  );
}

function ReadonlyTextBlock({ value }: { value: string }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
      {value ? value : <span className="text-slate-300 dark:text-slate-600">(empty)</span>}
    </pre>
  );
}

function ReadonlyHeadersTable({ headers, language }: { headers: TemplateHeaderPayload[]; language: Language }) {
  if (!headers.length) {
    return <div className="text-xs text-slate-400 dark:text-slate-500">(empty)</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
            <th className="px-3 py-2 text-left text-[11px] text-slate-400 dark:text-slate-500">{language === "zh" ? "键名" : "Key"}</th>
            <th className="px-3 py-2 text-left text-[11px] text-slate-400 dark:text-slate-500">{language === "zh" ? "值" : "Value"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {headers.map((header) => (
            <tr key={`${header.key}-${header.value}`}>
              <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{header.key}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{header.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldReferencePanel({
  definition,
  language,
  templateType,
  fields
}: {
  definition: TemplateTypeDefinition;
  language: Language;
  templateType: TemplateType;
  fields: TemplateFieldsPayload;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
        <h3 className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {language === "zh" ? "字段说明" : "Field Reference"}
        </h3>
      </div>
      <div className="space-y-3 px-4 py-3">
        {definition.fields.map((field) => (
          <div key={field.key} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-700/60">
            <div className="mb-1.5 flex items-center gap-1.5">
              <code className="text-[11px] text-slate-700 dark:text-slate-200">{field.key}</code>
              {field.required ? <span className="text-[10px] text-red-500">*</span> : null}
              {field.supports_jinja ? <Jinja2Tag /> : null}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {textForLanguage(language, field.description)}
            </p>
            {templateType === "WEBHOOK" && field.key === "body" && fields.method === "GET" && fields.body.trim() ? (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>{language === "zh" ? "GET 场景下该 body 会在发送侧被忽略。" : "For GET, this body is ignored by the delivery layer."}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModuleNotePanel({ language }: { language: Language }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-900/10">
      <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{language === "zh" ? "关于本模块" : "About This Module"}</p>
          <p className="leading-relaxed text-amber-600/80 dark:text-amber-400/80">
            {language === "zh"
              ? "模板渲染模块仅负责模板定义、配置与预览，不直接发送邮件或触发 Webhook 请求。"
              : "This module manages template definition and preview only. It does not send emails or trigger Webhook calls."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewValue({ value, language }: { value: string | TemplateHeaderPayload[] | null; language: Language }) {
  if (Array.isArray(value)) {
    return <ReadonlyHeadersTable headers={value} language={language} />;
  }

  if (typeof value === "string") {
    return <ReadonlyTextBlock value={value} />;
  }

  return <div className="text-xs text-slate-400 dark:text-slate-500">-</div>;
}

function TemplateListView({
  language,
  search,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  templates,
  totalCount,
  loading,
  error,
  pendingStatusTemplateId,
  onCreate,
  onView,
  onEdit,
  onPreview,
  onToggleStatus
}: {
  language: Language;
  search: string;
  onSearchChange: (value: string) => void;
  filterType: FilterType;
  onFilterTypeChange: (value: FilterType) => void;
  filterStatus: FilterStatus;
  onFilterStatusChange: (value: FilterStatus) => void;
  templates: TemplateSummary[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  pendingStatusTemplateId: string | null;
  onCreate: () => void;
  onView: (templateId: string) => void;
  onEdit: (templateId: string) => void;
  onPreview: (templateId: string) => void;
  onToggleStatus: (template: TemplateSummary) => void;
}) {
  const statusOptions: Array<{ value: FilterStatus; label: string }> = [
    { value: "all", label: language === "zh" ? "全部状态" : "All Status" },
    { value: "DRAFT", label: language === "zh" ? "草稿" : "Draft" },
    { value: "ACTIVE", label: language === "zh" ? "启用" : "Enabled" },
    { value: "INACTIVE", label: language === "zh" ? "停用" : "Disabled" }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Breadcrumb crumbs={[language === "zh" ? "配置中心" : "Configuration", language === "zh" ? "模板渲染" : "Template Rendering"]} />
          <div className="flex items-center gap-3">
            <h1 className="text-slate-900 dark:text-white">{language === "zh" ? "模板渲染" : "Template Rendering"}</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400">
              <FileCode className="h-2.5 w-2.5" />
              {language === "zh" ? "配置中心" : "Configuration"}
            </span>
          </div>
          <p className="max-w-xl text-xs text-slate-500 dark:text-slate-400">
            {language === "zh"
              ? "管理 Email 与 Webhook 通知模板，支持 Jinja2 渲染语法，基于工单上下文进行模板预览与渲染测试。"
              : "Manage Email and Webhook notification templates. Supports Jinja2 rendering with ticket-context preview and testing."}
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            {language === "zh" ? `共 ${totalCount} 条` : `${totalCount} items`}
          </div>
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {language === "zh" ? "新建模板" : "New Template"}
          </button>
        </div>
      </div>

      {error ? <FeedbackBanner feedback={{ tone: "error", message: error }} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {(["all", "EMAIL", "WEBHOOK"] as FilterType[]).map((value) => (
            <button
              key={value}
              onClick={() => onFilterTypeChange(value)}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                filterType === value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {value === "all" ? (language === "zh" ? "全部类型" : "All Types") : value}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onFilterStatusChange(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                filterStatus === option.value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={language === "zh" ? "搜索模板名称 / 编码…" : "Search name / code…"}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                {[
                  language === "zh" ? "模板名称" : "Name",
                  language === "zh" ? "模板编码" : "Code",
                  language === "zh" ? "类型" : "Type",
                  language === "zh" ? "状态" : "Status",
                  language === "zh" ? "描述" : "Description",
                  language === "zh" ? "最近更新" : "Last Updated",
                  language === "zh" ? "更新人" : "Updated By",
                  language === "zh" ? "操作" : "Actions"
                ].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-3 text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                      {language === "zh" ? "正在加载模板列表…" : "Loading templates…"}
                    </div>
                  </td>
                </tr>
              ) : templates.length ? (
                templates.map((template) => (
                  <tr key={template.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onView(template.id)}
                        className="text-left text-sm font-semibold text-slate-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                      >
                        {template.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{template.code ?? "-"}</td>
                    <td className="px-4 py-3">
                      <TypeBadge type={template.template_type} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={template.status} language={language} />
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{template.description ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatTimestamp(template.updated_at, language)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{template.updated_by_user_id ?? template.created_by_user_id ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => onView(template.id)}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {language === "zh" ? "查看" : "View"}
                        </button>
                        <button
                          onClick={() => onEdit(template.id)}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          {language === "zh" ? "编辑" : "Edit"}
                        </button>
                        <button
                          onClick={() => onPreview(template.id)}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {language === "zh" ? "预览" : "Preview"}
                        </button>
                        <button
                          onClick={() => onToggleStatus(template)}
                          disabled={pendingStatusTemplateId === template.id}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 transition-colors hover:text-blue-700 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {pendingStatusTemplateId === template.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                          {template.status === "ACTIVE"
                            ? language === "zh"
                              ? "停用"
                              : "Disable"
                            : language === "zh"
                              ? "启用"
                              : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <FileCode className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                      <span className="text-xs">
                        {language === "zh" ? "没有符合条件的模板。" : "No templates match your filters."}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TemplateDetailView({
  language,
  detail,
  loading,
  error,
  feedback,
  pendingStatus,
  onBack,
  onEdit,
  onPreview,
  onToggleStatus
}: {
  language: Language;
  detail: TemplateDetailResponse | null;
  loading: boolean;
  error: string | null;
  feedback: FeedbackState | null;
  pendingStatus: boolean;
  onBack: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onToggleStatus: () => void;
}) {
  if (loading) {
    return <LoadingPanel message={language === "zh" ? "正在加载模板详情…" : "Loading template detail…"} />;
  }

  if (error) {
    return <FeedbackBanner feedback={{ tone: "error", message: error }} />;
  }

  if (!detail) {
    return <FeedbackBanner feedback={{ tone: "info", message: language === "zh" ? "未找到模板详情。" : "Template detail is unavailable." }} />;
  }

  const { template, fields, field_definition } = detail;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {language === "zh" ? "返回列表" : "Back to List"}
          </button>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm text-slate-700 dark:text-slate-200">{template.name}</h3>
              <TypeBadge type={template.template_type} />
              <StatusBadge status={template.status} language={language} />
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {template.description ?? (language === "zh" ? "暂无模板描述。" : "No description provided.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <button
              onClick={onPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
            >
              <Play className="h-3.5 w-3.5" />
              {language === "zh" ? "渲染测试" : "Render Test"}
            </button>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Edit className="h-3.5 w-3.5" />
              {language === "zh" ? "编辑模板" : "Edit Template"}
            </button>
            <button
              onClick={onToggleStatus}
              disabled={pendingStatus}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {pendingStatus ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : template.status === "ACTIVE" ? (
                <ToggleRight className="h-3.5 w-3.5" />
              ) : (
                <ToggleLeft className="h-3.5 w-3.5" />
              )}
              {template.status === "ACTIVE"
                ? language === "zh"
                  ? "停用模板"
                  : "Disable Template"
                : language === "zh"
                  ? "启用模板"
                  : "Enable Template"}
            </button>
          </div>
        </div>
      </div>

      {feedback ? <FeedbackBanner feedback={feedback} /> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-2">
              <FileCode className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {language === "zh" ? "模板基础信息" : "Template Overview"}
              </h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ReadonlyField label={language === "zh" ? "模板名称" : "Template Name"}>
                <ReadonlyTextBlock value={template.name} />
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "模板编码" : "Template Code"}>
                <ReadonlyTextBlock value={template.code ?? ""} />
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "模板类型" : "Template Type"}>
                <div>
                  <TypeBadge type={template.template_type} />
                </div>
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "模板状态" : "Status"}>
                <div>
                  <StatusBadge status={template.status} language={language} />
                </div>
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "创建时间" : "Created At"}>
                <ReadonlyTextBlock value={formatTimestamp(template.created_at, language)} />
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "最近更新" : "Updated At"}>
                <ReadonlyTextBlock value={formatTimestamp(template.updated_at, language)} />
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "创建人" : "Created By"}>
                <ReadonlyTextBlock value={template.created_by_user_id ?? ""} />
              </ReadonlyField>
              <ReadonlyField label={language === "zh" ? "更新人" : "Updated By"}>
                <ReadonlyTextBlock value={template.updated_by_user_id ?? ""} />
              </ReadonlyField>
              <div className="md:col-span-2">
                <ReadonlyField label={language === "zh" ? "模板描述" : "Description"}>
                  <ReadonlyTextBlock value={template.description ?? ""} />
                </ReadonlyField>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {language === "zh" ? "模板字段内容" : "Template Content"}
              </h3>
            </div>
            <div className="space-y-4">
              {template.template_type === "EMAIL" ? (
                <>
                  <ReadonlyField
                    label={
                      <>
                        <span>{language === "zh" ? "邮件主题" : "Subject"}</span>
                        <Jinja2Tag />
                      </>
                    }
                  >
                    <ReadonlyTextBlock value={fields.subject} />
                  </ReadonlyField>
                  <ReadonlyField
                    label={
                      <>
                        <span>{language === "zh" ? "邮件正文" : "Body"}</span>
                        <Jinja2Tag />
                      </>
                    }
                  >
                    <ReadonlyTextBlock value={fields.body} />
                  </ReadonlyField>
                </>
              ) : (
                <>
                  <ReadonlyField
                    label={
                      <>
                        <span>URL</span>
                        <Jinja2Tag />
                      </>
                    }
                  >
                    <ReadonlyTextBlock value={fields.url} />
                  </ReadonlyField>
                  <ReadonlyField label="Method">
                    <div>
                      <MethodBadge method={fields.method} />
                    </div>
                  </ReadonlyField>
                  <ReadonlyField
                    label={
                      <>
                        <span>{language === "zh" ? "请求头" : "Headers"}</span>
                        <Jinja2Tag />
                      </>
                    }
                  >
                    <ReadonlyHeadersTable headers={fields.headers} language={language} />
                  </ReadonlyField>
                  <ReadonlyField
                    label={
                      <>
                        <span>{language === "zh" ? "请求体" : "Body"}</span>
                        <Jinja2Tag />
                      </>
                    }
                  >
                    <ReadonlyTextBlock value={fields.body} />
                  </ReadonlyField>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="sticky top-20 space-y-4">
          <FieldReferencePanel definition={field_definition} language={language} templateType={template.template_type} fields={fields} />
          <ModuleNotePanel language={language} />
        </div>
      </div>
    </div>
  );
}

function TemplateEditorView({
  language,
  mode,
  draft,
  typeDefinitions,
  formErrors,
  feedback,
  saving,
  onBack,
  onTypeChange,
  onDraftChange,
  onSave
}: {
  language: Language;
  mode: "create" | "edit";
  draft: TemplateEditorDraft | null;
  typeDefinitions: Record<TemplateType, TemplateTypeDefinition>;
  formErrors: FormErrorMap;
  feedback: FeedbackState | null;
  saving: boolean;
  onBack: () => void;
  onTypeChange: (value: TemplateType) => void;
  onDraftChange: (draft: TemplateEditorDraft) => void;
  onSave: () => void;
}) {
  if (!draft) {
    return <LoadingPanel message={language === "zh" ? "正在准备表单…" : "Preparing editor…"} />;
  }

  const definition = typeDefinitions[draft.templateType] ?? FALLBACK_TEMPLATE_TYPES[draft.templateType];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {mode === "create"
              ? language === "zh"
                ? "返回列表"
                : "Back to List"
              : language === "zh"
                ? "返回详情"
                : "Back to Detail"}
          </button>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm text-slate-700 dark:text-slate-200">
                {mode === "create" ? (language === "zh" ? "新建模板" : "New Template") : language === "zh" ? "编辑模板" : "Edit Template"}
              </h3>
              <TypeBadge type={draft.templateType} />
              <StatusBadge status={draft.status} language={language} />
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {language === "zh"
                ? "按 Figma 的配置详情流编辑模板基础信息和字段内容。保存后返回模板详情页。"
                : "Edit template metadata and fields following the Figma configuration detail flow. Saving returns to the detail view."}
            </p>
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {language === "zh" ? "保存模板" : "Save Template"}
          </button>
        </div>
      </div>

      {feedback ? <FeedbackBanner feedback={feedback} /> : null}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {language === "zh" ? "模板基础信息" : "Template Basics"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {language === "zh"
                    ? "模板名称、编码、类型和描述位于同一层，字段区随模板类型自动刷新。"
                    : "Name, code, type, and description live at the same level. The field section refreshes with the selected type."}
                </p>
              </div>
              <StatusBadge status={draft.status} language={language} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label={language === "zh" ? "模板名称" : "Template Name"}
                description={language === "zh" ? "用于管理与查找。" : "Used for management and lookup."}
                error={formErrors.name}
              >
                <input
                  value={draft.name}
                  onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                  className={inputBaseClass}
                  placeholder={language === "zh" ? "例如：工单升级邮件" : "Ex: Ticket Escalation Email"}
                />
              </FormField>
              <FormField
                label={language === "zh" ? "模板编码" : "Template Code"}
                description={
                  language === "zh"
                    ? "建议填写，便于上游业务模块按编码引用。"
                    : "Recommended for upstream business modules to reference by code."
                }
                error={formErrors.code}
              >
                <input
                  value={draft.code}
                  onChange={(event) => onDraftChange({ ...draft, code: event.target.value })}
                  className={inputBaseClass}
                  placeholder="ticket_escalation_email"
                />
              </FormField>
              <FormField
                label={language === "zh" ? "模板类型" : "Template Type"}
                description={language === "zh" ? "切换后字段区自动刷新。" : "Switching type auto-refreshes the field section."}
              >
                <select
                  value={draft.templateType}
                  onChange={(event) => onTypeChange(event.target.value as TemplateType)}
                  className={selectClass}
                >
                  {(["EMAIL", "WEBHOOK"] as TemplateType[]).map((type) => (
                    <option key={type} value={type}>
                      {textForLanguage(language, (typeDefinitions[type] ?? FALLBACK_TEMPLATE_TYPES[type]).label)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label={language === "zh" ? "模板状态" : "Status"}
                description={language === "zh" ? "新建模板默认保存为草稿。" : "New templates are saved as draft by default."}
              >
                <div>
                  <StatusBadge status={draft.status} language={language} />
                </div>
              </FormField>
              <div className="md:col-span-2">
                <FormField
                  label={language === "zh" ? "模板描述" : "Description"}
                  description={
                    language === "zh"
                      ? "补充该模板面向的业务场景与发送链路。"
                      : "Describe the business scenario and delivery chain for this template."
                  }
                >
                  <textarea
                    value={draft.description}
                    onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                    className={`${inputBaseClass} min-h-28 resize-y`}
                    placeholder={
                      language === "zh"
                        ? "例如：在工单升级或闭环时供通知模块调用。"
                        : "Ex: Used by the notification module during escalation or closure."
                    }
                  />
                </FormField>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {language === "zh" ? "字段编辑区" : "Field Editor"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {language === "zh"
                    ? "该区域完全由模板类型驱动生成，用户不能手动新增或删除系统字段。"
                    : "This section is entirely driven by the selected template type. Users cannot add or remove system fields."}
                </p>
              </div>
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                {definition.fields.length} {language === "zh" ? "个字段" : "fields"}
              </span>
            </div>

            <div className="grid gap-4">
              {definition.fields.map((field) => {
                const label = textForLanguage(language, field.label);
                const description = textForLanguage(language, field.description);

                if (field.field_kind === "headers") {
                  return (
                    <FormField
                      key={field.key}
                      label={
                        <>
                          <span>{label}</span>
                          {field.supports_jinja ? <Jinja2Tag /> : null}
                        </>
                      }
                      description={description}
                    >
                      <HeadersEditor
                        headers={draft.fields.headers}
                        onChange={(headers) => onDraftChange({ ...draft, fields: { ...draft.fields, headers } })}
                        language={language}
                        error={formErrors.headers}
                      />
                    </FormField>
                  );
                }

                if (field.field_kind === "select") {
                  return (
                    <FormField key={field.key} label={label} description={description} error={formErrors.method}>
                      <select
                        value={draft.fields.method}
                        onChange={(event) =>
                          onDraftChange({
                            ...draft,
                            fields: { ...draft.fields, method: event.target.value as HttpMethod }
                          })
                        }
                        className={selectClass}
                      >
                        {field.enum_options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  );
                }

                if (field.key === "subject") {
                  return (
                    <FormField
                      key={field.key}
                      label={
                        <>
                          <span>{label}</span>
                          {field.required ? <span className="text-red-500">*</span> : null}
                          {field.supports_jinja ? <Jinja2Tag /> : null}
                        </>
                      }
                      description={description}
                      error={formErrors.subject}
                    >
                      <input
                        value={draft.fields.subject}
                        onChange={(event) => onDraftChange({ ...draft, fields: { ...draft.fields, subject: event.target.value } })}
                        className={inputClass}
                        placeholder={language === "zh" ? "[{{ ticket.priority }}] 工单 {{ ticket.id }} 已升级" : "[{{ ticket.priority }}] Ticket {{ ticket.id }} escalated"}
                      />
                    </FormField>
                  );
                }

                if (field.key === "url") {
                  return (
                    <FormField
                      key={field.key}
                      label={
                        <>
                          <span>{label}</span>
                          {field.required ? <span className="text-red-500">*</span> : null}
                          {field.supports_jinja ? <Jinja2Tag /> : null}
                        </>
                      }
                      description={description}
                      error={formErrors.url}
                    >
                      <input
                        value={draft.fields.url}
                        onChange={(event) => onDraftChange({ ...draft, fields: { ...draft.fields, url: event.target.value } })}
                        className={inputClass}
                        placeholder="https://hooks.partner.local/cases/{{ ticket.id }}"
                      />
                    </FormField>
                  );
                }

                return (
                  <FormField
                    key={field.key}
                    label={
                      <>
                        <span>{label}</span>
                        {field.required ? <span className="text-red-500">*</span> : null}
                        {field.supports_jinja ? <Jinja2Tag /> : null}
                      </>
                    }
                    description={description}
                    error={formErrors.body}
                  >
                    <textarea
                      value={draft.fields.body}
                      onChange={(event) => onDraftChange({ ...draft, fields: { ...draft.fields, body: event.target.value } })}
                      className={`${textareaClass} min-h-40`}
                      placeholder={
                        draft.templateType === "EMAIL"
                          ? language === "zh"
                            ? "工单标题：{{ ticket.title }}\n当前处理人：{{ ticket.assignee }}"
                            : "Title: {{ ticket.title }}\nAssignee: {{ ticket.assignee }}"
                          : '{\n  "ticket_id": "{{ ticket.id }}",\n  "status": "{{ ticket.status }}"\n}'
                      }
                    />
                  </FormField>
                );
              })}
            </div>

            {draft.templateType === "WEBHOOK" && draft.fields.method === "GET" && draft.fields.body.trim() ? (
              <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-300">
                <AlertTriangle className="mt-1 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {language === "zh"
                    ? "当前模板满足 GET + body 边界规则：允许保存，预览仍会渲染 body，但真实发送链路应忽略该 body。"
                    : "This template follows the GET + body edge rule: saving is allowed, preview still renders body, and the delivery layer should ignore that body."}
                </span>
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
              {language === "zh" ? "变量说明" : "Variable Guide"}
            </h3>
            <VariableGuide language={language} />
          </section>
          <ModuleNotePanel language={language} />
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewView({
  language,
  detail,
  previewContext,
  previewResult,
  loading,
  feedback,
  onBack,
  onContextChange,
  onResetContext,
  onRunPreview
}: {
  language: Language;
  detail: TemplateDetailResponse | null;
  previewContext: Record<string, string>;
  previewResult: TemplatePreviewResponse | null;
  loading: boolean;
  feedback: FeedbackState | null;
  onBack: () => void;
  onContextChange: (key: string, value: string) => void;
  onResetContext: () => void;
  onRunPreview: () => void;
}) {
  if (!detail) {
    return <LoadingPanel message={language === "zh" ? "正在加载预览所需数据…" : "Loading preview data…"} />;
  }

  const previewErrors = previewResult ? groupPreviewErrors(previewResult.field_errors) : {};
  const fieldsToRender = detail.field_definition.fields;
  const successCount = previewResult
    ? fieldsToRender.filter((field) => !(previewErrors[field.key] ?? []).length).length
    : 0;
  const errorCount = previewResult
    ? fieldsToRender.filter((field) => (previewErrors[field.key] ?? []).length).length
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {language === "zh" ? "返回详情" : "Back to Detail"}
          </button>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm text-slate-700 dark:text-slate-200">
              {language === "zh" ? `渲染测试 — ${detail.template.name}` : `Render Test — ${detail.template.name}`}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {language === "zh"
                ? "基于测试上下文调用真实后端预览接口，不会触发真实发送。"
                : "Calls the real backend preview API with editable context and does not trigger delivery."}
            </p>
          </div>
          <TypeBadge type={detail.template.template_type} />
          <StatusBadge status={detail.template.status} language={language} />
          <button
            onClick={onRunPreview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-blue-700 disabled:opacity-70"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {language === "zh" ? "执行渲染" : "Run Preview"}
          </button>
        </div>
      </div>

      {feedback ? <FeedbackBanner feedback={feedback} /> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
            <FileCode className="h-3.5 w-3.5 text-slate-400" />
            <h3 className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {language === "zh" ? "模板原始内容" : "Template Source"}
            </h3>
          </div>
          <div className="space-y-4 px-4 py-4">
            {detail.template.template_type === "EMAIL" ? (
              <>
                <ReadonlyField
                  label={
                    <>
                      <span>Subject</span>
                      <Jinja2Tag />
                    </>
                  }
                >
                  <ReadonlyTextBlock value={detail.fields.subject} />
                </ReadonlyField>
                <ReadonlyField
                  label={
                    <>
                      <span>Body</span>
                      <Jinja2Tag />
                    </>
                  }
                >
                  <ReadonlyTextBlock value={detail.fields.body} />
                </ReadonlyField>
              </>
            ) : (
              <>
                <ReadonlyField
                  label={
                    <>
                      <span>URL</span>
                      <Jinja2Tag />
                    </>
                  }
                >
                  <ReadonlyTextBlock value={detail.fields.url} />
                </ReadonlyField>
                <ReadonlyField label="Method">
                  <div>
                    <MethodBadge method={detail.fields.method} />
                  </div>
                </ReadonlyField>
                <ReadonlyField
                  label={
                    <>
                      <span>Headers</span>
                      <Jinja2Tag />
                    </>
                  }
                >
                  <ReadonlyHeadersTable headers={detail.fields.headers} language={language} />
                </ReadonlyField>
                <ReadonlyField
                  label={
                    <>
                      <span>Body</span>
                      <Jinja2Tag />
                    </>
                  }
                >
                  <ReadonlyTextBlock value={detail.fields.body} />
                </ReadonlyField>
              </>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
            <Database className="h-3.5 w-3.5 text-slate-400" />
            <h3 className="flex-1 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {language === "zh" ? "测试上下文" : "Test Context"}
            </h3>
            <button
              onClick={onResetContext}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            >
              <RefreshCw className="h-3 w-3" />
              {language === "zh" ? "重置" : "Reset"}
            </button>
          </div>
          <div className="flex items-start gap-2 border-b border-slate-100 bg-blue-50/40 px-4 py-3 text-[11px] text-slate-400 dark:border-slate-700/60 dark:bg-blue-900/10 dark:text-slate-500">
            <Info className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-500" />
            <span>{language === "zh" ? "以下为扁平变量编辑态，提交预览前会自动转换为后端要求的嵌套 context 对象。" : "These flat variable entries are converted to the nested context object expected by the backend preview API."}</span>
          </div>
          <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
            {Object.entries(previewContext).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[140px_1fr] gap-px bg-slate-100 dark:bg-slate-700">
                <div className="flex items-center bg-slate-50 px-3 py-2 dark:bg-slate-800/80">
                  <code className="text-[10px] text-slate-500 dark:text-slate-400">{key}</code>
                </div>
                <input
                  value={value}
                  onChange={(event) => onContextChange(key, event.target.value)}
                  className="bg-white px-3 py-2 text-[11px] font-mono text-slate-600 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
            <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
            <h3 className="flex-1 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {language === "zh" ? "结构化预览结果" : "Structured Result"}
            </h3>
            {previewResult ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{successCount} ✓</span>
                <span className="text-[11px] text-red-600 dark:text-red-400">{errorCount} ✗</span>
              </div>
            ) : null}
          </div>

          {!previewResult && !loading ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <Play className="mb-3 h-8 w-8 text-slate-200 dark:text-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {language === "zh" ? "填写测试上下文后，点击“执行渲染”查看后端预览结果。" : "Edit the test context, then run preview to inspect the backend-rendered result."}
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="mb-2 h-6 w-6 animate-spin text-blue-500" />
              <p className="text-xs text-slate-400 dark:text-slate-500">{language === "zh" ? "渲染中…" : "Rendering…"}</p>
            </div>
          ) : null}

          {previewResult ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {fieldsToRender.map((field) => {
                const fieldErrors = previewErrors[field.key] ?? [];
                const renderedValue =
                  field.key === "headers"
                    ? previewResult.rendered.headers
                    : field.key === "method"
                      ? previewResult.rendered.method
                      : previewResult.rendered[field.key];

                return (
                  <div key={field.key} className="space-y-2 px-4 py-3.5">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
                      {fieldErrors.length ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <span className={fieldErrors.length ? "text-xs text-amber-700 dark:text-amber-300" : "text-xs text-emerald-700 dark:text-emerald-300"}>
                        {textForLanguage(language, field.label)}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-slate-400 dark:text-slate-500">{field.key}</span>
                    </div>
                    {field.key === "method" ? (
                      <div className="px-1">
                        <MethodBadge method={renderedValue as HttpMethod | "" | null} />
                      </div>
                    ) : (
                      <PreviewValue value={renderedValue as string | TemplateHeaderPayload[] | null} language={language} />
                    )}
                    {fieldErrors.length ? (
                      <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
                        {fieldErrors.map((message) => (
                          <div key={message}>{message}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function TemplateRenderingPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [typeDefinitions, setTypeDefinitions] = useState<Record<TemplateType, TemplateTypeDefinition>>({
    ...FALLBACK_TEMPLATE_TYPES
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<TemplateDetailResponse | null>(null);
  const [draft, setDraft] = useState<TemplateEditorDraft | null>(null);
  const [previewContext, setPreviewContext] = useState<Record<string, string>>({ ...DEFAULT_PREVIEW_CONTEXT });
  const [previewResult, setPreviewResult] = useState<TemplatePreviewResponse | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pendingStatusTemplateId, setPendingStatusTemplateId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrorMap>({});

  const isAdmin = user?.active_role === "ADMIN";

  const loadTemplateList = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const response = await listTemplates({
        templateType: filterType,
        status: filterStatus,
        search: deferredSearch
      });
      setTemplates(response.items);
      setTotalCount(response.total_count);
    } catch (error) {
      setListError(extractErrorMessage(error, language === "zh" ? "加载模板列表失败。" : "Failed to load templates."));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let ignore = false;

    const run = async () => {
      try {
        const response = await listTemplateTypes();
        if (!ignore) {
          setTypeDefinitions(buildTypeMap(response.items));
        }
      } catch {
        if (!ignore) {
          setTypeDefinitions({ ...FALLBACK_TEMPLATE_TYPES });
        }
      }
    };

    void run();

    return () => {
      ignore = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let active = true;
    setListLoading(true);
    setListError(null);

    listTemplates({
      templateType: filterType,
      status: filterStatus,
      search: deferredSearch
    })
      .then((response) => {
        if (!active) {
          return;
        }
        setTemplates(response.items);
        setTotalCount(response.total_count);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setListError(extractErrorMessage(error, language === "zh" ? "加载模板列表失败。" : "Failed to load templates."));
      })
      .finally(() => {
        if (active) {
          setListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [deferredSearch, filterStatus, filterType, isAdmin, language]);

  const resolveTemplateDetail = async (templateId: string) => {
    if (selectedDetail?.template.id === templateId) {
      return selectedDetail;
    }

    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await getTemplateDetail(templateId);
      setSelectedTemplateId(templateId);
      setSelectedDetail(detail);
      return detail;
    } catch (error) {
      const message = extractErrorMessage(error, language === "zh" ? "加载模板详情失败。" : "Failed to load template detail.");
      setDetailError(message);
      throw error;
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (templateId: string) => {
    setFeedback(null);
    setPreviewResult(null);
    setFormErrors({});
    try {
      await resolveTemplateDetail(templateId);
      setViewMode("detail");
    } catch {}
  };

  const openEdit = async (templateId: string) => {
    setFeedback(null);
    setFormErrors({});
    try {
      const detail = await resolveTemplateDetail(templateId);
      setDraft(buildDraftFromDetail(detail));
      setViewMode("edit");
    } catch {}
  };

  const openPreview = async (templateId: string) => {
    setFeedback(null);
    try {
      await resolveTemplateDetail(templateId);
      setPreviewContext({ ...DEFAULT_PREVIEW_CONTEXT });
      setPreviewResult(null);
      setViewMode("preview");
    } catch {}
  };

  const openCreate = () => {
    setFeedback(null);
    setFormErrors({});
    setPreviewResult(null);
    setSelectedTemplateId(null);
    setDraft(createEmptyDraft());
    setViewMode("create");
  };

  const handleBack = () => {
    setFeedback(null);

    if (viewMode === "detail") {
      setViewMode("list");
      return;
    }

    if (viewMode === "preview") {
      setViewMode("detail");
      return;
    }

    if (viewMode === "edit") {
      setViewMode("detail");
      return;
    }

    setViewMode("list");
  };

  const handleTypeChange = (nextType: TemplateType) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      if (nextType === current.templateType) {
        return current;
      }

      if (nextType === "EMAIL") {
        return {
          ...current,
          templateType: nextType,
          fields: {
            subject: current.fields.subject,
            body: current.fields.body,
            url: "",
            method: "",
            headers: []
          }
        };
      }

      return {
        ...current,
        templateType: nextType,
        fields: {
          subject: "",
          body: current.fields.body,
          url: current.fields.url,
          method: current.fields.method || "POST",
          headers: current.fields.headers.length ? current.fields.headers : [createHeaderRow("Content-Type", "application/json")]
        }
      };
    });
    setFormErrors({});
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    setSaveLoading(true);
    setFeedback(null);
    setFormErrors({});

    try {
      const payload = {
        name: draft.name,
        code: draft.code.trim() || null,
        template_type: draft.templateType,
        description: draft.description.trim() || null,
        fields: buildFieldsPayload(draft)
      };

      const detail = draft.templateId
        ? await updateTemplate(draft.templateId, {
            name: payload.name,
            code: payload.code,
            description: payload.description,
            fields: payload.fields
          })
        : await createTemplate(payload);

      setSelectedTemplateId(detail.template.id);
      setSelectedDetail(detail);
      setDraft(buildDraftFromDetail(detail));
      setFeedback({
        tone: "success",
        message:
          language === "zh"
            ? draft.templateId
              ? "模板已更新。"
              : "模板已创建并保存为草稿。"
            : draft.templateId
              ? "Template updated."
              : "Template created as draft."
      });
      setViewMode("detail");
      await loadTemplateList();
    } catch (error) {
      setFormErrors(extractFormErrors(error));
      setFeedback({
        tone: "error",
        message: extractErrorMessage(error, language === "zh" ? "保存模板失败。" : "Failed to save template.")
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleStatus = async (template: TemplateSummary) => {
    const nextStatus: TemplateStatus = template.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setPendingStatusTemplateId(template.id);
    setFeedback(null);

    try {
      const detail = await updateTemplateStatus(template.id, nextStatus);
      setSelectedTemplateId(detail.template.id);
      if (selectedDetail?.template.id === detail.template.id) {
        setSelectedDetail(detail);
      }
      setFeedback({
        tone: "success",
        message:
          language === "zh"
            ? nextStatus === "ACTIVE"
              ? "模板已启用。"
              : "模板已停用。"
            : nextStatus === "ACTIVE"
              ? "Template enabled."
              : "Template disabled."
      });
      await loadTemplateList();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: extractErrorMessage(error, language === "zh" ? "更新模板状态失败。" : "Failed to update template status.")
      });
    } finally {
      setPendingStatusTemplateId(null);
    }
  };

  const handleRunPreview = async () => {
    if (!selectedDetail) {
      return;
    }

    setPreviewLoading(true);
    setFeedback(null);

    try {
      const response = await previewTemplate({
        template_type: selectedDetail.template.template_type,
        fields: selectedDetail.fields,
        context: nestPreviewContext(previewContext)
      });
      setPreviewResult(response);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: extractErrorMessage(error, language === "zh" ? "执行预览失败。" : "Failed to run preview.")
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <NoPermissionView language={language} />
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-4 p-6">
      {viewMode !== "list" ? <ModulePageHeader language={language} viewMode={viewMode} /> : null}

      {viewMode === "list" ? (
        <TemplateListView
          language={language}
          search={searchText}
          onSearchChange={setSearchText}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          templates={templates}
          totalCount={totalCount}
          loading={listLoading}
          error={listError}
          pendingStatusTemplateId={pendingStatusTemplateId}
          onCreate={openCreate}
          onView={(templateId) => {
            void openDetail(templateId);
          }}
          onEdit={(templateId) => {
            void openEdit(templateId);
          }}
          onPreview={(templateId) => {
            void openPreview(templateId);
          }}
          onToggleStatus={(template) => {
            void handleToggleStatus(template);
          }}
        />
      ) : null}

      {viewMode === "detail" ? (
        <TemplateDetailView
          language={language}
          detail={selectedDetail}
          loading={detailLoading}
          error={detailError}
          feedback={feedback}
          pendingStatus={pendingStatusTemplateId === selectedTemplateId}
          onBack={handleBack}
          onEdit={() => {
            if (selectedTemplateId) {
              void openEdit(selectedTemplateId);
            }
          }}
          onPreview={() => {
            if (selectedTemplateId) {
              void openPreview(selectedTemplateId);
            }
          }}
          onToggleStatus={() => {
            if (selectedDetail) {
              void handleToggleStatus(selectedDetail.template);
            }
          }}
        />
      ) : null}

      {viewMode === "create" || viewMode === "edit" ? (
        <TemplateEditorView
          language={language}
          mode={viewMode}
          draft={draft}
          typeDefinitions={typeDefinitions}
          formErrors={formErrors}
          feedback={feedback}
          saving={saveLoading}
          onBack={handleBack}
          onTypeChange={handleTypeChange}
          onDraftChange={setDraft}
          onSave={() => {
            void handleSave();
          }}
        />
      ) : null}

      {viewMode === "preview" ? (
        <TemplatePreviewView
          language={language}
          detail={selectedDetail}
          previewContext={previewContext}
          previewResult={previewResult}
          loading={previewLoading}
          feedback={feedback}
          onBack={handleBack}
          onContextChange={(key, value) => {
            setPreviewContext((current) => ({ ...current, [key]: value }));
          }}
          onResetContext={() => setPreviewContext({ ...DEFAULT_PREVIEW_CONTEXT })}
          onRunPreview={() => {
            void handleRunPreview();
          }}
        />
      ) : null}
    </div>
  );
}
