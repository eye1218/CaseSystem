import {
  Download,
  ExternalLink,
  FileText,
  FileUp,
  Filter,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { createReport, deleteReport, listReports, replaceReportFile, updateReport } from "../api/reports";
import { getTicketDetail } from "../api/tickets";
import DateRangePicker from "../components/DateRangePicker";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { ReportSummary, ReportTemplateSummary } from "../types/report";
import { formatApiDateTime } from "../utils/datetime";
import { formatFileSize } from "../utils/files";

const CATEGORY_OPTIONS = [
  { id: "intrusion", zh: "入侵检测", en: "Intrusion Detection" },
  { id: "network", zh: "网络攻击", en: "Network Attack" },
  { id: "data", zh: "数据安全", en: "Data Security" },
  { id: "endpoint", zh: "终端安全", en: "Endpoint Security" },
  { id: "phishing", zh: "网络钓鱼", en: "Phishing" },
];

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

type DrawerMode = "detail" | "create" | null;

function emptyCreateForm(): ReportFormState {
  return {
    ticketId: "",
    title: "",
    reportType: "",
    note: "",
    sourceTemplateId: "",
    file: null,
  };
}

function buildTemplateOptions(
  templates: ReportTemplateSummary[],
  currentTemplateId?: string | null,
  currentTemplateName?: string | null,
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
      updated_at: "",
    });
  }
  return items;
}

function toggleSelection<T extends string>(current: T[], value: T) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function isWithinDateRange(value: string, start: string, end: string) {
  if (!start && !end) {
    return true;
  }
  const anchor = new Date(value).getTime();
  if (Number.isNaN(anchor)) {
    return false;
  }
  if (start) {
    const floor = new Date(`${start}T00:00:00`).getTime();
    if (!Number.isNaN(floor) && anchor < floor) {
      return false;
    }
  }
  if (end) {
    const ceiling = new Date(`${end}T23:59:59`).getTime();
    if (!Number.isNaN(ceiling) && anchor > ceiling) {
      return false;
    }
  }
  return true;
}

