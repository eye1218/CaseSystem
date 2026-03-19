import { apiFetch, apiPost, apiPatch, apiDelete } from "./client";

export interface SystemConfig {
  id: number;
  category: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemConfigListResponse {
  items: SystemConfig[];
  total_count: number;
}

export async function listConfigs(category: string): Promise<SystemConfigListResponse> {
  return apiFetch<SystemConfigListResponse>(`/api/v1/config/${encodeURIComponent(category)}`);
}

export async function getConfig(category: string, key: string): Promise<SystemConfig> {
  return apiFetch<SystemConfig>(`/api/v1/config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`);
}

export async function createConfig(
  category: string,
  key: string,
  value: Record<string, unknown>,
  description?: string
): Promise<SystemConfig> {
  return apiPost<SystemConfig>(
    `/api/v1/config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`,
    { category, key, value, description }
  );
}

export async function updateConfig(
  category: string,
  key: string,
  value?: Record<string, unknown>,
  description?: string,
  is_active?: boolean
): Promise<SystemConfig> {
  return apiPatch<SystemConfig>(
    `/api/v1/config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`,
    { value, description, is_active }
  );
}

export async function deleteConfig(category: string, key: string): Promise<void> {
  return apiDelete(`/api/v1/config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`);
}

export async function listConfigCategories(): Promise<string[]> {
  return apiFetch<string[]>("/api/v1/config/categories");
}
