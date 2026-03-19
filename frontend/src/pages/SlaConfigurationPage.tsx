import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { createConfig, deleteConfig, updateConfig } from "../api/config";
import { useLanguage } from "../contexts/LanguageContext";
import {
  fetchSlaPolicies,
  normalizePriorityCode,
  type SlaPriorityPolicy,
} from "../features/sla/policies";

interface EditState {
  priority_code: string;
  response_minutes: string;
  resolution_minutes: string;
  description: string;
}

const SLA_CATEGORY = "ticket.sla_policy";
const CODE_RE = /^[A-Z0-9_-]{1,8}$/;

function toEditState(item?: SlaPriorityPolicy): EditState {
  if (!item) {
    return {
      priority_code: "",
      response_minutes: "60",
      resolution_minutes: "240",
      description: "",
    };
  }
  return {
    priority_code: item.priority_code,
    response_minutes: String(item.response_minutes),
    resolution_minutes: String(item.resolution_minutes),
    description: item.description,
  };
}

function parsePositiveMinutes(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function validateForm(form: EditState, zh: boolean): string | null {
  const code = normalizePriorityCode(form.priority_code);
  if (!CODE_RE.test(code)) {
    return zh
      ? "优先级编码仅支持 1-8 位大写字母、数字、下划线和短横线。"
      : "Priority code supports 1-8 chars: uppercase letters, numbers, _ and -.";
  }
  const response = parsePositiveMinutes(form.response_minutes);
  const resolution = parsePositiveMinutes(form.resolution_minutes);
  if (response === null || resolution === null) {
    return zh ? "响应与处置时间必须为正整数分钟。" : "Response and resolution must be positive minutes.";
  }
  if (resolution < response) {
    return zh ? "处置时间不能小于响应时间。" : "Resolution time cannot be less than response time.";
  }
  return null;
}

export default function SlaConfigurationPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [items, setItems] = useState<SlaPriorityPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newForm, setNewForm] = useState<EditState>(toEditState());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>(toEditState());

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const policies = await fetchSlaPolicies();
      setItems(policies);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load SLA policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const hasItems = items.length > 0;
  const shortestResponse = useMemo(
    () => (hasItems ? Math.min(...items.map((item) => item.response_minutes)) : null),
    [hasItems, items]
  );
  const shortestResolution = useMemo(
    () => (hasItems ? Math.min(...items.map((item) => item.resolution_minutes)) : null),
    [hasItems, items]
  );

  async function handleCreate() {
    const validation = validateForm(newForm, zh);
    if (validation) {
      setError(validation);
      setMessage("");
      return;
    }
    const priorityCode = normalizePriorityCode(newForm.priority_code);
    const responseMinutes = parsePositiveMinutes(newForm.response_minutes);
    const resolutionMinutes = parsePositiveMinutes(newForm.resolution_minutes);
    if (responseMinutes === null || resolutionMinutes === null) {
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await createConfig(
        SLA_CATEGORY,
        priorityCode,
        {
          response_minutes: responseMinutes,
          resolution_minutes: resolutionMinutes,
        },
        newForm.description.trim() || undefined
      );
      setNewForm(toEditState());
      setMessage(zh ? "SLA 优先级已新增。" : "SLA priority created.");
      await loadPolicies();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create SLA policy");
    } finally {
      setSubmitting(false);
    }
  }

  function beginEdit(item: SlaPriorityPolicy) {
    setEditingCode(item.priority_code);
    setEditForm(toEditState(item));
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingCode(null);
    setEditForm(toEditState());
  }

  async function saveEdit(originalCode: string) {
    const validation = validateForm(editForm, zh);
    if (validation) {
      setError(validation);
      setMessage("");
      return;
    }
    const priorityCode = normalizePriorityCode(editForm.priority_code);
    if (priorityCode !== originalCode) {
      setError(zh ? "暂不支持直接修改编码，请删除后重新创建。" : "Changing code is not supported. Delete and recreate.");
      setMessage("");
      return;
    }
    const responseMinutes = parsePositiveMinutes(editForm.response_minutes);
    const resolutionMinutes = parsePositiveMinutes(editForm.resolution_minutes);
    if (responseMinutes === null || resolutionMinutes === null) {
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await updateConfig(
        SLA_CATEGORY,
        originalCode,
        {
          response_minutes: responseMinutes,
          resolution_minutes: resolutionMinutes,
        },
        editForm.description.trim() || undefined
      );
      setEditingCode(null);
      setEditForm(toEditState());
      setMessage(zh ? "SLA 优先级已更新。" : "SLA priority updated.");
      await loadPolicies();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to update SLA policy");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(code: string) {
    if (!window.confirm(zh ? `确定删除 ${code} 吗？` : `Delete ${code}?`)) {
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await deleteConfig(SLA_CATEGORY, code);
      if (editingCode === code) {
        cancelEdit();
      }
      setMessage(zh ? "SLA 优先级已删除。" : "SLA priority deleted.");
      await loadPolicies();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete SLA policy");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <span>{zh ? "配置中心" : "Configuration"}</span>
          <span>/</span>
          <span>{zh ? "SLA 策略" : "SLA Policies"}</span>
        </div>
        <h1 className="text-slate-900 dark:text-white">{zh ? "SLA 策略配置" : "SLA Policy Configuration"}</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
          {zh
            ? "使用表格维护优先级的响应与处置时限。保存后，新建工单与工单编辑会读取最新优先级。"
            : "Manage response and resolution windows in a table. Ticket create/edit reads the latest priorities."}
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard title={zh ? "优先级总数" : "Priority Count"} value={String(items.length)} />
        <MetricCard title={zh ? "最短响应时限" : "Shortest Response"} value={shortestResponse ? `${shortestResponse}m` : "-"} />
        <MetricCard title={zh ? "最短处置时限" : "Shortest Resolution"} value={shortestResolution ? `${shortestResolution}m` : "-"} />
      </section>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
          {message}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <th className="px-4 py-3 font-medium">{zh ? "优先级编码" : "Code"}</th>
                <th className="px-4 py-3 font-medium">{zh ? "响应时间(分钟)" : "Response Minutes"}</th>
                <th className="px-4 py-3 font-medium">{zh ? "处置时间(分钟)" : "Resolution Minutes"}</th>
                <th className="px-4 py-3 font-medium">{zh ? "描述" : "Description"}</th>
                <th className="px-4 py-3 font-medium">{zh ? "操作" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              <tr className="bg-blue-50/60 dark:bg-blue-950/20">
                <td className="px-4 py-2">
                  <input
                    value={newForm.priority_code}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        priority_code: normalizePriorityCode(event.target.value),
                      }))
                    }
                    maxLength={8}
                    placeholder={zh ? "例如 P5" : "e.g. P5"}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newForm.response_minutes}
                    onChange={(event) => setNewForm((current) => ({ ...current, response_minutes: event.target.value }))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newForm.resolution_minutes}
                    onChange={(event) => setNewForm((current) => ({ ...current, resolution_minutes: event.target.value }))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newForm.description}
                    onChange={(event) => setNewForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder={zh ? "可选备注" : "Optional note"}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={handleCreate}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {zh ? "新增" : "Add"}
                  </button>
                </td>
              </tr>

              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {zh ? "加载中..." : "Loading..."}
                    </span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    {zh ? "暂无 SLA 策略" : "No SLA policies"}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const editing = editingCode === item.priority_code;
                  return (
                    <tr key={item.id} className="text-sm">
                      <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">
                        {editing ? (
                          <input
                            value={editForm.priority_code}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                priority_code: normalizePriorityCode(event.target.value),
                              }))
                            }
                            maxLength={8}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                        ) : (
                          item.priority_code
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {editing ? (
                          <input
                            value={editForm.response_minutes}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                response_minutes: event.target.value,
                              }))
                            }
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                        ) : (
                          item.response_minutes
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {editing ? (
                          <input
                            value={editForm.resolution_minutes}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                resolution_minutes: event.target.value,
                              }))
                            }
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                        ) : (
                          item.resolution_minutes
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                        {editing ? (
                          <input
                            value={editForm.description}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                        ) : (
                          item.description || "-"
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {editing ? (
                            <>
                              <button
                                onClick={() => void saveEdit(item.priority_code)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                              >
                                <Save className="h-3.5 w-3.5" />
                                {zh ? "保存" : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <X className="h-3.5 w-3.5" />
                                {zh ? "取消" : "Cancel"}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => beginEdit(item)}
                              disabled={submitting}
                              className="inline-flex items-center gap-1 rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {zh ? "编辑" : "Edit"}
                            </button>
                          )}
                          <button
                            onClick={() => void handleDelete(item.priority_code)}
                            disabled={submitting}
                            className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {zh ? "删除" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}
