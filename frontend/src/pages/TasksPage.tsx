import {
  ArrowUpRight,
  CalendarRange,
  Filter,
  ListFilter,
  Radio,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { getTaskInstance, listTaskInstances, retryTaskInstance } from "../api/tasks";
import {
  getTaskStatusLabel,
  getTaskStatusPalette,
  getTaskTypeLabel,
  taskStatusOptions,
  taskTypeOptions,
} from "../constants/tasks";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { TaskExecutionLog, TaskInstanceDetail, TaskInstanceSummary } from "../types/task";
import { formatApiDateTime, parseApiDate } from "../utils/datetime";

function TaskStatusBadge({
  status,
  language,
}: {
  status: TaskInstanceSummary["status"];
  language: "zh" | "en";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${getTaskStatusPalette(
        status,
      )}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {getTaskStatusLabel(status, language)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "blue" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300"
          : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function JsonPanel({
  title,
  payload,
  language,
}: {
  title: string;
  payload: Record<string, unknown> | null;
  language: "zh" | "en";
}) {
  const hasContent = payload && Object.keys(payload).length > 0;
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        {title}
      </h3>
      {hasContent ? (
        <pre className="max-h-52 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100 dark:border-slate-700">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
          {language === "zh" ? "暂无可展示内容" : "No content available"}
        </div>
      )}
    </section>
  );
}

function findLatestSummary(
  logs: TaskExecutionLog[],
  field: "rendered_summary" | "response_summary",
): Record<string, unknown> | null {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const candidate = logs[index][field];
    if (candidate && Object.keys(candidate).length > 0) {
      return candidate;
    }
  }
  return null;
}

function readLatestResult(item: TaskInstanceSummary, language: "zh" | "en") {
  const response = item.latest_result.response;
  if (response && typeof response === "object") {
    const record = response as Record<string, unknown>;
    if (typeof record.status_code === "number") {
      return `HTTP ${record.status_code}`;
    }
    if (typeof record.accepted === "number") {
      return language === "zh" ? `已接受 ${record.accepted}` : `Accepted ${record.accepted}`;
    }
    if (typeof record.provider === "string") {
      return record.provider;
    }
  }
  if (item.error_message) {
    return item.error_message;
  }
  return language === "zh" ? "待执行" : "Pending";
}

function toDateInputValue(value: string | null | undefined) {
  const parsed = parseApiDate(value);
  if (!parsed) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinDateRange(item: TaskInstanceSummary, startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return true;
  }
  const anchor = parseApiDate(item.started_at ?? item.created_at);
  if (!anchor) {
    return false;
  }

  if (startDate) {
    const floor = new Date(`${startDate}T00:00:00`);
    if (anchor < floor) {
      return false;
    }
  }

  if (endDate) {
    const ceiling = new Date(`${endDate}T23:59:59`);
    if (anchor > ceiling) {
      return false;
    }
  }

  return true;
}

export default function TasksPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const zh = language === "zh";

  const [items, setItems] = useState<TaskInstanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceEventFilter, setSourceEventFilter] = useState("all");
  const [taskTemplateFilter, setTaskTemplateFilter] = useState("all");
  const [ticketIdFilter, setTicketIdFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskInstanceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  async function loadTasks() {
    setLoading(true);
    setError("");
    try {
      const response = await listTaskInstances();
      startTransition(() => setItems(response.items));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTaskDetail() {
      if (!selectedTaskId) {
        setSelectedTask(null);
        return;
      }

      setDetailLoading(true);
      try {
        const detail = await getTaskInstance(selectedTaskId);
        if (!cancelled) {
          setSelectedTask(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load task detail");
          setSelectedTask(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadTaskDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  const deferredSearch = useDeferredValue(search);
  const keyword = deferredSearch.trim().toLowerCase();
  const normalizedTicketIdFilter = ticketIdFilter.trim();

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !keyword ||
      item.id.toLowerCase().includes(keyword) ||
      item.task_name.toLowerCase().includes(keyword) ||
      (item.ticket_id !== null && String(item.ticket_id).includes(keyword));
    const matchesTaskType = taskTypeFilter === "all" || item.task_type === taskTypeFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesSourceEvent =
      sourceEventFilter === "all" || item.source_event_id === sourceEventFilter;
    const matchesTaskTemplate =
      taskTemplateFilter === "all" || item.task_template_id === taskTemplateFilter;
    const matchesTicketId =
      !normalizedTicketIdFilter ||
      (item.ticket_id !== null && String(item.ticket_id).includes(normalizedTicketIdFilter));
    const matchesFailure = !failedOnly || item.status === "FAILED";
    return (
      matchesSearch &&
      matchesTaskType &&
      matchesStatus &&
      matchesSourceEvent &&
      matchesTaskTemplate &&
      matchesTicketId &&
      matchesFailure &&
      isWithinDateRange(item, startDate, endDate)
    );
  });

  const taskTemplateOptions = Array.from(
    new Map(
      items
        .filter((item) => item.task_template_id)
        .map((item) => [
          item.task_template_id as string,
          { value: item.task_template_id as string, label: item.task_name },
        ]),
    ).values(),
  );
  const sourceEventOptions = Array.from(
    new Set(items.map((item) => item.source_event_id).filter((value): value is string => Boolean(value))),
  );

  const selectedRenderedSummary =
    selectedTask && typeof selectedTask.latest_result.rendered === "object"
      ? (selectedTask.latest_result.rendered as Record<string, unknown>)
      : selectedTask
        ? findLatestSummary(selectedTask.logs, "rendered_summary")
        : null;
  const selectedResponseSummary =
    selectedTask && typeof selectedTask.latest_result.response === "object"
      ? (selectedTask.latest_result.response as Record<string, unknown>)
      : selectedTask
        ? findLatestSummary(selectedTask.logs, "response_summary")
        : null;

  async function handleRetry(taskId: string) {
    setActionTaskId(taskId);
    setError("");
    try {
      const detail = await retryTaskInstance(taskId);
      await loadTasks();
      setSelectedTaskId(detail.id);
    } catch (retryError) {
      if (retryError instanceof ApiError) {
        setError(retryError.message);
      } else {
        setError(retryError instanceof Error ? retryError.message : "Failed to retry task");
      }
    } finally {
      setActionTaskId(null);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Radio className="h-3.5 w-3.5" />
            <span>{zh ? "任务中心" : "Task Center"}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {zh ? "任务执行工作台" : "Task Execution Workspace"}
          </h1>
          <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            {zh
              ? "统一查看 Event 触发后的任务实例，支持失败筛选、详情抽屉、执行日志回溯和人工重试。"
              : "Track Event-triggered task instances in one place, with dense table filters, execution detail drawer, and manual retry for failures."}
          </p>
        </div>
        <button
          onClick={() => void loadTasks()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          label={zh ? "任务总数" : "Total Tasks"}
          value={String(filteredItems.length)}
          tone="slate"
        />
        <SummaryCard
          label={zh ? "执行中" : "Running"}
          value={String(filteredItems.filter((item) => item.status === "RUNNING").length)}
          tone="blue"
        />
        <SummaryCard
          label={zh ? "成功" : "Success"}
          value={String(filteredItems.filter((item) => item.status === "SUCCESS").length)}
          tone="emerald"
        />
        <SummaryCard
          label={zh ? "失败" : "Failed"}
          value={String(filteredItems.filter((item) => item.status === "FAILED").length)}
          tone="rose"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
          <ListFilter className="h-4 w-4 text-blue-500" />
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {zh ? "筛选器" : "Filters"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 xl:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {zh ? "关键词" : "Keyword"}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={zh ? "任务 ID / 名称 / 工单 ID" : "Task ID / name / ticket ID"}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </label>

          <FilterSelect
            label={zh ? "任务类型" : "Task Type"}
            value={taskTypeFilter}
            onChange={setTaskTypeFilter}
            options={[
              { label: zh ? "全部类型" : "All Types", value: "all" },
              ...taskTypeOptions.map((option) => ({
                label: option[language],
                value: option.value,
              })),
            ]}
          />

          <FilterSelect
            label={zh ? "执行状态" : "Status"}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: zh ? "全部状态" : "All Statuses", value: "all" },
              ...taskStatusOptions.map((option) => ({
                label: option[language],
                value: option.value,
              })),
            ]}
          />

          <FilterSelect
            label={zh ? "来源 Event" : "Source Event"}
            value={sourceEventFilter}
            onChange={setSourceEventFilter}
            options={[
              { label: zh ? "全部来源" : "All Sources", value: "all" },
              ...sourceEventOptions.map((value) => ({ label: value, value })),
            ]}
          />

          <FilterSelect
            label={zh ? "任务模板" : "Task Template"}
            value={taskTemplateFilter}
            onChange={setTaskTemplateFilter}
            options={[
              { label: zh ? "全部模板" : "All Templates", value: "all" },
              ...taskTemplateOptions,
            ]}
          />

          <label className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {zh ? "关联工单" : "Ticket ID"}
            </span>
            <input
              value={ticketIdFilter}
              onChange={(event) => setTicketIdFilter(event.target.value)}
              placeholder={zh ? "例如 1001" : "e.g. 1001"}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>

          <div className="space-y-1 xl:col-span-2">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <CalendarRange className="h-3.5 w-3.5" />
              <span>{zh ? "开始日期范围" : "Start Date Range"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(event) => setFailedOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{zh ? "只看失败任务" : "Failed only"}</span>
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className={`grid items-start gap-5 ${selectedTaskId ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "grid-cols-1"}`}>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "任务实例表" : "Task Table"}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {zh ? `共 ${filteredItems.length} 条` : `${filteredItems.length} items`}
            </span>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-sm text-slate-500 dark:text-slate-400">
              {zh ? "正在加载任务实例…" : "Loading task instances..."}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {zh ? "当前筛选条件下没有任务实例" : "No task instances match the current filters"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {[
                      zh ? "任务 ID" : "Task ID",
                      zh ? "任务名称" : "Task Name",
                      zh ? "类型" : "Type",
                      zh ? "来源 Event" : "Source Event",
                      zh ? "关联工单" : "Ticket",
                      zh ? "目标摘要" : "Target",
                      zh ? "状态" : "Status",
                      zh ? "开始 / 结束时间" : "Started / Finished",
                      zh ? "最近结果" : "Latest Result",
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
                    const active = item.id === selectedTaskId;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedTaskId(item.id)}
                        className={`cursor-pointer transition-colors ${
                          active
                            ? "bg-blue-50/70 dark:bg-blue-950/20"
                            : "hover:bg-slate-50 dark:hover:bg-slate-900/40"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1">
                            <code className="text-[11px] text-slate-600 dark:text-slate-300">{item.id}</code>
                            {item.retry_of_task_id ? (
                              <p className="text-[10px] text-amber-600 dark:text-amber-300">
                                {zh ? "重试实例" : "Retry instance"}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1">
                            <p className="text-xs text-slate-800 dark:text-slate-100">{item.task_name}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              {item.task_template_id ?? (zh ? "模板快照缺失" : "Missing template reference")}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="text-xs text-slate-700 dark:text-slate-200">
                            {getTaskTypeLabel(item.task_type, language)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <code className="text-[11px] text-slate-600 dark:text-slate-300">
                            {item.source_event_id ?? "-"}
                          </code>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {item.ticket_id ? (
                            <Link
                              to={`/tickets/${item.ticket_id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                            >
                              #{item.ticket_id}
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                          )}
                        </td>
                        <td className="max-w-[240px] px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                          <div className="line-clamp-2">{item.target_summary || "-"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <TaskStatusBadge status={item.status} language={language} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <p>{formatApiDateTime(item.started_at ?? item.created_at, language)}</p>
                            <p>{formatApiDateTime(item.finished_at, language)}</p>
                          </div>
                        </td>
                        <td className="max-w-[180px] px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                          <div className="line-clamp-2">{readLatestResult(item, language)}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedTaskId(item.id);
                              }}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              {zh ? "详情" : "Detail"}
                            </button>
                            {item.status === "FAILED" ? (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRetry(item.id);
                                }}
                                disabled={actionTaskId === item.id}
                                className="rounded-lg border border-amber-200 px-2.5 py-1 text-[11px] text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800/40 dark:text-amber-300 dark:hover:bg-amber-900/20"
                              >
                                {actionTaskId === item.id ? (zh ? "重试中…" : "Retrying...") : zh ? "重试" : "Retry"}
                              </button>
                            ) : null}
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

        {selectedTaskId ? (
          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/80">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  {zh ? "任务详情抽屉" : "Task Detail Drawer"}
                </p>
                <h2 className="mt-1 truncate text-sm text-slate-800 dark:text-slate-100">
                  {selectedTask?.task_name ?? selectedTaskId}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading || !selectedTask ? (
              <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">
                {zh ? "正在加载任务详情…" : "Loading task detail..."}
              </div>
            ) : (
              <div className="space-y-5 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TaskStatusBadge status={selectedTask.status} language={language} />
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                    {getTaskTypeLabel(selectedTask.task_type, language)}
                  </span>
                  {selectedTask.retry_of_task_id ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
                      {zh ? "来自失败重试" : "Retry from failure"}
                    </span>
                  ) : null}
                </div>

                <section className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-700 dark:bg-slate-900/30">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {zh ? "来源 Event" : "Source Event"}
                    </p>
                    <p className="mt-1 break-all text-slate-700 dark:text-slate-200">
                      {selectedTask.source_event_id ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {zh ? "Binding ID" : "Binding ID"}
                    </p>
                    <p className="mt-1 break-all text-slate-700 dark:text-slate-200">
                      {selectedTask.source_binding_id ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {zh ? "关联工单" : "Ticket"}
                    </p>
                    {selectedTask.ticket_id ? (
                      <Link
                        to={`/tickets/${selectedTask.ticket_id}`}
                        className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                      >
                        #{selectedTask.ticket_id}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <p className="mt-1 text-slate-700 dark:text-slate-200">-</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {zh ? "操作人" : "Operator"}
                    </p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      {selectedTask.operator_name ?? "-"}
                    </p>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    {zh ? "任务模板快照" : "Task Template Snapshot"}
                  </h3>
                  <div className="rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-800 dark:text-slate-100">
                          {String(selectedTask.template_snapshot.name ?? "-")}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                          {String(selectedTask.template_snapshot.id ?? "-")}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                        {getTaskTypeLabel(
                          String(selectedTask.template_snapshot.task_type ?? selectedTask.task_type) as TaskInstanceSummary["task_type"],
                          language,
                        )}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {zh ? "模板状态" : "Template Status"}
                        </p>
                        <p className="mt-1 text-slate-700 dark:text-slate-200">
                          {String(selectedTask.template_snapshot.status ?? "-")}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {zh ? "引用模板" : "Reference Template"}
                        </p>
                        <p className="mt-1 break-all text-slate-700 dark:text-slate-200">
                          {String(selectedTask.template_snapshot.reference_template_id ?? "-")}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-2 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                  <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    {zh ? "执行结果摘要" : "Execution Summary"}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {zh ? "目标摘要" : "Target"}
                      </p>
                      <p className="mt-1 break-words text-slate-700 dark:text-slate-200">
                        {selectedTask.target_summary || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {zh ? "开始 / 结束" : "Started / Finished"}
                      </p>
                      <p className="mt-1 text-slate-700 dark:text-slate-200">
                        {formatApiDateTime(selectedTask.started_at ?? selectedTask.created_at, language)}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {formatApiDateTime(selectedTask.finished_at, language)}
                      </p>
                    </div>
                  </div>
                </section>

                {selectedTask.error_message ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">
                      {zh ? "错误信息" : "Error"}
                    </p>
                    <p className="mt-1">{selectedTask.error_message}</p>
                  </div>
                ) : null}

                <JsonPanel
                  title={zh ? "渲染结果摘要" : "Rendered Summary"}
                  payload={selectedRenderedSummary}
                  language={language}
                />
                <JsonPanel
                  title={zh ? "第三方响应摘要" : "Third-party Response"}
                  payload={selectedResponseSummary}
                  language={language}
                />

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      {zh ? "执行日志时间线" : "Execution Timeline"}
                    </h3>
                    {selectedTask.status === "FAILED" ? (
                      <button
                        onClick={() => void handleRetry(selectedTask.id)}
                        disabled={actionTaskId === selectedTask.id}
                        className="rounded-lg border border-amber-200 px-3 py-1.5 text-[11px] text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800/40 dark:text-amber-300 dark:hover:bg-amber-900/20"
                      >
                        {actionTaskId === selectedTask.id ? (zh ? "重试中…" : "Retrying...") : zh ? "重试任务" : "Retry Task"}
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {selectedTask.logs.map((log, index) => (
                      <div key={log.id} className="relative rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                        {index < selectedTask.logs.length - 1 ? (
                          <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-slate-200 dark:bg-slate-700" />
                        ) : null}
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-800 dark:text-slate-100">{log.stage}</span>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                {formatApiDateTime(log.created_at, language)}
                              </span>
                              {log.actor_name ? (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {log.actor_name}
                                </span>
                              ) : null}
                            </div>
                            {log.error_message ? (
                              <p className="text-[11px] text-rose-600 dark:text-rose-300">
                                {log.error_message}
                              </p>
                            ) : null}
                            {Object.keys(log.response_summary).length > 0 ? (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {JSON.stringify(log.response_summary)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {user?.active_role === "ADMIN" && selectedTask.source_event_id ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      {zh ? "上游规则" : "Upstream Rule"}
                    </p>
                    <Link
                      to={`/events/${selectedTask.source_event_id}`}
                      className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                    >
                      {selectedTask.source_event_id}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
