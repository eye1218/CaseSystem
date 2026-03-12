import { getTicketCategory } from "./ticketCategories";
import type {
  EventFilterField,
  EventRuleDetail,
  EventRuleFilter,
  EventRuleStatus,
  EventRuleTimeRule,
  EventRuleType,
  EventTaskTemplate,
  EventTriggerPoint,
} from "../types/event";

export interface EventOption {
  value: string;
  zh: string;
  en: string;
}

export const eventTypeOptions: Array<{ value: EventRuleType; zh: string; en: string }> = [
  { value: "normal", zh: "普通 Event", en: "Normal Event" },
  { value: "timer", zh: "计时 Event", en: "Timer Event" },
];

export const eventStatusOptions: Array<{ value: EventRuleStatus; zh: string; en: string }> = [
  { value: "draft", zh: "草稿", en: "Draft" },
  { value: "enabled", zh: "启用", en: "Enabled" },
  { value: "disabled", zh: "停用", en: "Disabled" },
];

export const eventTriggerPointOptions: Array<{ value: EventTriggerPoint; zh: string; en: string }> = [
  { value: "ticket.created", zh: "工单创建", en: "Ticket Created" },
  { value: "ticket.updated", zh: "工单更新", en: "Ticket Updated" },
  { value: "ticket.assigned", zh: "工单被领取或分配", en: "Ticket Assigned" },
  { value: "ticket.status.changed", zh: "工单状态变更", en: "Ticket Status Changed" },
  { value: "ticket.response.timeout", zh: "响应超时", en: "Response Timeout" },
  { value: "ticket.resolution.timeout", zh: "处置超时", en: "Resolution Timeout" },
  { value: "ticket.closed", zh: "工单关闭", en: "Ticket Closed" },
  { value: "ticket.reopened", zh: "工单重开", en: "Ticket Reopened" },
  { value: "ticket.escalated", zh: "工单升级", en: "Ticket Escalated" },
  { value: "ticket.escalation.rejected", zh: "升级给指定人员被拒", en: "Escalation Rejected" },
  { value: "ticket.escalation.accepted", zh: "升级被接收", en: "Escalation Accepted" },
];

export const eventFilterFieldOptions: Array<{ value: EventFilterField; zh: string; en: string }> = [
  { value: "priority", zh: "优先级", en: "Priority" },
  { value: "category", zh: "工单分类", en: "Category" },
  { value: "risk_score", zh: "风险分数", en: "Risk Score" },
  { value: "created_at", zh: "创建时间", en: "Created At" },
];

export const priorityOptions: EventOption[] = [
  { value: "P1", zh: "P1 严重", en: "P1 Critical" },
  { value: "P2", zh: "P2 高", en: "P2 High" },
  { value: "P3", zh: "P3 中", en: "P3 Medium" },
  { value: "P4", zh: "P4 低", en: "P4 Low" },
];

export const categoryOptions: EventOption[] = [
  { value: "intrusion", zh: "入侵检测", en: "Intrusion Detection" },
  { value: "network", zh: "网络攻击", en: "Network Attack" },
  { value: "data", zh: "数据安全", en: "Data Security" },
  { value: "endpoint", zh: "终端安全", en: "Endpoint Security" },
  { value: "phishing", zh: "网络钓鱼", en: "Phishing" },
];

export const eventTimeUnitOptions: EventOption[] = [
  { value: "minutes", zh: "分钟", en: "minutes" },
  { value: "hours", zh: "小时", en: "hours" },
  { value: "days", zh: "天", en: "days" },
];

export function getEventLabel(options: EventOption[], value: string, language: "zh" | "en") {
  return options.find((item) => item.value === value)?.[language] ?? value;
}

export function getTriggerPointLabel(triggerPoint: EventTriggerPoint | string, language: "zh" | "en") {
  return eventTriggerPointOptions.find((item) => item.value === triggerPoint)?.[language] ?? triggerPoint;
}

export function getEventTypeLabel(eventType: EventRuleType, language: "zh" | "en") {
  return eventTypeOptions.find((item) => item.value === eventType)?.[language] ?? eventType;
}

export function getEventStatusLabel(status: EventRuleStatus, language: "zh" | "en") {
  return eventStatusOptions.find((item) => item.value === status)?.[language] ?? status;
}

