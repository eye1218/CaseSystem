export type EventRuleType = "normal" | "timer";
export type EventRuleStatus = "draft" | "enabled" | "disabled";
export type EventTriggerPoint =
  | "ticket.created"
  | "ticket.updated"
  | "ticket.assigned"
  | "ticket.status.changed"
  | "ticket.response.timeout"
  | "ticket.resolution.timeout"
  | "ticket.closed"
  | "ticket.reopened"
  | "ticket.escalated"
  | "ticket.escalation.rejected"
  | "ticket.escalation.accepted";
export type EventFilterField = "priority" | "category" | "risk_score" | "created_at";

export interface EventTaskTemplate {
  id: string;
  name: string;
  description: string;
  group: string;
}

export interface EventRuleFilter {
  field: EventFilterField;
  operator: "in" | "between";
  values?: string[];
  min_value?: number;
  max_value?: number;
  start_at?: string;
  end_at?: string;
}

export interface EventRuleTimeRule {
  mode: "immediate" | "delayed" | "timer";
  delay_amount?: number;
  delay_unit?: "minutes" | "hours" | "days";
  target_offset_amount?: number;
  target_offset_unit?: "minutes" | "hours" | "days";
  adjustment_direction?: "before" | "after";
  adjustment_amount?: number;
  adjustment_unit?: "minutes" | "hours" | "days";
}

export interface EventRuleSummary {
  id: string;
  name: string;
  code: string;
  event_type: EventRuleType;
  status: EventRuleStatus;
  trigger_point: EventTriggerPoint;
  description: string | null;
  tags: string[];
  task_template_count: number;
  filter_summary: string;
  trigger_summary: string;
  updated_at: string;
  updated_by: string;
}

export interface EventRuleDetail {
  id: string;
  name: string;
  code: string;
  event_type: EventRuleType;
  status: EventRuleStatus;
  trigger_point: EventTriggerPoint;
  object_type: "ticket";
  description: string | null;
  tags: string[];
  filters: EventRuleFilter[];
  time_rule: EventRuleTimeRule;
  bound_tasks: EventTaskTemplate[];
  filter_summary: string;
  trigger_summary: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export interface EventRuleListResponse {
  items: EventRuleSummary[];
  total_count: number;
}

export interface EventTaskTemplateListResponse {
  items: EventTaskTemplate[];
}

export interface EventRulePayload {
  name: string;
  code?: string;
  event_type: EventRuleType;
  status: EventRuleStatus;
  trigger_point: EventTriggerPoint;
  description?: string;
  tags: string[];
  filters: EventRuleFilter[];
  time_rule: EventRuleTimeRule;
  task_template_ids: string[];
}

export interface EventRuleStatusPayload {
  status: Extract<EventRuleStatus, "enabled" | "disabled">;
}
