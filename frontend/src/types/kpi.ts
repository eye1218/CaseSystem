import type { RoleCode } from "./auth";

export interface KpiMetricSummary {
  handled_count: number;
  avg_response_seconds: number | null;
  avg_resolution_seconds: number | null;
  sla_attainment_rate: number | null;
  weighted_sla_attainment_rate: number | null;
}

export interface KpiTrendPoint {
  date: string;
  handled_count: number;
  sla_attainment_rate: number | null;
  weighted_sla_attainment_rate: number | null;
}

export interface KpiOverviewBlock {
  summary: KpiMetricSummary;
  trend: KpiTrendPoint[];
}

export interface KpiOverview {
  window_days: number;
  date_from: string;
  date_to: string;
  personal: KpiOverviewBlock;
  global: KpiOverviewBlock | null;
}

export interface KpiUserItem extends KpiMetricSummary {
  user_id: string;
  username: string;
  display_name: string;
  highest_role_code: RoleCode;
  roles: RoleCode[];
}

export interface KpiUserListResponse {
  items: KpiUserItem[];
  total_count: number;
  filtered_count: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface KpiUserListQuery {
  windowDays: 7 | 30 | 90;
  search?: string;
  roleCode?: "T1" | "T2" | "T3" | "ADMIN" | "all";
  sortBy?:
    | "username"
    | "display_name"
    | "highest_role_code"
    | "handled_count"
    | "avg_response_seconds"
    | "avg_resolution_seconds"
    | "sla_attainment_rate"
    | "weighted_sla_attainment_rate";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
