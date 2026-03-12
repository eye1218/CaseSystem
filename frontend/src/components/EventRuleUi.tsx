import { Bell, ChevronRight, Clock3, Radio, Timer, Zap } from "lucide-react";
import type { ReactNode } from "react";

import {
  buildEventSummaryStats,
  formatEventTriggerSummary,
  getEventStatusLabel,
  getEventTypeLabel,
  getTaskGroupLabel,
  toEventRulePreviewLines,
} from "../constants/eventRules";
import type { EventRuleDetail, EventRuleStatus, EventRuleType, EventTaskTemplate, EventTriggerPoint, EventRuleTimeRule } from "../types/event";

export function EventTypeBadge({
  eventType,
  language,
}: {
  eventType: EventRuleType;
  language: "zh" | "en";
}) {
  if (eventType === "normal") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
        <Zap className="h-3 w-3" />
        {getEventTypeLabel(eventType, language)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] text-violet-700 dark:border-violet-800/40 dark:bg-violet-900/20 dark:text-violet-300">
      <Timer className="h-3 w-3" />
      {getEventTypeLabel(eventType, language)}
    </span>
  );
}

export function EventStatusBadge({
  status,
  language,
}: {
  status: EventRuleStatus;
  language: "zh" | "en";
}) {
  const palette =
    status === "enabled"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
      : status === "draft"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"
        : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400";

  const dotColor =
    status === "enabled" ? "bg-emerald-500" : status === "draft" ? "bg-amber-500" : "bg-slate-400";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${palette}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {getEventStatusLabel(status, language)}
    </span>
  );
}

export function EventTaskGroupBadge({
  task,
  language,
}: {
  task: EventTaskTemplate;
  language: "zh" | "en";
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
      <Bell className="h-2.5 w-2.5" />
      {getTaskGroupLabel(task.group, language)}
    </span>
  );
}

export function EventSectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
        <h3 className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export function EventPreviewCard({
  detail,
  language,
}: {
  detail: Pick<EventRuleDetail, "filters" | "trigger_point" | "time_rule" | "event_type" | "bound_tasks">;
  language: "zh" | "en";
}) {
  const preview = toEventRulePreviewLines(detail, language);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
        <Radio className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {language === "zh" ? "规则预览" : "Rule Preview"}
        </span>
      </div>
      <div className="space-y-3 px-4 py-4 text-xs">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {language === "zh" ? "当工单满足" : "When Ticket Matches"}
          </p>
          {preview.conditionLines.length > 0 ? (
            preview.conditionLines.map((line) => (
              <div key={line} className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                <span className="mt-0.5 text-slate-400">•</span>
                <span>{line}</span>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === "zh" ? "无过滤条件，匹配所有工单" : "No filters, match all tickets"}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {language === "zh" ? "则" : "Then"}
          </p>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
            <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
            <span>{preview.triggerLine}</span>
          </div>
        </div>
        {preview.taskLines.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {language === "zh" ? `并行执行 ${preview.taskLines.length} 个任务` : `${preview.taskLines.length} Tasks in Parallel`}
            </p>
            {preview.taskLines.map((line) => (
              <div key={line} className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                <span className="mt-0.5 text-slate-400">•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EventTimingHint({
  eventType,
  triggerPoint,
  timeRule,
  language,
}: {
  eventType: EventRuleType;
  triggerPoint: EventTriggerPoint;
  timeRule: EventRuleTimeRule;
  language: "zh" | "en";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-900/20">
      <Clock3 className="h-5 w-5 flex-shrink-0 text-violet-500" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-violet-500">
          {language === "zh" ? "触发规则摘要" : "Trigger Summary"}
        </p>
        <p className="text-sm text-violet-800 dark:text-violet-200">
          {formatEventTriggerSummary(eventType, triggerPoint, timeRule, language)}
        </p>
      </div>
    </div>
  );
}

export function EventStatsCard({
  detail,
  language,
}: {
  detail: EventRuleDetail;
  language: "zh" | "en";
}) {
  const stats = buildEventSummaryStats(detail, language);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
        <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {language === "zh" ? "配置摘要" : "Config Summary"}
        </span>
      </div>
      <div className="space-y-2.5 px-4 py-3 text-[11px]">
        {stats.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2">
            <span className="text-slate-400 dark:text-slate-500">{item.label}</span>
            <span className="text-right text-slate-700 dark:text-slate-200">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
