import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Edit,
  Info,
  Radio,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteEventRule, getEventRule, updateEventRuleStatus } from "../api/events";
import {
  formatEventFilter,
  getTriggerPointLabel,
} from "../constants/eventRules";
import {
  EventPreviewCard,
  EventSectionCard,
  EventStatsCard,
  EventStatusBadge,
  EventTaskGroupBadge,
  EventTimingHint,
  EventTypeBadge,
} from "../components/EventRuleUi";
import { useLanguage } from "../contexts/LanguageContext";
import type { EventRuleDetail } from "../types/event";
import { formatApiDateTime } from "../utils/datetime";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language === "zh";

  const [detail, setDetail] = useState<EventRuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const response = await getEventRule(id);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load event");
          setDetail(null);
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
  }, [id]);

  async function handleToggle() {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await updateEventRuleStatus(detail.id, {
        status: detail.status === "enabled" ? "disabled" : "enabled",
      });
      setDetail(response);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update event");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    const confirmed = window.confirm(
      zh ? `确认删除 Event「${detail.name}」？` : `Delete event rule "${detail.name}"?`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteEventRule(detail.id);
      navigate("/events", { replace: true });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete event");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 p-6">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {zh ? "正在加载 Event 详情…" : "Loading event detail..."}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-slate-200 dark:text-slate-700" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error || (zh ? "Event 不存在或已删除" : "Event not found or deleted")}
        </p>
        <Link
          to="/events"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {zh ? "返回列表" : "Back to List"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Radio className="h-3.5 w-3.5" />
        <Link to="/events" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
          {zh ? "Event 中心" : "Event Center"}
        </Link>
        <span>/</span>
        <span className="truncate text-slate-600 dark:text-slate-300">{detail.name}</span>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/events"
              className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {zh ? "返回列表" : "Back to List"}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleToggle()}
                disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  detail.status === "enabled"
                    ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                }`}
              >
                {detail.status === "enabled" ? (
                  <ToggleRight className="h-3.5 w-3.5" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5" />
                )}
                {detail.status === "enabled" ? (zh ? "停用" : "Disable") : (zh ? "启用" : "Enable")}
              </button>
              <button
                onClick={() => navigate(`/events/${detail.id}/edit`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Edit className="h-3.5 w-3.5" />
                {zh ? "编辑" : "Edit"}
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {zh ? "删除" : "Delete"}
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="mb-1 text-2xl font-semibold leading-snug text-slate-900 dark:text-white">{detail.name}</h1>
              <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700/60 dark:text-slate-300">
                {detail.code}
              </code>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <EventTypeBadge eventType={detail.event_type} language={language} />
            <EventStatusBadge status={detail.status} language={language} />
            {detail.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>

          {detail.description ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{detail.description}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100 dark:border-slate-700/60 sm:grid-cols-4">
          {[
            [zh ? "触发对象" : "Object", zh ? "工单" : "Ticket"],
            [zh ? "触发点" : "Trigger Point", getTriggerPointLabel(detail.trigger_point, language)],
            [zh ? "最近更新" : "Updated", formatApiDateTime(detail.updated_at, language)],
            [zh ? "更新人" : "Updated By", detail.updated_by],
          ].map(([label, value]) => (
            <div
              key={label}
              className="space-y-0.5 border-r border-b border-slate-100 px-4 py-3 last:border-r-0 dark:border-slate-700/60"
            >
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <EventSectionCard
            title={zh ? "过滤条件" : "Filter Conditions"}
            subtitle={zh ? "同字段多值为 OR，不同字段之间为 AND" : "Same field values use OR, different fields use AND"}
          >
            {detail.filters.length === 0 ? (
              <p className="text-xs italic text-slate-400 dark:text-slate-500">
                {zh ? "无过滤条件，匹配所有工单" : "No filters. This rule matches all tickets."}
              </p>
            ) : (
              <div className="space-y-2">
                {detail.filters.map((filter, index) => (
                  <div key={`${filter.field}-${index}`} className="space-y-1">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/40">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700">
                        {index + 1}
                      </span>
                      <code className="text-xs text-slate-700 dark:text-slate-200">{formatEventFilter(filter, language)}</code>
                    </div>
                    {index < detail.filters.length - 1 ? (
                      <div className="flex items-center gap-2 px-3">
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700/60" />
                        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                          AND
                        </span>
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700/60" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </EventSectionCard>

          <EventSectionCard title={zh ? "触发规则" : "Trigger Rule"}>
            <div className="space-y-3">
              <EventTimingHint
                eventType={detail.event_type}
                triggerPoint={detail.trigger_point}
                timeRule={detail.time_rule}
                language={language}
              />
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
                {detail.trigger_summary}
              </div>
            </div>
          </EventSectionCard>

          <EventSectionCard
            title={zh ? "绑定任务模板" : "Bound Task Templates"}
            subtitle={zh ? "命中规则后异步并行下发，不在 Event 模块展示执行状态" : "Tasks are dispatched asynchronously in parallel. Execution state is not shown in the Event module."}
          >
            {detail.bound_tasks.length === 0 ? (
              <p className="text-xs italic text-slate-400 dark:text-slate-500">
                {zh ? "未绑定任务模板" : "No task templates bound"}
              </p>
            ) : (
              <div className="space-y-2">
                {detail.bound_tasks.map((task, index) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500 dark:bg-slate-700">
                      {index + 1}
                    </span>
                    <EventTaskGroupBadge task={task} language={language} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-800 dark:text-slate-100">{task.name}</p>
                      <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{task.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </EventSectionCard>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div className="space-y-0.5">
                <p>{zh ? "模块边界说明" : "Module Boundary"}</p>
                <p>
                  {zh
                    ? "当前版本只管理 Event 规则定义和异步下发，不展示触发运行实例、任务执行结果或复杂编排记录。"
                    : "This version only manages Event rule definition and asynchronous dispatching. Runtime instances, task results, and orchestration logs are intentionally out of scope."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <EventPreviewCard detail={detail} language={language} />
          <EventStatsCard detail={detail} language={language} />
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {zh ? "时间轴" : "Timeline"}
              </span>
            </div>
            <div className="space-y-3 text-[11px]">
              <div>
                <p className="text-slate-400 dark:text-slate-500">{zh ? "创建时间" : "Created"}</p>
                <p className="text-slate-700 dark:text-slate-200">{formatApiDateTime(detail.created_at, language)}</p>
              </div>
              <div>
                <p className="text-slate-400 dark:text-slate-500">{zh ? "创建人" : "Created By"}</p>
                <p className="text-slate-700 dark:text-slate-200">{detail.created_by}</p>
              </div>
              <div>
                <p className="text-slate-400 dark:text-slate-500">{zh ? "更新时间" : "Updated"}</p>
                <p className="text-slate-700 dark:text-slate-200">{formatApiDateTime(detail.updated_at, language)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
