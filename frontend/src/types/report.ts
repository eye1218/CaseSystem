export interface ReportTemplateReference {
  id: string;
  name: string;
}

export interface ReportTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  ticket_category_id: string;
  status: "ACTIVE" | "INACTIVE";
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  download_path: string;
  created_at: string;
  updated_at: string;
}

export interface ReportTemplateListResponse {
  items: ReportTemplateSummary[];
  total_count: number;
}

export interface ReportTemplateUpdatePayload {
  name?: string;
  description?: string | null;
  status?: "ACTIVE" | "INACTIVE";
}

export interface ReportSummary {
  id: string;
  ticket_id: number;
  ticket_category_id: string;
  ticket_category_name: string;
  ticket_created_at: string;
  title: string;
  report_type: string;
  note: string | null;
  source_template: ReportTemplateReference | null;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  download_path: string;
}

export interface ReportListResponse {
  items: ReportSummary[];
  total_count: number;
}

export interface ReportUpdatePayload {
  title?: string;
  report_type?: string;
  note?: string | null;
  source_template_id?: string | null;
}
