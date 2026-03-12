import { Download, FileUp, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { createReportTemplate, listReportTemplates, replaceReportTemplateFile, updateReportTemplate } from "../api/reportTemplates";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { ReportTemplateSummary } from "../types/report";
import { formatApiDateTime } from "../utils/datetime";
import { formatFileSize } from "../utils/files";

const CATEGORY_OPTIONS = [
  { value: "intrusion", zh: "入侵检测", en: "Intrusion Detection" },
  { value: "network", zh: "网络攻击", en: "Network Attack" },
  { value: "data", zh: "数据安全", en: "Data Security" },
  { value: "endpoint", zh: "终端安全", en: "Endpoint Security" },
  { value: "phishing", zh: "网络钓鱼", en: "Phishing" }
];

interface TemplateFormState {
  name: string;
  description: string;
  ticket_category_id: string;
  status: "ACTIVE" | "INACTIVE";
  file: File | null;
}

function emptyForm(): TemplateFormState {
  return {
    name: "",
    description: "",
    ticket_category_id: "endpoint",
    status: "ACTIVE",
    file: null
  };
}

export default function ReportTemplatesPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const zh = language === "zh";
  const [items, setItems] = useState<ReportTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<TemplateFormState>(emptyForm());
  const [editForm, setEditForm] = useState<Omit<TemplateFormState, "file">>({
    name: "",
    description: "",
    ticket_category_id: "endpoint",
    status: "ACTIVE"
  });

  const selectedTemplate = items.find((item) => item.id === selectedId) ?? null;

  async function loadTemplates() {
    setLoading(true);
    setError("");
    try {
      const payload = await listReportTemplates();
      setItems(payload.items);
      setSelectedId((current) => current ?? payload.items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    setEditForm({
      name: selectedTemplate.name,
      description: selectedTemplate.description ?? "",
      ticket_category_id: selectedTemplate.ticket_category_id,
      status: selectedTemplate.status
    });
  }, [selectedTemplate]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.file) {
      setError(zh ? "请先选择模板文件。" : "Please select a template file.");
      return;
    }

    const formData = new FormData();
    formData.set("name", createForm.name);
    formData.set("description", createForm.description);
    formData.set("ticket_category_id", createForm.ticket_category_id);
    formData.set("status", createForm.status);
    formData.set("file", createForm.file);

    setSaving("create");
    setError("");
    try {
      await createReportTemplate(formData);
      setCreateForm(emptyForm());
      await loadTemplates();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create template");
    } finally {
      setSaving(null);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate) {
      return;
    }

    setSaving(selectedTemplate.id);
    setError("");
    try {
      await updateReportTemplate(selectedTemplate.id, {
        name: editForm.name,
        description: editForm.description,
        status: editForm.status
      });
      await loadTemplates();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update template");
    } finally {
      setSaving(null);
    }
  }

  async function handleReplaceFile(templateId: string, file: File | null) {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setSaving(`replace:${templateId}`);
    setError("");
    try {
      await replaceReportTemplateFile(templateId, formData);
      await loadTemplates();
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Failed to replace template file");
    } finally {
      setSaving(null);
    }
  }

  if (user?.active_role !== "ADMIN") {
    return (
      <div className="p-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {zh ? "当前角色不是 ADMIN，不能维护报告模板。" : "The current role is not ADMIN and cannot manage report templates."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-400">{zh ? "Configuration / Templates" : "Configuration / Templates"}</div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{zh ? "报告模板" : "Report Templates"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {zh
            ? "按工单类型维护可下载的模板文件。模板只供内部人员参考，不会直接变成具体工单报告。"
            : "Maintain downloadable template files by ticket category. Templates are internal references and do not become ticket reports directly."}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleCreate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <FileUp className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{zh ? "新建模板" : "Create Template"}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{zh ? "上传模板文件并绑定工单类型。" : "Upload a template file and bind it to a ticket category."}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-2 block">{zh ? "模板名称" : "Template Name"}</span>
            <input
              required
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              className="ticket-input"
            />
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-2 block">{zh ? "工单类型" : "Ticket Category"}</span>
            <select
              value={createForm.ticket_category_id}
              onChange={(event) => setCreateForm((current) => ({ ...current, ticket_category_id: event.target.value }))}
              className="ticket-select"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {zh ? option.zh : option.en}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-2 block">{zh ? "状态" : "Status"}</span>
            <select
              value={createForm.status}
              onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value as "ACTIVE" | "INACTIVE" }))}
              className="ticket-select"
            >
              <option value="ACTIVE">{zh ? "启用" : "Active"}</option>
              <option value="INACTIVE">{zh ? "停用" : "Inactive"}</option>
            </select>
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-2 block">{zh ? "模板文件" : "Template File"}</span>
            <input
              required
              type="file"
              onChange={(event) => setCreateForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
              className="ticket-input file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:text-blue-600"
            />
          </label>
          <label className="block text-sm text-slate-600 dark:text-slate-300 lg:col-span-2">
            <span className="mb-2 block">{zh ? "说明" : "Description"}</span>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
              className="ticket-input"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving === "create"}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving === "create" ? (zh ? "保存中..." : "Saving...") : zh ? "创建模板" : "Create Template"}
          </button>
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{zh ? "模板列表" : "Template Inventory"}</div>
            <button
              type="button"
              onClick={() => void loadTemplates()}
              className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {zh ? "刷新" : "Refresh"}
            </button>
          </div>
          <div className="max-h-[560px] space-y-3 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">{zh ? "加载中..." : "Loading..."}</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">{zh ? "暂无模板。" : "No templates yet."}</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    selectedId === item.id
                      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                      : "border-slate-200 hover:border-blue-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {(CATEGORY_OPTIONS.find((option) => option.value === item.ticket_category_id) ?? CATEGORY_OPTIONS[0])[zh ? "zh" : "en"]}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${item.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{item.original_filename}</span>
                    <span>{formatApiDateTime(item.updated_at, language)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {selectedTemplate ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{zh ? "模板详情" : "Template Detail"}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{selectedTemplate.id}</div>
                </div>
              </div>

              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "模板名称" : "Template Name"}</span>
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  className="ticket-input"
                />
              </label>

              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "说明" : "Description"}</span>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                  className="ticket-input"
                />
              </label>

              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "状态" : "Status"}</span>
                <select
                  value={editForm.status}
                  onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as "ACTIVE" | "INACTIVE" }))}
                  className="ticket-select"
                >
                  <option value="ACTIVE">{zh ? "启用" : "Active"}</option>
                  <option value="INACTIVE">{zh ? "停用" : "Inactive"}</option>
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                <div className="font-medium text-slate-800 dark:text-slate-100">{selectedTemplate.original_filename}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatFileSize(selectedTemplate.size_bytes)}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={selectedTemplate.download_path}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    <Download className="h-4 w-4" />
                    {zh ? "下载模板" : "Download"}
                  </a>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                    <RefreshCw className="h-4 w-4" />
                    {saving === `replace:${selectedTemplate.id}` ? (zh ? "替换中..." : "Replacing...") : zh ? "替换文件" : "Replace File"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => void handleReplaceFile(selectedTemplate.id, event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving === selectedTemplate.id}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  {saving === selectedTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving === selectedTemplate.id ? (zh ? "保存中..." : "Saving...") : zh ? "保存变更" : "Save Changes"}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400">{zh ? "请选择左侧模板查看详情。" : "Select a template to view and edit it."}</div>
          )}
        </div>
      </div>
    </div>
  );
}
