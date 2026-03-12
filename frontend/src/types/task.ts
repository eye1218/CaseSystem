export type TaskType = "EMAIL" | "WEBHOOK" | "UNKNOWN";
export type TaskStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type TaskTemplateStatus = "ACTIVE" | "INACTIVE";
export type RecipientSourceType = "CUSTOM_EMAIL" | "CURRENT_HANDLER" | "ROLE_MEMBERS";

export interface TaskRecipientRule {
  source_type: RecipientSourceType;
  value?: string | null;
}

export interface TaskRecipientConfig {
  to: TaskRecipientRule[];
  cc: TaskRecipientRule[];
  bcc: TaskRecipientRule[];
}

export interface TaskTemplateSummary {
  id: string;
  name: string;
  task_type: Extract<TaskType, "EMAIL" | "WEBHOOK">;
  reference_template_id: string;
  status: TaskTemplateStatus;
  recipient_config: TaskRecipientConfig;
  target_config: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateListResponse {
  items: TaskTemplateSummary[];
  total_count: number;
}

export interface TaskTemplatePayload {
  name: string;
  task_type: Extract<TaskType, "EMAIL" | "WEBHOOK">;
  reference_template_id: string;
  status: TaskTemplateStatus;
  recipient_config: TaskRecipientConfig;
  target_config: Record<string, unknown>;
  description?: string | null;
}

export interface TaskTemplateUpdatePayload {
  name?: string;
  reference_template_id?: string;
  recipient_config?: TaskRecipientConfig;
  target_config?: Record<string, unknown>;
  description?: string | null;
}

export interface TaskExecutionLog {
  id: string;
  stage: string;
  actor_user_id: string | null;
  actor_name: string | null;
  input_summary: Record<string, unknown>;
  rendered_summary: Record<string, unknown>;
  response_summary: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export interface TaskInstanceSummary {
  id: string;
  task_template_id: string | null;
  source_event_id: string | null;
  source_binding_id: string | null;
  ticket_id: number | null;
  task_type: TaskType;
  task_name: string;
  status: TaskStatus;
  target_summary: string;
  latest_result: Record<string, unknown>;
  error_message: string | null;
  retry_of_task_id: string | null;
  operator_user_id: string | null;
  operator_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskInstanceDetail extends TaskInstanceSummary {
  template_snapshot: Record<string, unknown>;
  logs: TaskExecutionLog[];
}

export interface TaskInstanceListResponse {
  items: TaskInstanceSummary[];
  total_count: number;
}

export interface TaskListQuery {
  search?: string;
  taskType?: Extract<TaskType, "EMAIL" | "WEBHOOK">;
  status?: TaskStatus;
  sourceEventId?: string;
  taskTemplateId?: string;
  ticketId?: number;
  failedOnly?: boolean;
}
