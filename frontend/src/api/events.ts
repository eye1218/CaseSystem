import { apiDelete, apiFetch, apiPatch, apiPost } from "./client";
import type {
  EventRuleDetail,
  EventRuleListResponse,
  EventRulePayload,
  EventRuleStatusPayload,
  EventTaskTemplateListResponse,
} from "../types/event";

export function listEventTaskTemplates() {
  return apiFetch<EventTaskTemplateListResponse>("/api/v1/events/task-templates");
}

export function listEventRules() {
  return apiFetch<EventRuleListResponse>("/api/v1/events");
}

export function getEventRule(eventId: string) {
  return apiFetch<EventRuleDetail>(`/api/v1/events/${eventId}`);
}

export function createEventRule(payload: EventRulePayload) {
  return apiPost<EventRuleDetail>("/api/v1/events", payload);
}

export function updateEventRule(eventId: string, payload: Partial<EventRulePayload>) {
  return apiPatch<EventRuleDetail>(`/api/v1/events/${eventId}`, payload);
}

export function updateEventRuleStatus(eventId: string, payload: EventRuleStatusPayload) {
  return apiPost<EventRuleDetail>(`/api/v1/events/${eventId}/status`, payload);
}

export function deleteEventRule(eventId: string) {
  return apiDelete(`/api/v1/events/${eventId}`);
}
