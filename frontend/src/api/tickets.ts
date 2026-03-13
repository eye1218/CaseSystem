import { apiFetch, apiPatch, apiPost } from "./client";
import type {
  InternalTicketUserListResponse,
  TicketAssignPayload,
  TicketActionPayload,
  TicketCreatePayload,
  TicketCommentPayload,
  TicketDetail,
  TicketEscalateToPoolPayload,
  TicketEscalateToUserPayload,
  TicketEscalationRejectPayload,
  TicketLive,
  TicketListResponse,
  TicketSummary,
  TicketUpdatePayload
} from "../types/ticket";

export interface TicketQuery {
  ticketId?: string;
  category?: string;
  priority?: string;
  mainStatus?: string;
  subStatus?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listTickets(query: TicketQuery): Promise<TicketListResponse> {
  const params = new URLSearchParams();

  if (query.ticketId) params.set("ticket_id", query.ticketId);
  if (query.category && query.category !== "all") params.set("category_id", query.category);
  if (query.priority && query.priority !== "all") params.set("priority", query.priority);
  if (query.mainStatus && query.mainStatus !== "all") params.set("main_status", query.mainStatus);
  if (query.subStatus && query.subStatus !== "all") params.set("sub_status", query.subStatus);
  if (query.createdFrom) params.set("created_from", query.createdFrom);
  if (query.createdTo) params.set("created_to", query.createdTo);
  if (query.sortBy) params.set("sort_by", query.sortBy);
  if (query.sortDir) params.set("sort_dir", query.sortDir);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<TicketListResponse>(`/api/v1/tickets${suffix}`);
}

export function createTicket(payload: TicketCreatePayload) {
  return apiPost<TicketDetail>("/api/v1/tickets", payload);
}

export function getTicket(ticketId: string) {
  return apiFetch<TicketSummary>(`/api/v1/tickets/${ticketId}`);
}

export function getTicketDetail(ticketId: string) {
  return apiFetch<TicketDetail>(`/api/v1/tickets/${ticketId}/detail`);
}

export function getTicketLive(ticketId: string) {
  return apiFetch<TicketLive>(`/api/v1/tickets/${ticketId}/live`);
}

export function addTicketComment(ticketId: string, payload: TicketCommentPayload) {
  return apiPost<TicketDetail>(`/api/v1/tickets/${ticketId}/comments`, payload);
}

export function runTicketAction(ticketId: string, action: string, payload: TicketActionPayload) {
  return apiPost<TicketDetail>(`/api/v1/tickets/${ticketId}/actions/${action}`, payload);
}

export function updateTicket(ticketId: string, payload: TicketUpdatePayload) {
  return apiPatch<TicketDetail>(`/api/v1/tickets/${ticketId}`, payload);
}

export function listInternalTicketUsers() {
  return apiFetch<InternalTicketUserListResponse>("/api/v1/tickets/internal-target-users");
}

export function assignTicket(ticketId: string, payload: TicketAssignPayload) {
  return apiPost<TicketDetail>(`/api/v1/tickets/${ticketId}/assign`, payload);
}

export function escalateTicketToPool(ticketId: string, payload: TicketEscalateToPoolPayload) {
  return apiPost<TicketDetail>(`/api/v1/tickets/${ticketId}/escalate-to-pool`, payload);
}

export function escalateTicketToUser(ticketId: string, payload: TicketEscalateToUserPayload) {
  return apiPost<TicketDetail>(`/api/v1/tickets/${ticketId}/escalate-to-user`, payload);
}

export function acceptTicketEscalation(escalationId: string) {
  return apiPost<TicketDetail>(`/api/v1/ticket-escalations/${escalationId}/accept`, {});
}

export function rejectTicketEscalation(escalationId: string, payload: TicketEscalationRejectPayload) {
  return apiPost<TicketDetail>(`/api/v1/ticket-escalations/${escalationId}/reject`, payload);
}
