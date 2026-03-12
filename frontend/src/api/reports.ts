import { apiDelete, apiFetch, apiPatch, apiPostForm } from "./client";
import type { ReportListResponse, ReportSummary, ReportUpdatePayload } from "../types/report";

export interface ReportQuery {
  search?: string;
  ticketId?: string;
  reportType?: string;
  uploadedByMe?: boolean;
}

export async function listReports(query: ReportQuery = {}): Promise<ReportListResponse> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.ticketId) params.set("ticket_id", query.ticketId);
  if (query.reportType && query.reportType !== "all") params.set("report_type", query.reportType);
  if (query.uploadedByMe) params.set("uploaded_by_me", "true");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ReportListResponse>(`/api/v1/reports${suffix}`);
}

export async function createReport(formData: FormData): Promise<ReportSummary> {
  return apiPostForm<ReportSummary>("/api/v1/reports", formData);
}

export async function getReport(reportId: string): Promise<ReportSummary> {
  return apiFetch<ReportSummary>(`/api/v1/reports/${reportId}`);
}

export async function updateReport(reportId: string, payload: ReportUpdatePayload): Promise<ReportSummary> {
  return apiPatch<ReportSummary>(`/api/v1/reports/${reportId}`, payload);
}

export async function replaceReportFile(reportId: string, formData: FormData): Promise<ReportSummary> {
  return apiPostForm<ReportSummary>(`/api/v1/reports/${reportId}/replace-file`, formData);
}

export async function deleteReport(reportId: string): Promise<void> {
  return apiDelete(`/api/v1/reports/${reportId}`);
}
