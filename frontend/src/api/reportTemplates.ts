import { apiFetch, apiPatch, apiPostForm } from "./client";
import type { ReportTemplateListResponse, ReportTemplateSummary, ReportTemplateUpdatePayload } from "../types/report";

export interface ReportTemplateQuery {
  ticketCategoryId?: string;
  status?: "ACTIVE" | "INACTIVE" | "all";
}

export async function listReportTemplates(query: ReportTemplateQuery = {}): Promise<ReportTemplateListResponse> {
  const params = new URLSearchParams();
  if (query.ticketCategoryId) params.set("ticket_category_id", query.ticketCategoryId);
  if (query.status && query.status !== "all") params.set("status", query.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ReportTemplateListResponse>(`/api/v1/report-templates${suffix}`);
}

export async function createReportTemplate(formData: FormData): Promise<ReportTemplateSummary> {
  return apiPostForm<ReportTemplateSummary>("/api/v1/report-templates", formData);
}

export async function updateReportTemplate(templateId: string, payload: ReportTemplateUpdatePayload): Promise<ReportTemplateSummary> {
  return apiPatch<ReportTemplateSummary>(`/api/v1/report-templates/${templateId}`, payload);
}

export async function replaceReportTemplateFile(templateId: string, formData: FormData): Promise<ReportTemplateSummary> {
  return apiPostForm<ReportTemplateSummary>(`/api/v1/report-templates/${templateId}/replace-file`, formData);
}