function localizedCategory(categoryId: string, categoryName: string, language: "zh" | "en") {
  return CATEGORY_OPTIONS.find((item) => item.id === categoryId)?.[language] ?? categoryName;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FilterToggleGroup({
  options,
  selectedValues,
  onToggle,
}: {
  options: Array<{ value: string; label: string }>;
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selectedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DrawerSectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{title}</span>
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      <div className="text-sm text-slate-800 dark:text-slate-200">{children}</div>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const zh = language === "zh";
  const canManageReports = user?.active_role !== "CUSTOMER";
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedReportId = searchParams.get("reportId");

  const [items, setItems] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [createForm, setCreateForm] = useState<ReportFormState>(emptyCreateForm());
  const [editForm, setEditForm] = useState<ReportEditState>({
    title: "",
    reportType: "",
    note: "",
    sourceTemplateId: "",
  });
  const [uploadTicketContext, setUploadTicketContext] = useState<TicketTemplateContext | null>(null);
  const [selectedTicketContext, setSelectedTicketContext] = useState<TicketTemplateContext | null>(null);
  const [uploadLookupLoading, setUploadLookupLoading] = useState(false);
  const [selectedLookupLoading, setSelectedLookupLoading] = useState(false);
  const [uploadLookupError, setUploadLookupError] = useState("");
  const [selectedLookupError, setSelectedLookupError] = useState("");
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedReport = items.find((item) => item.id === selectedId) ?? null;

  const filteredItems = useMemo(() => {
    const normalizedSearch = ticketSearch.trim();
    return items.filter((item) => {
      if (normalizedSearch && !String(item.ticket_id).includes(normalizedSearch)) {
        return false;
      }
      if (filterCategoryIds.length > 0 && !filterCategoryIds.includes(item.ticket_category_id)) {
        return false;
      }
      if (!isWithinDateRange(item.ticket_created_at, dateRange.start, dateRange.end)) {
        return false;
      }
      return true;
    });
  }, [dateRange.end, dateRange.start, filterCategoryIds, items, ticketSearch]);

  async function fetchTicketTemplateContext(ticketId: string): Promise<TicketTemplateContext | null> {
    const trimmed = ticketId.trim();
    if (!trimmed || Number.isNaN(Number(trimmed))) {
      return null;
    }

    const detail = await getTicketDetail(trimmed);
    return {
      ticketTitle: detail.ticket.title,
      ticketCategoryName: detail.ticket.category_name,
      templates: detail.report_templates,
    };
  }

  async function loadReports(preferredSelectedId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const payload = await listReports();
      setItems(payload.items);
      setSelectedId((current) => {
        const target = preferredSelectedId ?? requestedReportId ?? current;
        if (target && payload.items.some((item) => item.id === target)) {
          return target;
        }
        return payload.items[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports(requestedReportId);
  }, []);

  useEffect(() => {
    if (!requestedReportId || !items.some((item) => item.id === requestedReportId)) {
      return;
    }
    setSelectedId(requestedReportId);
    setDrawerMode("detail");
  }, [items, requestedReportId]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (drawerMode === "detail" && selectedId) {
      nextParams.set("reportId", selectedId);
    } else {
      nextParams.delete("reportId");
    }
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [drawerMode, searchParams, selectedId, setSearchParams]);

  useEffect(() => {
    if (!selectedId || drawerMode !== "detail") {
      return;
    }
    if (!filteredItems.some((item) => item.id === selectedId)) {
      setDrawerMode(null);
      setSelectedId(null);
    }
  }, [drawerMode, filteredItems, selectedId]);

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
      sourceTemplateId: selectedReport.source_template?.id ?? "",
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
  }, [canManageReports, selectedReport]);

  useEffect(() => {
    if (!canManageReports || drawerMode !== "create") {
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
  }, [canManageReports, createForm.ticketId, drawerMode, zh]);

  useEffect(() => {
    if (drawerMode && drawerScrollRef.current) {
      drawerScrollRef.current.scrollTop = 0;
    }
  }, [drawerMode, selectedId]);

  useEffect(() => {
    if (!drawerMode) {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerMode(null);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [drawerMode]);

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
      setCreateForm(emptyCreateForm());
      setUploadTicketContext(null);
      await loadReports(created.id);
      setDrawerMode("detail");
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
        source_template_id: editForm.sourceTemplateId || null,
      });
      await loadReports(selectedReport.id);
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
      await loadReports(reportId);
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Failed to replace report file");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(reportId: string, reportTitle: string) {
    const confirmed = window.confirm(
      zh ? `确认永久删除报告《${reportTitle}》吗？` : `Delete report "${reportTitle}" permanently?`,
    );
    if (!confirmed) {
      return;
    }

    setSaving(`delete:${reportId}`);
    setError("");
    try {
      await deleteReport(reportId);
      setDrawerMode(null);
      setSelectedId(null);
      await loadReports();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete report");
    } finally {
      setSaving(null);
    }
  }

  function handleOpenCreateDrawer() {
    setError("");
    setCreateForm(emptyCreateForm());
    setUploadTicketContext(null);
    setUploadLookupError("");
    setDrawerMode("create");
  }

  function handleOpenDetailDrawer(reportId: string) {
    setSelectedId(reportId);
    setDrawerMode("detail");
  }

  const selectedTemplateOptions = buildTemplateOptions(
    selectedTicketContext?.templates ?? [],
    selectedReport?.source_template?.id,
    selectedReport?.source_template?.name,
  );

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div>
        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-400">{zh ? "Reports / Center" : "Reports / Center"}</div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{zh ? "报告中心" : "Report Center"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {zh
            ? "参考工单中心的工作台结构，统一按工单维度查看报告，支持按工单 ID、工单类别和工单创建时间筛选。"
            : "Use a ticket-center style workspace to browse reports by ticket, with filters for ticket ID, category, and ticket creation time."}
        </p>
      </div>

      <section className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={ticketSearch}
                onChange={(event) => setTicketSearch(event.target.value)}
                placeholder={zh ? "搜索工单 ID" : "Search by ticket ID"}
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  showFilters || filterCategoryIds.length > 0 || Boolean(dateRange.start || dateRange.end)
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Filter className="h-4 w-4" />
                {zh ? "筛选" : "Filter"}
              </button>

              <button
                type="button"
                onClick={() => void loadReports(selectedId)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                {zh ? "刷新" : "Refresh"}
              </button>

              {canManageReports ? (
                <button
                  type="button"
                  onClick={handleOpenCreateDrawer}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <FileUp className="h-4 w-4" />
                  {zh ? "上传报告" : "Upload"}
                </button>
              ) : null}
            </div>
          </div>

          {showFilters ? (
            <div className="mb-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 dark:border-slate-800 dark:bg-slate-950/40">
              <FilterField label={zh ? "工单类别" : "Ticket Category"}>
                <FilterToggleGroup
                  options={CATEGORY_OPTIONS.map((category) => ({
                    value: category.id,
                    label: category[language],
                  }))}
                  selectedValues={filterCategoryIds}
                  onToggle={(value) => setFilterCategoryIds((current) => toggleSelection(current, value))}
                />
              </FilterField>

              <FilterField label={zh ? "工单创建时间" : "Ticket Created Range"}>
                <DateRangePicker
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  onChange={(start, end) => setDateRange({ start, end })}
                />
              </FilterField>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div>
              {zh ? `当前展示 ${filteredItems.length} / ${items.length} 份报告` : `Showing ${filteredItems.length} / ${items.length} reports`}
            </div>
            <div>{zh ? "点击表格行可在右侧打开报告抽屉" : "Click a row to open the report drawer"}</div>
          </div>

          <div className="min-h-0 overflow-visible">
            <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="max-h-[calc(100vh-19rem)] overflow-auto">
                <table className="min-w-[1220px] w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      {[
                        zh ? "工单 ID" : "Ticket ID",
                        zh ? "报告标题" : "Report Title",
                        zh ? "工单类别" : "Category",
                        zh ? "报告类型" : "Type",
                        zh ? "文件信息" : "File",
                        zh ? "上传人" : "Uploader",
                        zh ? "更新时间" : "Updated",
                        zh ? "操作" : "Actions",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-left">
                          <span className="inline-flex items-center whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {label}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="bg-white dark:bg-slate-900">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                          {zh ? "正在加载报告..." : "Loading reports..."}
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                          {zh ? "当前筛选条件下没有报告。" : "No reports match the current filters."}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((report, index) => {
                        const active = drawerMode === "detail" && selectedId === report.id;
                        return (
                          <tr
                            key={report.id}
                            onClick={() => handleOpenDetailDrawer(report.id)}
                            className={`cursor-pointer border-b border-slate-100 text-sm transition-colors dark:border-slate-800 ${
                              active
                                ? "border-l-2 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20"
                                : index % 2 === 0
                                  ? "bg-white hover:bg-blue-50/40 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                                  : "bg-slate-50/70 hover:bg-blue-50/40 dark:bg-slate-950/40 dark:hover:bg-slate-800/70"
                            }`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-mono">
                              <Link
                                to={`/tickets/${report.ticket_id}`}
                                onClick={(event) => event.stopPropagation()}
                                className="text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                #{report.ticket_id}
                              </Link>
                            </td>

                            <td className="px-4 py-3">
                              <div className="max-w-[280px] truncate font-medium text-slate-900 dark:text-white" title={report.title}>
                                {report.title}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                {zh ? "工单创建于" : "Ticket created"} {formatApiDateTime(report.ticket_created_at, language)}
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                              <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
                                {localizedCategory(report.ticket_category_id, report.ticket_category_name, language)}
                              </span>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                              <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                                {report.report_type}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <div className="max-w-[220px] truncate text-slate-700 dark:text-slate-200" title={report.original_filename}>
                                {report.original_filename}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{formatFileSize(report.size_bytes)}</div>
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{report.uploaded_by}</td>

                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                              {formatApiDateTime(report.updated_at, language)}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                                <a
                                  href={report.download_path}
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {zh ? "下载" : "Download"}
                                </a>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenDetailDrawer(report.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  {zh ? "详情" : "Detail"}
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
        </div>

        {drawerMode ? (
          <div className="w-full xl:sticky xl:top-[5.5rem] xl:w-[430px] xl:flex-shrink-0">
            <div
              className={`w-full transition-[opacity,transform] duration-300 ${
                drawerMode ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0"
              }`}
            >
              <div className="flex max-h-[calc(100vh-7rem)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {drawerMode === "create" ? (
                  <>
                    <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 border-l-4 border-l-blue-500 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                          {zh ? "上传抽屉" : "Upload Drawer"}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{zh ? "上传报告" : "Upload Report"}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrawerMode(null)}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div ref={drawerScrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                      <form onSubmit={handleCreate} className="space-y-5">
                        <div>
                          <DrawerSectionTitle title={zh ? "上传表单" : "Upload Form"} />
                          <div className="space-y-4">
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

                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                              <span className="mb-2 block">{zh ? "报告文件" : "Report File"}</span>
                              <input
                                required
                                type="file"
                                onChange={(event) => setCreateForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                                className="ticket-input file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:text-blue-600"
                              />
                            </label>

                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                              <span className="mb-2 block">{zh ? "备注" : "Note"}</span>
                              <textarea
                                rows={4}
                                value={createForm.note}
                                onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))}
                                className="ticket-input"
                              />
                            </label>
                          </div>
                        </div>

                        <div>
                          <DrawerSectionTitle title={zh ? "工单上下文" : "Ticket Context"} />
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
                            {uploadLookupLoading ? (
                              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {zh ? "正在获取工单模板..." : "Loading ticket templates..."}
                              </div>
                            ) : uploadLookupError ? (
                              <div className="text-red-600 dark:text-red-300">{uploadLookupError}</div>
                            ) : uploadTicketContext ? (
                              <div className="grid gap-3">
                                <DrawerField label={zh ? "工单标题" : "Ticket Title"}>{uploadTicketContext.ticketTitle}</DrawerField>
                                <DrawerField label={zh ? "工单类别" : "Ticket Category"}>{uploadTicketContext.ticketCategoryName}</DrawerField>
                                <DrawerField label={zh ? "可用模板数" : "Available Templates"}>
                                  {String(uploadTicketContext.templates.length)}
                                </DrawerField>
                              </div>
                            ) : (
                              <div className="text-slate-500 dark:text-slate-400">
                                {zh ? "输入工单 ID 后，会自动加载该工单可关联的模板。" : "Enter a ticket ID to load available templates for that ticket."}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => setDrawerMode(null)}
                            className="rounded-lg px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {zh ? "关闭" : "Close"}
                          </button>
                          <button
                            type="submit"
                            disabled={saving === "create"}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                          >
                            {saving === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving === "create" ? (zh ? "上传中..." : "Uploading...") : zh ? "上传报告" : "Upload Report"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </>
                ) : selectedReport ? (
                  <>
                    <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 border-l-4 border-l-blue-500 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-slate-400 dark:text-slate-500">#{selectedReport.ticket_id}</span>
                          <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {localizedCategory(
                              selectedReport.ticket_category_id,
                              selectedReport.ticket_category_name,
                              language,
                            )}
                          </span>
                          <span className="inline-flex rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                            {selectedReport.report_type}
                          </span>
                        </div>
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{selectedReport.title}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrawerMode(null)}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div ref={drawerScrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                      <div className="space-y-5">
                        <div>
                          <DrawerSectionTitle title={zh ? "报告概览" : "Report Overview"} />
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                            {selectedReport.note || (zh ? "暂无备注。" : "No note provided.")}
                          </div>
                        </div>

                        <div>
                          <DrawerSectionTitle title={zh ? "关联工单" : "Linked Ticket"} />
                          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                            <DrawerField label={zh ? "工单 ID" : "Ticket ID"}>
                              <Link
                                to={`/tickets/${selectedReport.ticket_id}`}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                #{selectedReport.ticket_id}
                              </Link>
                            </DrawerField>
                            <DrawerField label={zh ? "工单类别" : "Category"}>
                              {localizedCategory(
                                selectedReport.ticket_category_id,
                                selectedReport.ticket_category_name,
                                language,
                              )}
                            </DrawerField>
                            <DrawerField label={zh ? "工单标题" : "Ticket Title"}>
                              {selectedTicketContext?.ticketTitle ?? "-"}
                            </DrawerField>
                            <DrawerField label={zh ? "工单创建时间" : "Ticket Created"}>
                              {formatApiDateTime(selectedReport.ticket_created_at, language)}
                            </DrawerField>
                          </div>
                        </div>

                        <div>
                          <DrawerSectionTitle title={zh ? "文件信息" : "File Info"} />
                          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                            <DrawerField label={zh ? "文件名" : "Filename"}>{selectedReport.original_filename}</DrawerField>
                            <DrawerField label={zh ? "文件大小" : "File Size"}>{formatFileSize(selectedReport.size_bytes)}</DrawerField>
                            <DrawerField label={zh ? "上传人" : "Uploaded By"}>{selectedReport.uploaded_by}</DrawerField>
                            <DrawerField label={zh ? "来源模板" : "Source Template"}>
                              {selectedReport.source_template?.name ?? "-"}
                            </DrawerField>
                            <DrawerField label={zh ? "创建时间" : "Created"}>
                              {formatApiDateTime(selectedReport.created_at, language)}
                            </DrawerField>
                            <DrawerField label={zh ? "更新时间" : "Updated"}>
                              {formatApiDateTime(selectedReport.updated_at, language)}
                            </DrawerField>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <a
                              href={selectedReport.download_path}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Download className="h-4 w-4" />
                              {zh ? "下载文件" : "Download File"}
                            </a>

                            {canManageReports ? (
                              <>
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                                  {saving === `replace:${selectedReport.id}` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                  {saving === `replace:${selectedReport.id}` ? (zh ? "替换中..." : "Replacing...") : zh ? "替换文件" : "Replace File"}
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                      void handleReplaceFile(selectedReport.id, event.target.files?.[0] ?? null)
                                    }
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => void handleDelete(selectedReport.id, selectedReport.title)}
                                  disabled={saving === `delete:${selectedReport.id}`}
                                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                                >
                                  {saving === `delete:${selectedReport.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  {zh ? "删除" : "Delete"}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {canManageReports ? (
                          <form onSubmit={handleUpdate} className="space-y-4">
                            <DrawerSectionTitle title={zh ? "编辑元信息" : "Edit Metadata"} />

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

                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
                              {selectedLookupLoading ? (
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {zh ? "正在获取工单模板..." : "Loading ticket templates..."}
                                </div>
                              ) : selectedLookupError ? (
                                <div className="text-red-600 dark:text-red-300">{selectedLookupError}</div>
                              ) : selectedTicketContext ? (
                                <div className="grid gap-3">
                                  <DrawerField label={zh ? "工单标题" : "Ticket Title"}>{selectedTicketContext.ticketTitle}</DrawerField>
                                  <DrawerField label={zh ? "模板选项数" : "Template Options"}>
                                    {String(selectedTemplateOptions.length)}
                                  </DrawerField>
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

                            <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700">
                              <button
                                type="submit"
                                disabled={saving === `update:${selectedReport.id}`}
                                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                              >
                                {saving === `update:${selectedReport.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {saving === `update:${selectedReport.id}` ? (zh ? "保存中..." : "Saving...") : zh ? "保存变更" : "Save Changes"}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                      <button
                        type="button"
                        onClick={() => setDrawerMode(null)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                        {zh ? "关闭" : "Close"}
                      </button>

                      <Link
                        to={`/tickets/${selectedReport.ticket_id}`}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {zh ? "查看工单" : "Open Ticket"}
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                    {zh ? "请选择报告" : "Select a report"}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