export function getTaskGroupLabel(group: string, language: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    notification: { zh: "通知", en: "Notification" },
    follow_up: { zh: "跟进", en: "Follow Up" },
    escalation: { zh: "升级", en: "Escalation" },
    review: { zh: "复核", en: "Review" },
  };
  return labels[group]?.[language] ?? group;
}

export function formatEventFilter(filter: EventRuleFilter, language: "zh" | "en") {
  if (filter.field === "priority") {
    return `${language === "zh" ? "优先级" : "Priority"} in ${filter.values?.map((value) => getEventLabel(priorityOptions, value, language)).join(", ")}`;
  }

  if (filter.field === "category") {
    return `${language === "zh" ? "工单分类" : "Category"} in ${filter.values
      ?.map((value) => getTicketCategory(value)?.[language] ?? value)
      .join(", ")}`;
  }

  if (filter.field === "risk_score") {
    return `${language === "zh" ? "风险分数" : "Risk Score"} ${filter.min_value ?? 0} - ${filter.max_value ?? 100}`;
  }

  return `${language === "zh" ? "创建时间" : "Created At"} ${filter.start_at ?? "-"} ~ ${filter.end_at ?? "-"}`;
}

function getUnitLabel(unit: string | undefined, language: "zh" | "en") {
  if (!unit) return "";
  return getEventLabel(eventTimeUnitOptions, unit, language);
}

export function formatEventTriggerSummary(
  eventType: EventRuleType,
  triggerPoint: EventTriggerPoint,
  timeRule: EventRuleTimeRule,
  language: "zh" | "en",
) {
  const triggerLabel = getTriggerPointLabel(triggerPoint, language);
  if (eventType === "normal") {
    if (timeRule.mode === "immediate") {
      return language === "zh" ? `在${triggerLabel}时立即触发` : `Trigger immediately on ${triggerLabel}`;
    }
    return language === "zh"
      ? `在${triggerLabel}后延迟 ${timeRule.delay_amount} ${getUnitLabel(timeRule.delay_unit, language)} 触发`
      : `Trigger ${timeRule.delay_amount} ${getUnitLabel(timeRule.delay_unit, language)} after ${triggerLabel}`;
  }

  return language === "zh"
    ? `基于工单创建时间 + ${timeRule.target_offset_amount} ${getUnitLabel(
        timeRule.target_offset_unit,
        language,
      )}，并${timeRule.adjustment_direction === "before" ? "提前" : "延后"} ${timeRule.adjustment_amount} ${getUnitLabel(
        timeRule.adjustment_unit,
        language,
      )} 触发`
    : `Based on ticket created time + ${timeRule.target_offset_amount} ${getUnitLabel(
        timeRule.target_offset_unit,
        language,
      )}, ${timeRule.adjustment_direction} ${timeRule.adjustment_amount} ${getUnitLabel(timeRule.adjustment_unit, language)}`;
}

export function toEventRulePreviewLines(detail: Pick<EventRuleDetail, "filters" | "trigger_point" | "time_rule" | "event_type" | "bound_tasks">, language: "zh" | "en") {
  const conditionLines = detail.filters.map((filter) => formatEventFilter(filter, language));
  const triggerLine = formatEventTriggerSummary(detail.event_type, detail.trigger_point, detail.time_rule, language);
  const taskLines = detail.bound_tasks.map((task) => task.name);
  return { conditionLines, triggerLine, taskLines };
}

export function buildEventSummaryStats(detail: EventRuleDetail, language: "zh" | "en") {
  return [
    {
      label: language === "zh" ? "对象类型" : "Object",
      value: language === "zh" ? "工单" : "Ticket",
    },
    {
      label: language === "zh" ? "过滤条件" : "Conditions",
      value: `${detail.filters.length}`,
    },
    {
      label: language === "zh" ? "绑定任务" : "Bound Tasks",
      value: `${detail.bound_tasks.length}`,
    },
    {
      label: language === "zh" ? "更新人" : "Updated By",
      value: detail.updated_by,
    },
  ];
}

export function defaultTaskTemplate(taskTemplate: EventTaskTemplate) {
  return taskTemplate;
}
