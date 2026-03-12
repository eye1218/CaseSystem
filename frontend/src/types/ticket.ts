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

export interface TicketCreatePayload {
  title: string;
  description: string;
  category_id: string;
  priority: TicketPriority;
  risk_score: number;
  assignment_mode?: "unassigned" | "self" | "pool";
  pool_code?: string;
}
