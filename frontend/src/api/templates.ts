import { apiFetch, apiPatch, apiPost } from "./client";
import type {
  TemplateCreatePayload,
  TemplateDetailResponse,
  TemplateListResponse,
  TemplatePreviewPayload,
  TemplatePreviewResponse,
  TemplateStatus,
  TemplateType,
  TemplateTypeListResponse,
  TemplateUpdatePayload
} from "../types/template";

export interface TemplateListQuery {
  templateType?: TemplateType | "all";
  status?: TemplateStatus | "all";
  search?: string;
}

export function listTemplateTypes() {
  return apiFetch<TemplateTypeListResponse>("/api/v1/template-types");
}

export function listTemplates(query: TemplateListQuery) {
  const params = new URLSearchParams();

  if (query.templateType && query.templateType !== "all") {
    params.set("template_type", query.templateType);
  }

  if (query.status && query.status !== "all") {
    params.set("status", query.status);
  }

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<TemplateListResponse>(`/api/v1/templates${suffix}`);
}

export function getTemplateDetail(templateId: string) {
  return apiFetch<TemplateDetailResponse>(`/api/v1/templates/${templateId}`);
}

export function createTemplate(payload: TemplateCreatePayload) {
  return apiPost<TemplateDetailResponse>("/api/v1/templates", payload);
}

export function updateTemplate(templateId: string, payload: TemplateUpdatePayload) {
  return apiPatch<TemplateDetailResponse>(`/api/v1/templates/${templateId}`, payload);
}

export function updateTemplateStatus(templateId: string, status: TemplateStatus) {
  return apiPost<TemplateDetailResponse>(`/api/v1/templates/${templateId}/status`, { status });
}

export function previewTemplate(payload: TemplatePreviewPayload) {
  return apiPost<TemplatePreviewResponse>("/api/v1/templates/preview", payload);
}
