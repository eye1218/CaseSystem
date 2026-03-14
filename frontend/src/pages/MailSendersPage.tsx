import {
  Mail,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import {
  createMailSender,
  listMailSenders,
  testMailSender,
  updateMailSender,
  updateMailSenderStatus,
} from "../api/mailSenders";
import { useLanguage } from "../contexts/LanguageContext";
import type {
  MailSenderCreatePayload,
  MailSenderSecurityType,
  MailSenderStatus,
  MailSenderSummary,
  MailSenderTestResponse,
} from "../types/mailSender";
import { formatApiDateTime } from "../utils/datetime";

interface MailSenderFormState {
  sender_name: string;
  sender_email: string;
  auth_account: string;
  auth_password: string;
  smtp_host: string;
  smtp_port: string;
  security_type: MailSenderSecurityType;
  status: MailSenderStatus;
}

const SECURITY_OPTIONS: MailSenderSecurityType[] = ["SSL", "TLS", "STARTTLS"];

function defaultFormState(): MailSenderFormState {
  return {
    sender_name: "",
    sender_email: "",
    auth_account: "",
    auth_password: "",
    smtp_host: "",
    smtp_port: "587",
    security_type: "STARTTLS",
    status: "ENABLED",
  };
}

function fromSender(item: MailSenderSummary): MailSenderFormState {
  return {
    sender_name: item.sender_name,
    sender_email: item.sender_email,
    auth_account: item.auth_account,
    auth_password: "",
    smtp_host: item.smtp_host,
    smtp_port: String(item.smtp_port),
    security_type: item.security_type,
    status: item.status,
  };
}

function statusPalette(status: MailSenderStatus) {
  return status === "ENABLED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300";
}

function resultPalette(result: MailSenderSummary["latest_test_status"]) {
  if (result === "SUCCESS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300";
  }
  if (result === "FAILED") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export default function MailSendersPage() {
  const { language } = useLanguage();
  const zh = language === "zh";

  const [items, setItems] = useState<MailSenderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MailSenderStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [actionSenderId, setActionSenderId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [latestTestResponse, setLatestTestResponse] = useState<MailSenderTestResponse | null>(null);
  const [form, setForm] = useState<MailSenderFormState>(defaultFormState());

  async function loadPage() {
    setLoading(true);
    setError("");
    try {
      const response = await listMailSenders();
      setItems(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load mail senders");
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
        item.sender_name.toLowerCase().includes(keyword) ||
        item.sender_email.toLowerCase().includes(keyword) ||
        item.auth_account.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [items, search, statusFilter]);

  const selectedSender = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  function openCreatePanel() {
    setPanelMode("create");
    setSelectedId(null);
    setFieldErrors({});
    setError("");
    setTestEmail("");
    setLatestTestResponse(null);
    setForm(defaultFormState());
  }

  function openEditPanel(item: MailSenderSummary) {
    setPanelMode("edit");
    setSelectedId(item.id);
    setFieldErrors({});
    setError("");
    setTestEmail("");
    setLatestTestResponse(null);
    setForm(fromSender(item));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const smtpPort = Number.parseInt(form.smtp_port, 10);
      if (!Number.isFinite(smtpPort)) {
        setFieldErrors({ smtp_port: zh ? "请输入合法端口" : "Enter a valid SMTP port" });
        setSaving(false);
        return;
      }

      const payload: MailSenderCreatePayload = {
        sender_name: form.sender_name.trim(),
        sender_email: form.sender_email.trim(),
        auth_account: form.auth_account.trim(),
        auth_password: form.auth_password,
        smtp_host: form.smtp_host.trim(),
        smtp_port: smtpPort,
        security_type: form.security_type,
        status: form.status,
      };

      let saved: MailSenderSummary;
      if (panelMode === "create") {
        saved = await createMailSender(payload);
      } else {
        if (!selectedId) {
          throw new Error(zh ? "请选择要编辑的配置" : "Select a sender config to edit");
        }
        const updatePayload = {
          sender_name: payload.sender_name,
          sender_email: payload.sender_email,
          auth_account: payload.auth_account,
          smtp_host: payload.smtp_host,
          smtp_port: payload.smtp_port,
          security_type: payload.security_type,
          status: payload.status,
          ...(form.auth_password.trim() ? { auth_password: form.auth_password } : {}),
        };
        saved = await updateMailSender(selectedId, updatePayload);
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
      }
      setError(saveError instanceof Error ? saveError.message : "Failed to save mail sender");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(item: MailSenderSummary) {
    setActionSenderId(item.id);
    setError("");
    try {
      const nextStatus: MailSenderStatus = item.status === "ENABLED" ? "DISABLED" : "ENABLED";
      const updated = await updateMailSenderStatus(item.id, nextStatus);
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (selectedId === updated.id) {
        setForm((current) => ({ ...current, status: updated.status }));
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update status");
    } finally {
      setActionSenderId(null);
    }
  }

  async function handleTestSend() {
    if (!selectedId) {
      return;
    }
    setTesting(true);
    setError("");
    setLatestTestResponse(null);
    try {
      const response = await testMailSender(selectedId, { test_email: testEmail.trim() });
      setLatestTestResponse(response);
      await loadPage();
    } catch (testError) {
      if (
        testError instanceof ApiError &&
        testError.detail &&
        typeof testError.detail === "object" &&
        "field_errors" in (testError.detail as Record<string, unknown>)
      ) {
        const detail = testError.detail as { field_errors?: Record<string, string> };
        setFieldErrors((current) => ({ ...current, ...(detail.field_errors ?? {}) }));
      }
      setError(testError instanceof Error ? testError.message : "Failed to test sender");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Mail className="h-3.5 w-3.5" />
            <span>{zh ? "配置中心 / 邮箱发送者" : "Configuration / Mail Senders"}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {zh ? "邮箱发送者配置" : "Mail Sender Configurations"}
          </h1>
          <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            {zh
              ? "维护独立 SMTP 发送身份，支持启停、测试发送与最近测试结果回看。密码不会在列表、编辑回显和测试结果中明文展示。"
              : "Manage independent SMTP sender identities with status control, test-send, and latest test result visibility. Passwords are never shown in list, edit, or test output."}
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
            {zh ? "新增发送者" : "New Sender"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <Settings2 className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "筛选器" : "Filters"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3">
              <label className="space-y-1 md:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "关键词" : "Keyword"}
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={zh ? "发送者名称 / 邮箱 / 认证账号 / ID" : "Name / email / account / ID"}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "状态" : "Status"}
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | MailSenderStatus)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">{zh ? "全部状态" : "All Statuses"}</option>
                  <option value="ENABLED">{zh ? "启用" : "Enabled"}</option>
                  <option value="DISABLED">{zh ? "停用" : "Disabled"}</option>
                </select>
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "发送者配置表" : "Sender Table"}
              </span>
              <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                {zh ? `共 ${filteredItems.length} 条` : `${filteredItems.length} items`}
              </span>
            </div>

            {loading ? (
              <div className="px-6 py-16 text-sm text-slate-500 dark:text-slate-400">
                {zh ? "正在加载发送者配置…" : "Loading sender configurations..."}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                {zh ? "当前没有匹配的发送者配置" : "No sender configs match the current filters"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      {[
                        zh ? "发送者" : "Sender",
                        zh ? "邮箱" : "Email",
                        zh ? "状态" : "Status",
                        zh ? "最近测试结果" : "Latest Test",
                        zh ? "最近测试时间" : "Latest Test Time",
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
                    {filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => openEditPanel(item)}
                        className={`cursor-pointer transition-colors ${
                          item.id === selectedId
                            ? "bg-blue-50/70 dark:bg-blue-950/20"
                            : "hover:bg-slate-50 dark:hover:bg-slate-900/40"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1">
                            <p className="text-xs text-slate-800 dark:text-slate-100">{item.sender_name}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{item.id}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                          <div className="space-y-1">
                            <p>{item.sender_email}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{item.auth_account}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${statusPalette(
                              item.status,
                            )}`}
                          >
                            {item.status === "ENABLED"
                              ? zh
                                ? "启用"
                                : "Enabled"
                              : zh
                                ? "停用"
                                : "Disabled"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${resultPalette(
                              item.latest_test_status,
                            )}`}
                          >
                            {item.latest_test_status === "SUCCESS"
                              ? zh
                                ? "成功"
                                : "Success"
                              : item.latest_test_status === "FAILED"
                                ? zh
                                  ? "失败"
                                  : "Failed"
                                : zh
                                  ? "未测试"
                                  : "Untested"}
                          </span>
                          {item.latest_test_error_summary ? (
                            <p className="mt-1 max-w-[200px] text-[11px] text-rose-500">
                              {item.latest_test_error_summary}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-[11px] text-slate-500 dark:text-slate-400">
                          {formatApiDateTime(item.latest_test_at, language)}
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
                              disabled={actionSenderId === item.id}
                              className="rounded-lg border border-amber-200 px-2.5 py-1 text-[11px] text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800/40 dark:text-amber-300 dark:hover:bg-amber-900/20"
                            >
                              {actionSenderId === item.id
                                ? zh
                                  ? "处理中…"
                                  : "Working..."
                                : item.status === "ENABLED"
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm text-slate-900 dark:text-slate-100">
                  {panelMode === "create"
                    ? zh
                      ? "新增邮箱发送者"
                      : "Create Mail Sender"
                    : zh
                      ? "编辑邮箱发送者"
                      : "Edit Mail Sender"}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {panelMode === "create"
                    ? zh
                      ? "先保存后才能执行测试发送。"
                      : "Save first before running test send."
                    : zh
                      ? "密码留空表示不修改。"
                      : "Leave password empty to keep existing value."}
                </p>
              </div>
              {panelMode === "edit" ? (
                <button
                  type="button"
                  onClick={openCreatePanel}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {zh ? "新建" : "New"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-5 px-5 py-4">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "发送者名称" : "Sender Name"}
              </label>
              <input
                value={form.sender_name}
                onChange={(event) => setForm((current) => ({ ...current, sender_name: event.target.value }))}
                placeholder={zh ? "例如：SOC 自动通知" : "e.g. SOC Auto Sender"}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              {fieldErrors.sender_name ? <p className="text-[11px] text-red-500">{fieldErrors.sender_name}</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "发送者邮箱" : "Sender Email"}
                </label>
                <input
                  value={form.sender_email}
                  onChange={(event) => setForm((current) => ({ ...current, sender_email: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
                {fieldErrors.sender_email ? (
                  <p className="text-[11px] text-red-500">{fieldErrors.sender_email}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "认证账号" : "Auth Account"}
                </label>
                <input
                  value={form.auth_account}
                  onChange={(event) => setForm((current) => ({ ...current, auth_account: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
                {fieldErrors.auth_account ? (
                  <p className="text-[11px] text-red-500">{fieldErrors.auth_account}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {zh ? "认证密码" : "Auth Password"}
              </label>
              <input
                type="password"
                value={form.auth_password}
                onChange={(event) => setForm((current) => ({ ...current, auth_password: event.target.value }))}
                placeholder={panelMode === "edit" ? (zh ? "留空表示不修改" : "Leave empty to keep current") : ""}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              {fieldErrors.auth_password ? (
                <p className="text-[11px] text-red-500">{fieldErrors.auth_password}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  SMTP Host
                </label>
                <input
                  value={form.smtp_host}
                  onChange={(event) => setForm((current) => ({ ...current, smtp_host: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
                {fieldErrors.smtp_host ? <p className="text-[11px] text-red-500">{fieldErrors.smtp_host}</p> : null}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  SMTP Port
                </label>
                <input
                  value={form.smtp_port}
                  onChange={(event) => setForm((current) => ({ ...current, smtp_port: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
                {fieldErrors.smtp_port ? <p className="text-[11px] text-red-500">{fieldErrors.smtp_port}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "加密方式" : "Security Type"}
                </label>
                <select
                  value={form.security_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      security_type: event.target.value as MailSenderSecurityType,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {SECURITY_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {fieldErrors.security_type ? (
                  <p className="text-[11px] text-red-500">{fieldErrors.security_type}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {zh ? "状态" : "Status"}
                </label>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as MailSenderStatus,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="ENABLED">{zh ? "启用" : "Enabled"}</option>
                  <option value="DISABLED">{zh ? "停用" : "Disabled"}</option>
                </select>
                {fieldErrors.status ? <p className="text-[11px] text-red-500">{fieldErrors.status}</p> : null}
              </div>
            </div>

            {panelMode === "edit" && selectedSender ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/30">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {zh ? "配置 ID：" : "Config ID: "}
                  <span className="font-mono">{selectedSender.id}</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {zh ? "最近测试：" : "Latest test: "}
                  {selectedSender.latest_test_status ?? (zh ? "未测试" : "Untested")} /{" "}
                  {formatApiDateTime(selectedSender.latest_test_at, language)}
                </div>
                {selectedSender.latest_test_error_summary ? (
                  <p className="text-[11px] text-rose-500">{selectedSender.latest_test_error_summary}</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {zh ? "新增状态下不可测试，请先保存配置。" : "Test send is available only after saving the sender config."}
              </div>
            )}

            {panelMode === "edit" ? (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-900/20">
                <div className="text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-300">
                  {zh ? "测试发送" : "Test Send"}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={testEmail}
                    onChange={(event) => setTestEmail(event.target.value)}
                    placeholder={zh ? "输入测试收件邮箱" : "Enter test recipient email"}
                    className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-blue-800/40 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <button
                    onClick={() => void handleTestSend()}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    {testing ? (zh ? "测试中…" : "Testing...") : zh ? "执行测试" : "Run Test"}
                  </button>
                </div>
                {fieldErrors.test_email ? <p className="text-[11px] text-red-500">{fieldErrors.test_email}</p> : null}
                {latestTestResponse ? (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {zh ? "本次结果：" : "Latest result: "}
                    <span
                      className={
                        latestTestResponse.result === "SUCCESS"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-rose-600 dark:text-rose-300"
                      }
                    >
                      {latestTestResponse.result}
                    </span>
                    {" · "}
                    {formatApiDateTime(latestTestResponse.tested_at, language)}
                    {latestTestResponse.error_summary ? ` · ${latestTestResponse.error_summary}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

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
                    ? "创建发送者"
                    : "Create Sender"
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
