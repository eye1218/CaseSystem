import { apiFetch, apiPatch, apiPost } from "./client";
import type {
  MailSenderCreatePayload,
  MailSenderListResponse,
  MailSenderStatus,
  MailSenderSummary,
  MailSenderTestPayload,
  MailSenderTestResponse,
  MailSenderUpdatePayload,
} from "../types/mailSender";

export interface MailSenderListQuery {
  search?: string;
  status?: MailSenderStatus;
}

export function listMailSenders(query: MailSenderListQuery = {}) {
  const params = new URLSearchParams();
  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.status) {
    params.set("status", query.status);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<MailSenderListResponse>(`/api/v1/mail-senders${suffix}`);
}

export function getMailSender(senderId: string) {
  return apiFetch<MailSenderSummary>(`/api/v1/mail-senders/${senderId}`);
}

export function createMailSender(payload: MailSenderCreatePayload) {
  return apiPost<MailSenderSummary>("/api/v1/mail-senders", payload);
}

export function updateMailSender(senderId: string, payload: MailSenderUpdatePayload) {
  return apiPatch<MailSenderSummary>(`/api/v1/mail-senders/${senderId}`, payload);
}

export function updateMailSenderStatus(senderId: string, status: MailSenderStatus) {
  return apiPost<MailSenderSummary>(`/api/v1/mail-senders/${senderId}/status`, { status });
}

export function testMailSender(senderId: string, payload: MailSenderTestPayload) {
  return apiPost<MailSenderTestResponse>(`/api/v1/mail-senders/${senderId}/test`, payload);
}
