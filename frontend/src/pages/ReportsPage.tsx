import {
  Download,
  FileUp,
  Filter,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";

import { createReport, deleteReport, listReports, replaceReportFile, updateReport } from "../api/reports";
import { getTicketDetail } from "../api/tickets";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { ReportSummary, ReportTemplateSummary } from "../types/report";
import { formatApiDateTime } from "../utils/datetime";
import { formatFileSize } from "../utils/files";

type ViewMode = "list" | "card";

interface ReportFilters {
  search: string;
  ticketId: string;
  reportType: string;
  uploadedByMe: boolean;
}

interface ReportFormState {
  ticketId: string;
  title: string;
  reportType: string;
  note: string;
  sourceTemplateId: string;
  file: File | null;
}

interface ReportEditState {
  title: string;
  reportType: string;
  note: string;
  sourceTemplateId: string;
}

interface TicketTemplateContext {
  ticketTitle: string;
  ticketCategoryName: string;
  templates: ReportTemplateSummary[];
}

const defaultFilters: ReportFilters = {
  search: "",
  ticketId: "",
  reportType: "",
  uploadedByMe: false
};

function emptyCreateForm(): ReportFormState {
  return {
    ticketId: "",
    title: "",
    reportType: "",
    note: "",
    sourceTemplateId: "",
    file: null
  };
}

function buildTemplateOptions(
  templates: ReportTemplateSummary[],
  currentTemplateId?: string | null,
  currentTemplateName?: string | null
) {
  const items = [...templates];
  if (currentTemplateId && !items.some((item) => item.id === currentTemplateId)) {
    items.push({
      id: currentTemplateId,
      name: currentTemplateName ?? currentTemplateId,
      description: null,
      ticket_category_id: "",
      status: "INACTIVE",
      original_filename: "",
      content_type: null,
      size_bytes: 0,
      download_path: "",
      created_at: "",
      updated_at: ""
    });
  }
  return items;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const zh = language === "zh";
  const canManageReports = user?.active_role !== "CUSTOMER";

  const [items, setItems] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ReportFormState>(emptyCreateForm());
  const [editForm, setEditForm] = useState<ReportEditState>({
    title: "",
    reportType: "",
    note: "",
    sourceTemplateId: ""
  });
  const [uploadTicketContext, setUploadTicketContext] = useState<TicketTemplateContext | null>(null);
  const [selectedTicketContext, setSelectedTicketContext] = useState<TicketTemplateContext | null>(null);
  const [uploadLookupLoading, setUploadLookupLoading] = useState(false);
  const [selectedLookupLoading, setSelectedLookupLoading] = useState(false);
  const [uploadLookupError, setUploadLookupError] = useState("");
  const [selectedLookupError, setSelectedLookupError] = useState("");

  const selectedReport = items.find((item) => item.id === selectedId) ?? null;

  async function fetchTicketTemplateContext(ticketId: string): Promise<TicketTemplateContext | null> {
    const trimmed = ticketId.trim();
    if (!trimmed || Number.isNaN(Number(trimmed))) {
      return null;
    }

    const detail = await getTicketDetail(trimmed);
    return {
      ticketTitle: detail.ticket.title,
      ticketCategoryName: detail.ticket.category_name,
      templates: detail.report_templates
    };
  }

  async function loadReports(nextFilters: ReportFilters = filters, preferredSelectedId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const payload = await listReports({
        search: nextFilters.search || undefined,
        ticketId: nextFilters.ticketId || undefined,
        reportType: nextFilters.reportType || undefined,
        uploadedByMe: nextFilters.uploadedByMe
      });
      setItems(payload.items);
      setSelectedId((current) => {
        const target = preferredSelectedId ?? current;
        if (target && payload.items.some((item) => item.id === target)) {
          return target;
        }
        return payload.items[0]?.id ?? null;
      });
      setFilters(nextFilters);
      setDraftFilters(nextFilters);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports(defaultFilters);
  }, []);

  useEffect(() => {
    if (!selectedReport) {
      setSelectedTicketContext(null);
      setSelectedLookupError("");
      setSelectedLookupLoading(false);
      return;
    }

    setEditForm({
      title: selectedReport.title,
      reportType: selectedReport.report_type,
      note: selectedReport.note ?? "",
      sourceTemplateId: selectedReport.source_template?.id ?? ""
    });

    if (!canManageReports) {
      return;
    }

    let cancelled = false;
    setSelectedLookupLoading(true);
    setSelectedLookupError("");

    void fetchTicketTemplateContext(String(selectedReport.ticket_id))
      .then((context) => {
        if (!cancelled) {
          setSelectedTicketContext(context);
        }
      })
      .catch((lookupError) => {
        if (!cancelled) {
          setSelectedTicketContext(null);
          setSelectedLookupError(lookupError instanceof Error ? lookupError.message : "Failed to load ticket templates");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedLookupLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedReport, canManageReports]);

  useEffect(() => {
    if (!canManageReports) {
      return;
    }

    const trimmedTicketId = createForm.ticketId.trim();
    if (!trimmedTicketId) {
      setUploadTicketContext(null);
      setUploadLookupError("");
      setUploadLookupLoading(false);
      return;
    }
    if (Number.isNaN(Number(trimmedTicketId))) {
      setUploadTicketContext(null);
      setUploadLookupError(zh ? "工单 ID 必须为数字。" : "Ticket ID must be numeric.");
      setUploadLookupLoading(false);
      return;
    }

    let cancelled = false;
    setUploadLookupLoading(true);
    setUploadLookupError("");

    void fetchTicketTemplateContext(trimmedTicketId)
      .then((context) => {
        if (!cancelled) {
          setUploadTicketContext(context);
        }
      })
      .catch((lookupError) => {
        if (!cancelled) {
          setUploadTicketContext(null);
          setUploadLookupError(lookupError instanceof Error ? lookupError.message : "Failed to load ticket detail");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUploadLookupLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [createForm.ticketId, canManageReports, zh]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadReports(draftFilters);
  }

  async function handleFilterReset() {
    setDraftFilters(defaultFilters);
    await loadReports(defaultFilters);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.file) {
      setError(zh ? "请先选择报告文件。" : "Please select a report file.");
      return;
    }

    const formData = new FormData();
    formData.set("ticket_id", createForm.ticketId.trim());
    formData.set("title", createForm.title);
    formData.set("report_type", createForm.reportType);
    formData.set("note", createForm.note);
    if (createForm.sourceTemplateId) {
      formData.set("source_template_id", createForm.sourceTemplateId);
    }
    formData.set("file", createForm.file);

    setSaving("create");
    setError("");
    try {
      const created = await createReport(formData);
      setCreateForm((current) => ({ ...emptyCreateForm(), ticketId: current.ticketId }));
      await loadReports(filters, created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to upload report");
    } finally {
      setSaving(null);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReport) {
      return;
    }

    setSaving(`update:${selectedReport.id}`);
    setError("");
    try {
      await updateReport(selectedReport.id, {
        title: editForm.title,
        report_type: editForm.reportType,
        note: editForm.note,
        source_template_id: editForm.sourceTemplateId || null
      });
      await loadReports(filters, selectedReport.id);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update report");
    } finally {
      setSaving(null);
    }
  }

  async function handleReplaceFile(reportId: string, file: File | null) {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setSaving(`replace:${reportId}`);
    setError("");
    try {
      await replaceReportFile(reportId, formData);
      await loadReports(filters, reportId);
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Failed to replace report file");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(reportId: string, reportTitle: string) {
    const confirmed = window.confirm(
      zh ? `确认永久删除报告《${reportTitle}》吗？` : `Delete report "${reportTitle}" permanently?`
    );
    if (!confirmed) {
      return;
    }

    setSaving(`delete:${reportId}`);
    setError("");
    try {
      await deleteReport(reportId);
      const fallbackId = selectedId === reportId ? null : selectedId;
      await loadReports(filters, fallbackId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete report");
    } finally {
      setSaving(null);
    }
  }

  const selectedTemplateOptions = buildTemplateOptions(
    selectedTicketContext?.templates ?? [],
    selectedReport?.source_template?.id,
    selectedReport?.source_template?.name
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-400">
          {zh ? "Reports / Uploaded Files" : "Reports / Uploaded Files"}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{zh ? "报告模块" : "Report Module"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {zh
            ? "统一查看与管理已上传到工单的报告文件。模板文件不在这里维护，只在配置中心和工单详情中作为下载参考出现。"
            : "Review and manage uploaded ticket reports in one place. Template files are maintained in configuration, not in this list."}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className={`grid gap-6 ${canManageReports ? "xl:grid-cols-[1fr_1fr]" : ""}`}>
        <form onSubmit={handleFilterSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{zh ? "筛选条件" : "Filters"}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {zh ? "默认展示当前角色可见的全部已上传报告。" : "Shows all reports visible to the current role by default."}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-2 block">{zh ? "标题搜索" : "Title Search"}</span>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={draftFilters.search}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                  className="ticket-input pl-9"
                />
              </div>
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-2 block">{zh ? "工单 ID" : "Ticket ID"}</span>
              <input
                value={draftFilters.ticketId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, ticketId: event.target.value }))}
                className="ticket-input"
              />
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-2 block">{zh ? "报告类型" : "Report Type"}</span>
              <input
                value={draftFilters.reportType}
                onChange={(event) => setDraftFilters((current) => ({ ...current, reportType: event.target.value }))}
                className="ticket-input"
              />
            </label>
            {canManageReports ? (
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={draftFilters.uploadedByMe}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, uploadedByMe: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>{zh ? "只看我上传的报告" : "Only reports uploaded by me"}</span>
              </label>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleFilterReset()}
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {zh ? "重置" : "Reset"}
            </button>
            <button
              type="button"
              onClick={() => void loadReports(filters, selectedId)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              {zh ? "刷新" : "Refresh"}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Search className="h-4 w-4" />
              {zh ? "应用筛选" : "Apply Filters"}
            </button>
          </div>
        </form>

        {canManageReports ? (
          <form onSubmit={handleCreate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <FileUp className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{zh ? "上传报告" : "Upload Report"}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {zh ? "支持从报告模块直接上传，但必须显式关联工单 ID。" : "Upload directly here and explicitly associate the target ticket ID."}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "工单 ID" : "Ticket ID"}</span>
                <input
                  required
                  value={createForm.ticketId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, ticketId: event.target.value }))}
                  className="ticket-input"
                />
              </label>
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "报告标题" : "Report Title"}</span>
                <input
                  required
                  value={createForm.title}
                  onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                  className="ticket-input"
                />
              </label>
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "报告类型" : "Report Type"}</span>
                <input
                  required
                  value={createForm.reportType}
                  onChange={(event) => setCreateForm((current) => ({ ...current, reportType: event.target.value }))}
                  className="ticket-input"
                />
              </label>
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-2 block">{zh ? "来源模板（可选）" : "Source Template (Optional)"}</span>
                <select
                  value={createForm.sourceTemplateId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, sourceTemplateId: event.target.value }))}
                  className="ticket-select"
                >
                  <option value="">{zh ? "不关联模板" : "No template linked"}</option>
                  {(uploadTicketContext?.templates ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                <span className="mb-2 block">{zh ? "报告文件" : "Report File"}</span>
                <input
                  required
                  type="file"
                  onChange={(event) => setCreateForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                  className="ticket-input file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:text-blue-600"
                />
              </label>
              <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                <span className="mb-2 block">{zh ? "备注" : "Note"}</span>
                <textarea
                  rows={3}
                  value={createForm.note}
                  onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))}
                  className="ticket-input"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
              {uploadLookupLoading ? (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {zh ? "正在获取工单模板..." : "Loading ticket templates..."}
                </div>
              ) : uploadLookupError ? (
                <div className="text-red-600 dark:text-red-300">{uploadLookupError}</div>
              ) : uploadTicketContext ? (
                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                  <div>
                    {zh ? "关联工单" : "Target Ticket"}: {uploadTicketContext.ticketTitle}
                  </div>
                  <div>
                    {zh ? "工单类型" : "Category"}: {uploadTicketContext.ticketCategoryName}
                  </div>
                  <div>
                    {zh ? "可用模板数" : "Available Templates"}: {uploadTicketContext.templates.length}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 dark:text-slate-400">
                  {zh ? "输入工单 ID 后，会自动加载该工单可关联的模板。" : "Enter a ticket ID to load available templates automatically."}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving === "create"}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving === "create" ? (zh ? "上传中..." : "Uploading...") : zh ? "上传报告" : "Upload Report"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{zh ? "报告列表" : "Report Inventory"}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {zh ? `共 ${items.length} 份报告` : `${items.length} reports`}
              </div>
            </div>
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-xl px-3 py-2 text-sm ${viewMode === "list" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`rounded-xl px-3 py-2 text-sm ${viewMode === "card" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={`p-5 ${viewMode === "card" ? "grid gap-4 xl:grid-cols-2" : "space-y-3"}`}>
            {loading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">{zh ? "加载中..." : "Loading..."}</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {zh ? "当前条件下没有可见报告。" : "No reports match the current filters."}
              </div>
            ) : (
              items.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all ${
                    selectedId === report.id
                      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                      : "border-slate-200 hover:border-blue-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{report.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span>{report.report_type}</span>
                        <span>{report.original_filename}</span>
                        <span>{formatFileSize(report.size_bytes)}</span>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      #{report.ticket_id}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span>{report.uploaded_by}</span>
                    <span>{formatApiDateTime(report.updated_at, language)}</span>
                    {report.source_template ? <span>{report.source_template.name}</span> : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {selectedReport ? (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">{selectedReport.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{selectedReport.report_type}</span>
                    <span>{selectedReport.original_filename}</span>
                    <span>{formatFileSize(selectedReport.size_bytes)}</span>
                  </div>
                </div>
                <a
                  href={selectedReport.download_path}
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>

              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                  <span>
                    {zh ? "关联工单" : "Ticket"}:{" "}
                    <Link to={`/tickets/${selectedReport.ticket_id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
                      <Link2 className="h-3.5 w-3.5" />
                      #{selectedReport.ticket_id}
                    </Link>
                  </span>
                  <span>{zh ? "上传人" : "Uploaded by"}: {selectedReport.uploaded_by}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{zh ? "创建时间" : "Created"}: {formatApiDateTime(selectedReport.created_at, language)}</span>
                  <span>{zh ? "更新时间" : "Updated"}: {formatApiDateTime(selectedReport.updated_at, language)}</span>
                </div>
              </div>

              {canManageReports ? (
                <form onSubmit={handleUpdate} className="space-y-4">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block">{zh ? "标题" : "Title"}</span>
                    <input
                      value={editForm.title}
                      onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                      className="ticket-input"
                    />
                  </label>

                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block">{zh ? "报告类型" : "Report Type"}</span>
                    <input
                      value={editForm.reportType}
                      onChange={(event) => setEditForm((current) => ({ ...current, reportType: event.target.value }))}
                      className="ticket-input"
                    />
                  </label>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                    {selectedLookupLoading ? (
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {zh ? "正在获取工单模板..." : "Loading ticket templates..."}
                      </div>
                    ) : selectedLookupError ? (
                      <div className="text-red-600 dark:text-red-300">{selectedLookupError}</div>
                    ) : selectedTicketContext ? (
                      <div className="space-y-1 text-slate-600 dark:text-slate-300">
                        <div>
                          {zh ? "关联工单" : "Ticket"}: {selectedTicketContext.ticketTitle}
                        </div>
                        <div>
                          {zh ? "工单类型" : "Category"}: {selectedTicketContext.ticketCategoryName}
                        </div>
                        <div>
                          {zh ? "可选模板数" : "Template Options"}: {selectedTemplateOptions.length}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block">{zh ? "来源模板（可选）" : "Source Template (Optional)"}</span>
                    <select
                      value={editForm.sourceTemplateId}
                      onChange={(event) => setEditForm((current) => ({ ...current, sourceTemplateId: event.target.value }))}
                      className="ticket-select"
                    >
                      <option value="">{zh ? "不关联模板" : "No template linked"}</option>
                      {selectedTemplateOptions.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block">{zh ? "备注" : "Note"}</span>
                    <textarea
                      rows={4}
                      value={editForm.note}
                      onChange={(event) => setEditForm((current) => ({ ...current, note: event.target.value }))}
                      className="ticket-input"
                    />
                  </label>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{selectedReport.original_filename}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(selectedReport.size_bytes)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                        <RefreshCw className="h-4 w-4" />
                        {saving === `replace:${selectedReport.id}` ? (zh ? "替换中..." : "Replacing...") : zh ? "替换文件" : "Replace File"}
                        <input
                          type="file"
                          className="hidden"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => void handleReplaceFile(selectedReport.id, event.target.files?.[0] ?? null)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleDelete(selectedReport.id, selectedReport.title)}
                        disabled={saving === `delete:${selectedReport.id}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        {saving === `delete:${selectedReport.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {zh ? "删除" : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving === `update:${selectedReport.id}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                    >
                      {saving === `update:${selectedReport.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving === `update:${selectedReport.id}` ? (zh ? "保存中..." : "Saving...") : zh ? "保存变更" : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {selectedReport.source_template ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                      {zh ? "来源模板" : "Source Template"}: {selectedReport.source_template.name}
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                    {selectedReport.note || (zh ? "暂无备注。" : "No note provided.")}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {loading ? (zh ? "加载中..." : "Loading...") : zh ? "请选择一份报告查看详情。" : "Select a report to inspect it."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
