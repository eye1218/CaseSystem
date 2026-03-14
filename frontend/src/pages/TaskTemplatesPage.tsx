import {
  FileCode2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Webhook,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { listMailSenders } from "../api/mailSenders";
import { listTemplates } from "../api/templates";
import {
  createTaskTemplate,
  listTaskTemplates,
  updateTaskTemplate,
  updateTaskTemplateStatus,
} from "../api/tasks";
import {
  getRecipientSourceLabel,
  getTaskTemplateStatusLabel,
  getTaskTemplateStatusPalette,
  getTaskTypeLabel,
  recipientSourceOptions,
  taskTemplateStatusOptions,
  taskTypeOptions,
} from "../constants/tasks";
import { useLanguage } from "../contexts/LanguageContext";
import type { MailSenderSummary } from "../types/mailSender";
import type { TemplateSummary } from "../types/template";
import type {
  RecipientSourceType,
  TaskRecipientConfig,
  TaskRecipientRule,
  TaskTemplateStatus,
  TaskTemplateSummary,
} from "../types/task";
import { createClientId } from "../utils/clientId";
import { formatApiDateTime } from "../utils/datetime";

type RecipientBucket = "to" | "cc" | "bcc";

interface RecipientRuleDraft extends TaskRecipientRule {
  clientId: string;
}

interface TaskTemplateFormState {
  name: string;
  task_type: "EMAIL" | "WEBHOOK";
  reference_template_id: string;
  sender_config_id: string;
  status: TaskTemplateStatus;
  description: string;
  recipient_config: {
    to: RecipientRuleDraft[];
    cc: RecipientRuleDraft[];
    bcc: RecipientRuleDraft[];
  };
}

function createRecipientRule(
  sourceType: RecipientSourceType = "CUSTOM_EMAIL",
  value = "",
): RecipientRuleDraft {
  return {
    clientId: createClientId("recipient"),
    source_type: sourceType,
    value,
  };
}

function defaultFormState(): TaskTemplateFormState {
  return {
    name: "",
    task_type: "EMAIL",
    reference_template_id: "",
    sender_config_id: "",
    status: "ACTIVE",
    description: "",
    recipient_config: {
      to: [createRecipientRule("CUSTOM_EMAIL")],
      cc: [],
      bcc: [],
    },
  };
}

function toDraftRules(rows: TaskRecipientRule[]) {
  return rows.map((row) => createRecipientRule(row.source_type, row.value ?? ""));
}

function fromTaskTemplate(item: TaskTemplateSummary): TaskTemplateFormState {
  return {
    name: item.name,
    task_type: item.task_type === "WEBHOOK" ? "WEBHOOK" : "EMAIL",
    reference_template_id: item.reference_template_id,
    sender_config_id: item.sender_config_id ?? "",
    status: item.status,
    description: item.description ?? "",
    recipient_config: {
      to: toDraftRules(item.recipient_config.to),
      cc: toDraftRules(item.recipient_config.cc),
      bcc: toDraftRules(item.recipient_config.bcc),
    },
  };
}

function buildRecipientConfig(form: TaskTemplateFormState): TaskRecipientConfig {
  if (form.task_type === "WEBHOOK") {
    return { to: [], cc: [], bcc: [] };
  }

  function normalize(rows: RecipientRuleDraft[]) {
    return rows.map((row) => {
      const payload: TaskRecipientRule = { source_type: row.source_type };
      if (row.source_type !== "CURRENT_HANDLER" && row.value?.trim()) {
        payload.value = row.value.trim();
      }
      return payload;
    });
  }

  return {
    to: normalize(form.recipient_config.to),
    cc: normalize(form.recipient_config.cc),
    bcc: normalize(form.recipient_config.bcc),
  };
}

function TaskTemplateStatusBadge({
  status,
  language,
}: {
  status: TaskTemplateStatus;
  language: "zh" | "en";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${getTaskTemplateStatusPalette(
        status,
      )}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {getTaskTemplateStatusLabel(status, language)}
    </span>
  );
}

function TaskTypeBadge({
  taskType,
  language,
}: {
  taskType: "EMAIL" | "WEBHOOK";
  language: "zh" | "en";
}) {
  const icon =
    taskType === "EMAIL" ? <Mail className="h-3 w-3" /> : <Webhook className="h-3 w-3" />;
  const palette =
    taskType === "EMAIL"
      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300"
      : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/40 dark:bg-violet-900/20 dark:text-violet-300";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${palette}`}>
      {icon}
      {getTaskTypeLabel(taskType, language)}
    </span>
  );
}

