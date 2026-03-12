import { apiFetch, apiPatch, apiPost } from "./client";
import type {
  TaskInstanceDetail,
  TaskInstanceListResponse,
  TaskListQuery,
  TaskTemplateListResponse,
  TaskTemplatePayload,
  TaskTemplateStatus,
  TaskTemplateSummary,
  TaskTemplateUpdatePayload,
} from "../types/task";

export function listTaskInstances(query: TaskListQuery = {}) {
  const params = new URLSearchParams();

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.taskType) {
    params.set("task_type", query.taskType);
  }
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.sourceEventId) {
    params.set("source_event_id", query.sourceEventId);
  }
  if (query.taskTemplateId) {
    params.set("task_template_id", query.taskTemplateId);
  }
  if (typeof query.ticketId === "number" && Number.isFinite(query.ticketId)) {
    params.set("ticket_id", String(query.ticketId));
  }
  if (query.failedOnly) {
    params.set("failed_only", "true");
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<TaskInstanceListResponse>(`/api/v1/tasks${suffix}`);
}

export function getTaskInstance(taskInstanceId: string) {
  return apiFetch<TaskInstanceDetail>(`/api/v1/tasks/${taskInstanceId}`);
}

export function retryTaskInstance(taskInstanceId: string) {
  return apiPost<TaskInstanceDetail>(`/api/v1/tasks/${taskInstanceId}/retry`);
}

export function listTaskTemplates() {
  return apiFetch<TaskTemplateListResponse>("/api/v1/task-templates");
}

export function getTaskTemplate(taskTemplateId: string) {
  return apiFetch<TaskTemplateSummary>(`/api/v1/task-templates/${taskTemplateId}`);
}

export function createTaskTemplate(payload: TaskTemplatePayload) {
  return apiPost<TaskTemplateSummary>("/api/v1/task-templates", payload);
}

export function updateTaskTemplate(taskTemplateId: string, payload: TaskTemplateUpdatePayload) {
  return apiPatch<TaskTemplateSummary>(`/api/v1/task-templates/${taskTemplateId}`, payload);
}

export function updateTaskTemplateStatus(taskTemplateId: string, status: TaskTemplateStatus) {
  return apiPost<TaskTemplateSummary>(`/api/v1/task-templates/${taskTemplateId}/status`, { status });
}
