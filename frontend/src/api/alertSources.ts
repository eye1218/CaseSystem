import { apiFetch, apiPatch, apiPost } from "./client";
import type {
  AlertSourceCreatePayload,
  AlertSourceListResponse,
  AlertSourceQueryPayload,
  AlertSourceQueryResponse,
  AlertSourceStatus,
  AlertSourceSummary,
  AlertSourceTestResponse,
  AlertSourceUpdatePayload,
} from "../types/alertSource";

export interface AlertSourceListQuery {
  search?: string;
  status?: AlertSourceStatus;
}

export function listAlertSources(query: AlertSourceListQuery = {}) {
  const params = new URLSearchParams();
  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.status) {
    params.set("status", query.status);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<AlertSourceListResponse>(`/api/v1/alert-sources${suffix}`);
}

export function getAlertSource(sourceId: string) {
  return apiFetch<AlertSourceSummary>(`/api/v1/alert-sources/${sourceId}`);
}

export function createAlertSource(payload: AlertSourceCreatePayload) {
  return apiPost<AlertSourceSummary>("/api/v1/alert-sources", payload);
}

export function updateAlertSource(sourceId: string, payload: AlertSourceUpdatePayload) {
  return apiPatch<AlertSourceSummary>(`/api/v1/alert-sources/${sourceId}`, payload);
}

export function updateAlertSourceStatus(sourceId: string, status: AlertSourceStatus) {
  return apiPost<AlertSourceSummary>(`/api/v1/alert-sources/${sourceId}/status`, { status });
}

export function testAlertSource(sourceId: string) {
  return apiPost<AlertSourceTestResponse>(`/api/v1/alert-sources/${sourceId}/test`);
}

export function queryAlertSourceByTickets(sourceId: string, payload: AlertSourceQueryPayload) {
  return apiPost<AlertSourceQueryResponse>(`/api/v1/alert-sources/${sourceId}/query`, payload);
}
