export type TemplateType = "EMAIL" | "WEBHOOK";
export type TemplateStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export type TemplateFieldKey = "subject" | "body" | "url" | "method" | "headers";
export type TemplateFieldKind = "text" | "textarea" | "select" | "headers";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface TemplateHeaderPayload {
  key: string;
  value: string;
}

export interface TemplateFieldsPayload {
  subject: string;
  body: string;
  url: string;
  method: HttpMethod | null;
  headers: TemplateHeaderPayload[];
}

export interface TemplateFieldDefinition {
  key: TemplateFieldKey;
  label: LocalizedText;
  description: LocalizedText;
  field_kind: TemplateFieldKind;
  required: boolean;
  supports_jinja: boolean;
  enum_options: string[];
}

export interface TemplateTypeDefinition {
  template_type: TemplateType;
  label: LocalizedText;
  description: LocalizedText;
  fields: TemplateFieldDefinition[];
}

export interface TemplateTypeListResponse {
  items: TemplateTypeDefinition[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  code: string | null;
  template_type: TemplateType;
  description: string | null;
  status: TemplateStatus;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateDetailResponse {
  template: TemplateSummary;
  fields: TemplateFieldsPayload;
  field_definition: TemplateTypeDefinition;
}

export interface TemplateListResponse {
  items: TemplateSummary[];
  total_count: number;
}

export interface TemplateCreatePayload {
  name: string;
  code: string | null;
  template_type: TemplateType;
  description: string | null;
  fields: TemplateFieldsPayload;
}

export interface TemplateUpdatePayload {
  name: string;
  code: string | null;
  description: string | null;
  fields: TemplateFieldsPayload;
}

export interface TemplateStatusUpdatePayload {
  status: TemplateStatus;
}

export interface TemplateFieldError {
  field: string;
  message: string;
}

export interface TemplatePreviewPayload {
  template_type: TemplateType;
  fields: TemplateFieldsPayload;
  context: Record<string, unknown>;
}

export interface TemplatePreviewResponse {
  template_type: TemplateType;
  rendered: TemplateFieldsPayload;
  field_errors: TemplateFieldError[];
}