function summaryRecipients(item: TaskTemplateSummary, language: "zh" | "en") {
  if (item.task_type === "WEBHOOK") {
    return language === "zh" ? "来源 Event 的当前工单上下文" : "Current ticket context from Event";
  }
  const toCount = item.recipient_config.to.length;
  const ccCount = item.recipient_config.cc.length;
  const bccCount = item.recipient_config.bcc.length;
  return language === "zh"
    ? `To ${toCount} / Cc ${ccCount} / Bcc ${bccCount}`
    : `To ${toCount} / Cc ${ccCount} / Bcc ${bccCount}`;
}

function findTemplateName(templates: TemplateSummary[], templateId: string, language: "zh" | "en") {
  const template = templates.find((item) => item.id === templateId);
  return template?.name ?? (language === "zh" ? "引用模板已不存在" : "Missing referenced template");
}

function findMailSenderName(
  mailSenders: MailSenderSummary[],
  senderConfigId: string | null | undefined,
  language: "zh" | "en",
) {
  if (!senderConfigId) {
    return language === "zh" ? "未指定（使用默认 SMTP）" : "Not bound (default SMTP)";
  }
  const sender = mailSenders.find((item) => item.id === senderConfigId);
  return sender?.sender_name ?? (language === "zh" ? "发送者配置已不存在" : "Missing sender");
}

