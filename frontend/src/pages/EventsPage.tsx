import {
  Eye,
  Filter,
  Pencil,
  Plus,
  Radio,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteEventRule, listEventRules, updateEventRuleStatus } from "../api/events";
import { ApiError } from "../api/client";
import { eventStatusOptions, eventTypeOptions, getEventStatusLabel, getTriggerPointLabel } from "../constants/eventRules";
import { useLanguage } from "../contexts/LanguageContext";
import type { EventRuleStatus, EventRuleSummary, EventRuleType } from "../types/event";
import { formatApiDateTime } from "../utils/datetime";
import { EventStatusBadge, EventTypeBadge } from "../components/EventRuleUi";

export default function EventsPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const zh = language === "zh";

  const [items, setItems] = useState<EventRuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | EventRuleType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EventRuleStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await listEventRules();
        if (!cancelled) {
          startTransition(() => setItems(response.items));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load events");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const deferredSearch = useDeferredValue(search);
  const keyword = deferredSearch.trim().toLowerCase();
  const filtered = items.filter((item) => {
    const matchesSearch =
      !keyword ||
      item.name.toLowerCase().includes(keyword) ||
      item.code.toLowerCase().includes(keyword);
    const matchesType = typeFilter === "all" || item.event_type === typeFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  async function reload() {
    const response = await listEventRules();
    startTransition(() => setItems(response.items));
  }

  async function handleToggle(item: EventRuleSummary) {
    setBusyId(item.id);
    try {
      await updateEventRuleStatus(item.id, {
        status: item.status === "enabled" ? "disabled" : "enabled",
      });
      await reload();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update event");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: EventRuleSummary) {
    const confirmed = window.confirm(
      zh ? `确认删除 Event「${item.name}」？` : `Delete event rule "${item.name}"?`,
    );
    if (!confirmed) return;

    setBusyId(item.id);
    try {
      await deleteEventRule(item.id);
      await reload();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete event");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Radio className="h-3.5 w-3.5" />
            <span>{zh ? "Event 中心" : "Event Center"}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {zh ? "Event 规则管理" : "Event Rules"}
          </h1>
          <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            {zh
              ? "配置工单 Event 规则：定义触发点、过滤条件、时间策略，并异步下发绑定的任务模板。Event 模块只负责规则定义和调度，不展示任务执行状态。"
              : "Define ticket Event rules with trigger points, filters, timing strategies, and asynchronous task template dispatching. The Event module only manages rule definition and dispatching."}
          </p>
        </div>
        <button
          onClick={() => navigate("/events/new")}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {zh ? "新建 Event" : "New Event"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setTypeFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs transition-all ${
              typeFilter === "all"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {zh ? "全部类型" : "All Types"}
          </button>
          {eventTypeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTypeFilter(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                typeFilter === option.value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {option[language]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs transition-all ${
              statusFilter === "all"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {zh ? "全部状态" : "All Statuses"}
          </button>
          {eventStatusOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                statusFilter === option.value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {option[language]}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={zh ? "搜索 Event 名称 / 编码…" : "Search by name / code…"}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="ml-auto flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Filter className="h-3 w-3" />
          {zh ? "共" : "Total"} {filtered.length} {zh ? "条规则" : "rules"}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
        {zh
          ? "普通 Event 支持立即触发和延迟触发；计时 Event 统一基于工单创建时间计算目标时刻。"
          : "Normal Events support immediate and delayed dispatching. Timer Events are always computed from ticket created time."}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {zh ? "正在加载 Event 规则…" : "Loading event rules..."}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                  {[
                    zh ? "Event 名称" : "Event Name",
                    zh ? "类型" : "Type",
                    zh ? "触发点" : "Trigger Point",
                    zh ? "过滤条件摘要" : "Filter Summary",
                    zh ? "触发规则摘要" : "Trigger Summary",
                    zh ? "绑定任务" : "Tasks",
                    zh ? "状态" : "Status",
                    zh ? "更新时间" : "Updated",
                    zh ? "操作" : "Actions",
                  ].map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-4 py-3 text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Radio className="h-8 w-8 text-slate-200 dark:text-slate-700" />
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {search || typeFilter !== "all" || statusFilter !== "all"
                            ? zh
                              ? "没有匹配的 Event 规则"
                              : "No matching event rules"
                            : zh
                              ? "暂无 Event 规则，点击右上角新建"
                              : "No event rules yet. Click \"New Event\" to create one."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const disabled = busyId === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-700/20 ${
                          disabled ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/events/${item.id}`)}
                            className="text-left text-xs text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {item.name}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
                              >
                                {tag}
                              </span>
                            ))}
                            {item.tags.length > 2 ? (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">+{item.tags.length - 2}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <EventTypeBadge eventType={item.event_type} language={language} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                          {getTriggerPointLabel(item.trigger_point, language)}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <div className="line-clamp-2">{item.filter_summary}</div>
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <div className="line-clamp-2">{item.trigger_summary}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                          {item.task_template_count}
                        </td>
                        <td className="px-4 py-3">
                          <EventStatusBadge status={item.status} language={language} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                          <div>{formatApiDateTime(item.updated_at, language)}</div>
                          <div className="mt-0.5 text-[10px]">{item.updated_by}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => navigate(`/events/${item.id}`)}
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                              title={zh ? "查看详情" : "View Detail"}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => navigate(`/events/${item.id}/edit`)}
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                              title={zh ? "编辑" : "Edit"}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void handleToggle(item)}
                              disabled={disabled}
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                              title={
                                item.status === "enabled"
                                  ? zh
                                    ? "停用"
                                    : "Disable"
                                  : zh
                                    ? "启用"
                                    : "Enable"
                              }
                            >
                              {item.status === "enabled" ? (
                                <ToggleRight className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <ToggleLeft className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => void handleDelete(item)}
                              disabled={disabled}
                              className="rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              title={zh ? "删除" : "Delete"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
      )}
    </div>
  );
}
