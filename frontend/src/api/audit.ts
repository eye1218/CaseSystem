import { apiFetch } from "./client";
import type {
  AuditLogListResponse,
  AuditTicketListQuery,
  AuditTicketListResponse,
  AuditTicketLogsQuery,
} from "../types/audit";

export function listAuditTickets(query: AuditTicketListQuery) {
  const params = new URLSearchParams();

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.actionType?.trim()) {
    params.set("action_type", query.actionType.trim());
  }
  if (query.actor?.trim()) {
    params.set("actor", query.actor.trim());
  }
  if (query.visibility && query.visibility !== "all") {
    params.set("visibility", query.visibility);
  }
  if (query.mainStatus && query.mainStatus !== "all") {
    params.set("main_status", query.mainStatus);
  }
  if (query.createdFrom) {
    params.set("created_from", query.createdFrom);
  }
  if (query.createdTo) {
    params.set("created_to", query.createdTo);
  }
  if (query.sortBy) {
    params.set("sort_by", query.sortBy);
  }
  if (query.sortDir) {
    params.set("sort_dir", query.sortDir);
  }
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }

  return apiFetch<AuditTicketListResponse>(`/api/v1/audit/tickets?${params.toString()}`);
}

export function listAuditTicketLogs(ticketId: number, query: AuditTicketLogsQuery) {
  const params = new URLSearchParams();

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.actionType?.trim()) {
    params.set("action_type", query.actionType.trim());
  }
  if (query.actor?.trim()) {
    params.set("actor", query.actor.trim());
  }
  if (query.visibility && query.visibility !== "all") {
    params.set("visibility", query.visibility);
  }
  if (query.createdFrom) {
    params.set("created_from", query.createdFrom);
  }
  if (query.createdTo) {
    params.set("created_to", query.createdTo);
  }
  if (query.sortDir) {
    params.set("sort_dir", query.sortDir);
  }
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }

  return apiFetch<AuditLogListResponse>(`/api/v1/audit/tickets/${ticketId}/logs?${params.toString()}`);
}
