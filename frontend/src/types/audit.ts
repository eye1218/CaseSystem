export interface AuditTicketItem {
  ticket_id: number;
  title: string;
  main_status: string;
  sub_status: string;
  priority: string;
  risk_score: number;
  assigned_to: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  log_count: number;
  last_event_at: string | null;
  last_actor_name: string | null;
  last_actor_role: string | null;
  last_action_type: string | null;
}

export interface AuditTicketListResponse {
  items: AuditTicketItem[];
  total_count: number;
  filtered_count: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface AuditTicketSummary {
  id: number;
  title: string;
  main_status: string;
  sub_status: string;
  priority: string;
  risk_score: number;
  assigned_to: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogItem {
  event_id: string;
  ticket_id: number;
  event_type: "action" | "comment";
  action_type: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  visibility: "PUBLIC" | "INTERNAL";
  content: string;
  from_status: string | null;
  to_status: string | null;
  context: Record<string, unknown>;
  created_at: string;
  is_system: boolean;
}

export interface AuditLogListResponse {
  ticket: AuditTicketSummary;
  items: AuditLogItem[];
  total_count: number;
  filtered_count: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface AuditTicketListQuery {
  search?: string;
  actionType?: string;
  actor?: string;
  visibility?: "all" | "PUBLIC" | "INTERNAL";
  mainStatus?:
    | "all"
    | "WAITING_RESPONSE"
    | "IN_PROGRESS"
    | "RESOLVED"
    | "CLOSED";
  createdFrom?: string;
  createdTo?: string;
  sortBy?: "ticket_id" | "last_event_at" | "log_count" | "risk_score" | "updated_at";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface AuditTicketLogsQuery {
  search?: string;
  actionType?: string;
  actor?: string;
  visibility?: "all" | "PUBLIC" | "INTERNAL";
  createdFrom?: string;
  createdTo?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
