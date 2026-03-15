import type { KnowledgeArticleSummary } from "./knowledge";
import type { ReportSummary, ReportTemplateSummary } from "./report";

export type TicketMainStatus =
  | "WAITING_RESPONSE"
  | "IN_PROGRESS"
  | "RESPONSE_TIMEOUT"
  | "RESOLUTION_TIMEOUT"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";

export type TicketSubStatus =
  | "NONE"
  | "ESCALATION_PENDING_CONFIRM"
  | "ESCALATION_CONFIRMED"
  | "ESCALATION_REJECTED";

export type TicketPriority = "P1" | "P2" | "P3" | "P4";
export type TicketClaimStatus = "claimed" | "unclaimed";

export interface TicketSummary {
  id: number;
  version: number;
  title: string;
  description: string;
  category_id: string;
  category_name: string;
  source: string;
  priority: TicketPriority;
  risk_score: number;
  main_status: TicketMainStatus;
  sub_status: TicketSubStatus;
  created_by: string;
  assigned_to: string | null;
  assigned_to_user_id: string | null;
  current_pool_code: string | null;
  responsibility_level: string;
  response_deadline_at: string | null;
  resolution_deadline_at: string | null;
  responded_at: string | null;
  response_timeout_at: string | null;
  resolved_at: string | null;
  resolution_timeout_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketListResponse {
  items: TicketSummary[];
  total_count: number;
  filtered_count?: number;
  has_more?: boolean;
  next_offset?: number | null;
}

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface TicketKnowledgeArticle {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  tags: string[];
  author: string;
  updated_at: string;
  version: string;
  likes: number;
  content: LocalizedText;
}

export interface TicketAlert {
  seq: number;
  time: string;
  rule_id: string;
  src_ip: string;
  src_port: number;
  dst_host: string;
  dst_port: number;
  user: string;
  result: string;
}

export interface TicketExternalContext {
  source: string;
  rule_name: string;
  severity: string;
  asset: string;
  indicator: string;
  summary: LocalizedText;
}

export interface TicketPermissionScope {
  current_role: string;
  page_scope: string;
  comment_scope: string;
  hidden_fields: string[];
}


export interface TicketPendingEscalation {
  id: string;
  ticket_id: number;
  mode: string;
  status: string;
  source_level: string;
  target_level: string;
  target_user_id: string | null;
  target_pool_code: string | null;
  requested_by: string;
  requested_at: string;
  reject_reason: string | null;
  source_pool_code: string | null;
  source_assigned_to: string | null;
}


export interface InternalTicketUser {
  id: string;
  username: string;
  display_name: string;
  highest_role_code: string;
  role_codes: string[];
}

export interface TicketActivityItem {
  id: string;
  item_type: string;
  actor_name: string;
  actor_role: string | null;
  visibility: string;
  content: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  is_system: boolean;
}

export interface TicketDetail {
  ticket: TicketSummary;
  available_actions: string[];
  pending_escalation: TicketPendingEscalation | null;
  activity_feed: TicketActivityItem[];
  related_knowledge: KnowledgeArticleSummary[];
  report_templates: ReportTemplateSummary[];
  reports: ReportSummary[];
  raw_alerts: TicketAlert[];
  siem_context_markdown: LocalizedText;
  external_context: TicketExternalContext;
  responsibility_summary: LocalizedText;
  permission_scope: TicketPermissionScope;
}

export interface TicketLive {
  ticket: TicketSummary;
  available_actions: string[];
  pending_escalation: TicketPendingEscalation | null;
  activity_feed: TicketActivityItem[];
  raw_alerts: TicketAlert[];
  responsibility_summary: LocalizedText;
  permission_scope: TicketPermissionScope;
}

export interface TicketCommentPayload {
  version: number;
  content: string;
  visibility: "PUBLIC" | "INTERNAL";
}

export interface TicketUpdatePayload {
  version: number;
  title?: string;
  description?: string;
  category_id?: string;
  priority?: TicketPriority;
  risk_score?: number;
}

export interface TicketActionPayload {
  version: number;
  note?: string;
}


export interface TicketAssignPayload {
  version: number;
  target_user_id: string;
  note?: string;
}


export interface TicketEscalateToUserPayload {
  version: number;
  target_user_id: string;
  note?: string;
}


export interface TicketEscalateToPoolPayload {
  version: number;
  note?: string;
}


export interface TicketEscalationRejectPayload {
  reason?: string;
}

export interface TicketCreatePayload {
  title: string;
  description: string;
  category_id: string;
  priority: TicketPriority;
  risk_score: number;
  assignment_mode?: "unassigned" | "pool";
  pool_code?: string;
}


export interface InternalTicketUserListResponse {
  items: InternalTicketUser[];
}
