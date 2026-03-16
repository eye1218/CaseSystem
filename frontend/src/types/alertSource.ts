export type AlertSourceStatus = "ENABLED" | "DISABLED";
export type AlertSourceTestResult = "SUCCESS" | "FAILED";

export interface AlertSourceSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  database_name: string;
  table_name: string;
  ticket_match_field: string;
  status: AlertSourceStatus;
  latest_test_status: AlertSourceTestResult | null;
  latest_test_at: string | null;
  latest_test_error_summary: string | null;
  password_configured: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertSourceListResponse {
  items: AlertSourceSummary[];
  total_count: number;
}

export interface AlertSourceCreatePayload {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database_name: string;
  table_name: string;
  ticket_match_field: string;
  status: AlertSourceStatus;
}

export interface AlertSourceUpdatePayload {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database_name?: string;
  table_name?: string;
  ticket_match_field?: string;
  status?: AlertSourceStatus;
}

export interface AlertSourceTestResponse {
  source_id: string;
  result: AlertSourceTestResult;
  tested_at: string;
  message: string;
  sample_columns: string[];
  error_summary: string | null;
}

export interface AlertSourceQueryPayload {
  ticket_keys: string[];
}

export interface AlertSourceQueryItem {
  ticket_key: string;
  row_count: number;
  rows: Array<Record<string, unknown>>;
}

export interface AlertSourceQueryResponse {
  source_id: string;
  table_name: string;
  ticket_match_field: string;
  queried_ticket_keys: string[];
  matched_ticket_keys: string[];
  unmatched_ticket_keys: string[];
  total_rows: number;
  items: AlertSourceQueryItem[];
}
