import { apiFetch, apiPatch, apiPost } from "./client";
import { buildTicketListPath, type TicketQueryParams } from "../features/tickets/utils";
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

export type TicketQuery = TicketQueryParams;

export async function listTickets(query: TicketQuery): Promise<TicketListResponse> {
  return apiFetch<TicketListResponse>(buildTicketListPath(query));
}

export { buildTicketListPath };

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