function RecipientBucketEditor({
  bucket,
  title,
  rows,
  fieldError,
  fieldErrors,
  onAdd,
  onRemove,
  onSourceChange,
  onValueChange,
  language,
}: {
  bucket: RecipientBucket;
  title: string;
  rows: RecipientRuleDraft[];
  fieldError?: string;
  fieldErrors: Record<string, string>;
  onAdd: (bucket: RecipientBucket) => void;
  onRemove: (bucket: RecipientBucket, clientId: string) => void;
  onSourceChange: (bucket: RecipientBucket, clientId: string, value: RecipientSourceType) => void;
  onValueChange: (bucket: RecipientBucket, clientId: string, value: string) => void;
  language: "zh" | "en";
}) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs text-slate-800 dark:text-slate-100">{title}</h4>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {language === "zh"
              ? "一行一条规则，支持邮箱、当前处理人、角色成员"
              : "One rule per row. Supports email, current handler, and role members."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(bucket)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Plus className="h-3 w-3" />
          {language === "zh" ? "添加" : "Add"}
        </button>
      </div>

      {fieldError ? <p className="text-[11px] text-red-500">{fieldError}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[11px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
          {language === "zh" ? "当前没有规则" : "No rules configured"}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const bucketPrefix = `recipient_config.${bucket}[${index}]`;
            const requiresValue = row.source_type !== "CURRENT_HANDLER";
            const sourceError = fieldErrors[`${bucketPrefix}.source_type`];
            const valueError = fieldErrors[`${bucketPrefix}.value`];
            return (
              <div
                key={row.clientId}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                  <select
                    value={row.source_type}
                    onChange={(event) =>
                      onSourceChange(bucket, row.clientId, event.target.value as RecipientSourceType)
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {recipientSourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option[language]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onRemove(bucket, row.clientId)}
                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 py-2 text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {sourceError ? <p className="text-[11px] text-red-500">{sourceError}</p> : null}

                {requiresValue ? (
                  row.source_type === "ROLE_MEMBERS" ? (
                    <select
                      value={row.value ?? ""}
                      onChange={(event) => onValueChange(bucket, row.clientId, event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="">{language === "zh" ? "选择角色" : "Select role"}</option>
                      {["ADMIN", "T1", "T2", "T3"].map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={row.value ?? ""}
                      onChange={(event) => onValueChange(bucket, row.clientId, event.target.value)}
                      placeholder={language === "zh" ? "输入邮箱地址" : "Enter email address"}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  )
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {language === "zh"
                      ? "运行时自动解析工单当前处理人邮箱"
                      : "Resolved at runtime from the ticket's current handler"}
                  </div>
                )}
                {valueError ? <p className="text-[11px] text-red-500">{valueError}</p> : null}
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {getRecipientSourceLabel(row.source_type, language)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TaskTemplatesPage() {
  const { language } = useLanguage();
  const zh = language === "zh";

  const [items, setItems] = useState<TaskTemplateSummary[]>([]);
  const [referenceTemplates, setReferenceTemplates] = useState<TemplateSummary[]>([]);
  const [mailSenders, setMailSenders] = useState<MailSenderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [actionTemplateId, setActionTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskTemplateFormState>(defaultFormState());

  async function loadPage() {
    setLoading(true);
    setError("");
    try {
      const [taskTemplateResponse, templateResponse, senderResponse] = await Promise.all([
        listTaskTemplates(),
        listTemplates({ status: "ACTIVE", templateType: "all" }),
        listMailSenders({ status: "ENABLED" }),
      ]);
      startTransition(() => {
        setItems(taskTemplateResponse.items);
        setReferenceTemplates(templateResponse.items);
        setMailSenders(senderResponse.items);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load task templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword);
      const matchesTaskType = taskTypeFilter === "all" || item.task_type === taskTypeFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesTaskType && matchesStatus;
    });
  }, [items, search, statusFilter, taskTypeFilter]);

  const availableReferenceTemplates = referenceTemplates.filter(
    (item) => item.template_type === form.task_type,
  );

  function openCreatePanel() {
    setPanelMode("create");
    setSelectedTemplateId(null);
    setFieldErrors({});
    setError("");
    setForm(defaultFormState());
  }

  function openEditPanel(item: TaskTemplateSummary) {
    setPanelMode("edit");
    setSelectedTemplateId(item.id);
    setFieldErrors({});
    setError("");
    setForm(fromTaskTemplate(item));
  }

  function updateRecipientRow(
    bucket: RecipientBucket,
    clientId: string,
    updater: (row: RecipientRuleDraft) => RecipientRuleDraft,
  ) {
    setForm((current) => ({
      ...current,
      recipient_config: {
        ...current.recipient_config,
        [bucket]: current.recipient_config[bucket].map((row) =>
          row.clientId === clientId ? updater(row) : row,
        ),
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setFieldErrors({});

    try {
      const recipientConfig = buildRecipientConfig(form);
      const payload = {
        name: form.name.trim(),
        reference_template_id: form.reference_template_id,
        sender_config_id: form.task_type === "EMAIL" ? form.sender_config_id.trim() || null : null,
        recipient_config: recipientConfig,
        target_config: {},
        description: form.description.trim() || null,
      };

      let saved: TaskTemplateSummary;
      if (panelMode === "create") {
        saved = await createTaskTemplate({
          ...payload,
          task_type: form.task_type,
          status: form.status,
        });
      } else {
        const current = items.find((item) => item.id === selectedTemplateId);
        if (!selectedTemplateId || !current) {
          throw new Error(zh ? "请选择要编辑的任务模板" : "Select a task template to edit");
        }
        saved = await updateTaskTemplate(selectedTemplateId, payload);
        if (current.status !== form.status) {
          saved = await updateTaskTemplateStatus(selectedTemplateId, form.status);
        }
      }

      await loadPage();
      openEditPanel(saved);
    } catch (saveError) {
      if (
        saveError instanceof ApiError &&
        saveError.detail &&
        typeof saveError.detail === "object" &&
        "field_errors" in (saveError.detail as Record<string, unknown>)
      ) {
        const detail = saveError.detail as { field_errors?: Record<string, string> };
        setFieldErrors(detail.field_errors ?? {});
        setError(saveError.message);
      } else {
        setError(saveError instanceof Error ? saveError.message : "Failed to save task template");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(item: TaskTemplateSummary) {
    setActionTemplateId(item.id);
    setError("");
    try {
      const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const updated = await updateTaskTemplateStatus(item.id, nextStatus);
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (selectedTemplateId === updated.id) {
        setForm((current) => ({ ...current, status: updated.status }));
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update status");
    } finally {
      setActionTemplateId(null);
    }
  }

  const selectedTemplate =
    selectedTemplateId ? items.find((item) => item.id === selectedTemplateId) ?? null : null;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Settings2 className="h-3.5 w-3.5" />
            <span>{zh ? "配置中心" : "Configuration"}</span>
            <span>/</span>
            <span>{zh ? "任务模板" : "Task Templates"}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {zh ? "任务模板管理" : "Task Template Management"}
          </h1>
          <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            {zh
              ? "独立维护 Event 可绑定的任务模板。Email 任务只维护收件规则；Webhook 任务只引用模板，不允许覆盖请求内容。"
              : "Maintain bindable task templates for Event rules. Email tasks manage recipient rules only, while Webhook tasks keep request content strictly in the referenced template."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadPage()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {zh ? "刷新" : "Refresh"}
          </button>
          <button
            onClick={openCreatePanel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {zh ? "新建任务模板" : "New Task Template"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 xl:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "搜索" : "Search"}
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={zh ? "模板名称 / ID" : "Template name / ID"}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "任务类型" : "Task Type"}
                </span>
                <select
                  value={taskTypeFilter}
                  onChange={(event) => setTaskTypeFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">{zh ? "全部类型" : "All Types"}</option>
                  {taskTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option[language]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "模板状态" : "Status"}
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">{zh ? "全部状态" : "All Statuses"}</option>
                  {taskTemplateStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option[language]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <FileCode2 className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "任务模板表" : "Task Template Table"}
              </span>
              <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                {zh ? `共 ${filteredItems.length} 条` : `${filteredItems.length} items`}
              </span>
            </div>

            {loading ? (
              <div className="px-6 py-16 text-sm text-slate-500 dark:text-slate-400">
                {zh ? "正在加载任务模板…" : "Loading task templates..."}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                {zh ? "当前没有匹配的任务模板" : "No task templates match the current filters"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      {[
                        zh ? "模板名称" : "Template",
                        zh ? "类型" : "Type",
                        zh ? "引用模板" : "Reference",
                        zh ? "目标 / 收件摘要" : "Target / Recipients",
                        zh ? "状态" : "Status",
                        zh ? "更新时间" : "Updated",
                        zh ? "操作" : "Actions",
                      ].map((column) => (
                        <th
                          key={column}
                          className="whitespace-nowrap px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {filteredItems.map((item) => {
                      const active = item.id === selectedTemplateId;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => openEditPanel(item)}
                          className={`cursor-pointer transition-colors ${
                            active
                              ? "bg-blue-50/70 dark:bg-blue-950/20"
                              : "hover:bg-slate-50 dark:hover:bg-slate-900/40"
                          }`}
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-1">
                              <p className="text-xs text-slate-800 dark:text-slate-100">{item.name}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">{item.id}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <TaskTypeBadge taskType={item.task_type} language={language} />
                          </td>
                          <td className="px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                            <div className="space-y-1">
                              <p>{findTemplateName(referenceTemplates, item.reference_template_id, language)}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                {item.reference_template_id}
                              </p>
                            </div>
                          </td>
                          <td className="max-w-[260px] px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                            <div className="space-y-1">
                              <div className="line-clamp-2">{summaryRecipients(item, language)}</div>
                              {item.task_type === "EMAIL" ? (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {zh ? "发送者：" : "Sender: "}
                                  {findMailSenderName(mailSenders, item.sender_config_id, language)}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <TaskTemplateStatusBadge status={item.status} language={language} />
                          </td>
                          <td className="px-4 py-3 align-top text-[11px] text-slate-500 dark:text-slate-400">
                            {formatApiDateTime(item.updated_at, language)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditPanel(item);
                                }}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                {zh ? "编辑" : "Edit"}
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleToggleStatus(item);
                                }}
                                disabled={actionTemplateId === item.id}
                                className="rounded-lg border border-amber-200 px-2.5 py-1 text-[11px] text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800/40 dark:text-amber-300 dark:hover:bg-amber-900/20"
                              >
                                {actionTemplateId === item.id
                                  ? zh
                                    ? "处理中…"
                                    : "Working..."
                                  : item.status === "ACTIVE"
                                    ? zh
                                      ? "停用"
                                      : "Disable"
                                    : zh
                                      ? "启用"
                                      : "Enable"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/80">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                {panelMode === "create"
                  ? zh
                    ? "新建任务模板"
                    : "Create Template"
                  : zh
                    ? "编辑任务模板"
                    : "Edit Template"}
              </p>
              <h2 className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {panelMode === "create"
                  ? zh
                    ? "右侧面板"
                    : "Side Panel"
                  : form.name || (zh ? "未命名任务模板" : "Untitled Task Template")}
              </h2>
            </div>
            {panelMode === "edit" ? (
              <button
                onClick={openCreatePanel}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {zh ? "新建模式" : "New Mode"}
              </button>
            ) : null}
          </div>

          <div className="space-y-5 px-5 py-4">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "模板名称" : "Template Name"}
              </label>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={zh ? "例如：P1 创建通知任务" : "e.g. P1 Ticket Created Notify"}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              {fieldErrors.name ? <p className="text-[11px] text-red-500">{fieldErrors.name}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "任务类型" : "Task Type"}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {taskTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (panelMode === "edit") {
                        return;
                      }
                      setForm((current) => ({
                        ...current,
                        task_type: option.value,
                        reference_template_id: "",
                        sender_config_id: "",
                        recipient_config:
                          option.value === "EMAIL"
                            ? { to: [createRecipientRule("CUSTOM_EMAIL")], cc: [], bcc: [] }
                            : { to: [], cc: [], bcc: [] },
                      }));
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs transition-all ${
                      form.task_type === option.value
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    } ${panelMode === "edit" ? "cursor-not-allowed opacity-70" : ""}`}
                  >
                    {option[language]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "引用渲染模板" : "Referenced Render Template"}
              </label>
              <select
                value={form.reference_template_id}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reference_template_id: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">
                  {zh ? "选择已启用的模板" : "Select an active render template"}
                </option>
                {availableReferenceTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {fieldErrors.reference_template_id ? (
                <p className="text-[11px] text-red-500">{fieldErrors.reference_template_id}</p>
              ) : null}
            </div>

            {form.task_type === "EMAIL" ? (
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "邮箱发送者配置" : "Mail Sender Config"}
                </label>
                <select
                  value={form.sender_config_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sender_config_id: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">
                    {zh ? "不指定（使用默认 SMTP）" : "Not bound (default SMTP)"}
                  </option>
                  {mailSenders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sender_name} · {item.sender_email}
                    </option>
                  ))}
                </select>
                {fieldErrors.sender_config_id ? (
                  <p className="text-[11px] text-red-500">{fieldErrors.sender_config_id}</p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "启停状态" : "Status"}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {taskTemplateStatusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, status: option.value }))}
                    className={`rounded-lg border px-3 py-2 text-xs transition-all ${
                      form.status === option.value
                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {option[language]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "说明" : "Description"}
              </label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                placeholder={zh ? "补充说明任务模板的用途和发送对象" : "Describe the template purpose and audience"}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            {form.task_type === "EMAIL" ? (
              <div className="space-y-3">
                <RecipientBucketEditor
                  bucket="to"
                  title="To"
                  rows={form.recipient_config.to}
                  fieldError={fieldErrors["recipient_config.to"]}
                  fieldErrors={fieldErrors}
                  onAdd={(bucket) =>
                    setForm((current) => ({
                      ...current,
                      recipient_config: {
                        ...current.recipient_config,
                        [bucket]: [...current.recipient_config[bucket], createRecipientRule("CUSTOM_EMAIL")],
                      },
                    }))
                  }
                  onRemove={(bucket, clientId) =>
                    setForm((current) => ({
                      ...current,
                      recipient_config: {
                        ...current.recipient_config,
                        [bucket]: current.recipient_config[bucket].filter((row) => row.clientId !== clientId),
                      },
                    }))
                  }
                  onSourceChange={(bucket, clientId, value) =>
                    updateRecipientRow(bucket, clientId, (row) => ({
                      ...row,
                      source_type: value,
                      value: value === "CURRENT_HANDLER" ? "" : value === "ROLE_MEMBERS" ? "T2" : row.value ?? "",
                    }))
                  }
                  onValueChange={(bucket, clientId, value) =>
                    updateRecipientRow(bucket, clientId, (row) => ({ ...row, value }))
                  }
                  language={language}
                />
                <RecipientBucketEditor
                  bucket="cc"
                  title="Cc"
                  rows={form.recipient_config.cc}
                  fieldError={fieldErrors["recipient_config.cc"]}
                  fieldErrors={fieldErrors}
                  onAdd={(bucket) =>
                    setForm((current) => ({
                      ...current,
                      recipient_config: {
                        ...current.recipient_config,
                        [bucket]: [...current.recipient_config[bucket], createRecipientRule("CURRENT_HANDLER")],
                      },
                    }))
                  }
                  onRemove={(bucket, clientId) =>
                    setForm((current) => ({
                      ...current,
                      recipient_config: {
                        ...current.recipient_config,
                        [bucket]: current.recipient_config[bucket].filter((row) => row.clientId !== clientId),
                      },
                    }))
                  }
                  onSourceChange={(bucket, clientId, value) =>
                    updateRecipientRow(bucket, clientId, (row) => ({
                      ...row,
                      source_type: value,
                      value: value === "CURRENT_HANDLER" ? "" : value === "ROLE_MEMBERS" ? "T2" : row.value ?? "",
                    }))
                  }
                  onValueChange={(bucket, clientId, value) =>
                    updateRecipientRow(bucket, clientId, (row) => ({ ...row, value }))
                  }
                  language={language}
                />
                <RecipientBucketEditor
                  bucket="bcc"
                  title="Bcc"
                  rows={form.recipient_config.bcc}
                  fieldError={fieldErrors["recipient_config.bcc"]}
                  fieldErrors={fieldErrors}
                  onAdd={(bucket) =>
                    setForm((current) => ({
                      ...current,
                      recipient_config: {
                        ...current.recipient_config,
                        [bucket]: [...current.recipient_config[bucket], createRecipientRule("ROLE_MEMBERS", "ADMIN")],
                      },
                    }))
                  }
                  onRemove={(bucket, clientId) =>
                    setForm((current) => ({
                      ...current,
                      recipient_config: {
                        ...current.recipient_config,
                        [bucket]: current.recipient_config[bucket].filter((row) => row.clientId !== clientId),
                      },
                    }))
                  }
                  onSourceChange={(bucket, clientId, value) =>
                    updateRecipientRow(bucket, clientId, (row) => ({
                      ...row,
                      source_type: value,
                      value: value === "CURRENT_HANDLER" ? "" : value === "ROLE_MEMBERS" ? "ADMIN" : row.value ?? "",
                    }))
                  }
                  onValueChange={(bucket, clientId, value) =>
                    updateRecipientRow(bucket, clientId, (row) => ({ ...row, value }))
                  }
                  language={language}
                />
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 text-xs text-violet-800 dark:border-violet-800/40 dark:bg-violet-900/20 dark:text-violet-200">
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4" />
                  <h3 className="text-sm">
                    {zh ? "Webhook 目标对象固定" : "Webhook Target Is Fixed"}
                  </h3>
                </div>
                <p>
                  {zh
                    ? "本期 Webhook 任务只针对来源 Event 的当前工单上下文执行，不允许在任务模板层覆盖 URL、method、headers 或 body。"
                    : "Webhook tasks execute only against the current ticket context from the source Event. URL, method, headers, and body cannot be overridden at the task template layer."}
                </p>
                {fieldErrors.target_config ? (
                  <p className="text-[11px] text-red-500">{fieldErrors.target_config}</p>
                ) : null}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
              {panelMode === "edit" && selectedTemplate ? (
                <div className="space-y-1">
                  <p>
                    {zh ? "当前模板 ID：" : "Current template ID: "}
                    <span className="font-mono">{selectedTemplate.id}</span>
                  </p>
                  <p>
                    {zh ? "最后更新时间：" : "Last updated: "}
                    {formatApiDateTime(selectedTemplate.updated_at, language)}
                  </p>
                </div>
              ) : (
                <p>
                  {zh
                    ? "创建后即可在 Event 编辑器中作为真实 task_template_id 被绑定。"
                    : "Once created, the template becomes a real task_template_id available in the Event editor."}
                </p>
              )}
            </div>

            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving
                ? zh
                  ? "保存中…"
                  : "Saving..."
                : panelMode === "create"
                  ? zh
                    ? "创建任务模板"
                    : "Create Task Template"
                  : zh
                    ? "保存修改"
                    : "Save Changes"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
