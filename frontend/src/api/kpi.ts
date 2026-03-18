import { apiFetch } from "./client";
import type { KpiOverview, KpiUserListQuery, KpiUserListResponse } from "../types/kpi";

export function getKpiOverview(windowDays: 7 | 30 | 90) {
  return apiFetch<KpiOverview>(`/api/v1/kpi/overview?window_days=${windowDays}`);
}

export function listKpiUsers(query: KpiUserListQuery) {
  const params = new URLSearchParams();
  params.set("window_days", String(query.windowDays));

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.roleCode && query.roleCode !== "all") {
    params.set("role_code", query.roleCode);
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

  return apiFetch<KpiUserListResponse>(`/api/v1/kpi/users?${params.toString()}`);
}
