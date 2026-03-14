export type MailSenderStatus = "ENABLED" | "DISABLED";
export type MailSenderSecurityType = "SSL" | "TLS" | "STARTTLS";
export type MailSenderTestResult = "SUCCESS" | "FAILED";

export interface MailSenderSummary {
  id: string;
  sender_name: string;
  sender_email: string;
  auth_account: string;
  smtp_host: string;
  smtp_port: number;
  security_type: MailSenderSecurityType;
  status: MailSenderStatus;
  latest_test_status: MailSenderTestResult | null;
  latest_test_at: string | null;
  latest_test_error_summary: string | null;
  password_configured: boolean;
  created_at: string;
  updated_at: string;
}

export interface MailSenderListResponse {
  items: MailSenderSummary[];
  total_count: number;
}

export interface MailSenderCreatePayload {
  sender_name: string;
  sender_email: string;
  auth_account: string;
  auth_password: string;
  smtp_host: string;
  smtp_port: number;
  security_type: MailSenderSecurityType;
  status: MailSenderStatus;
}

export interface MailSenderUpdatePayload {
  sender_name?: string;
  sender_email?: string;
  auth_account?: string;
  auth_password?: string;
  smtp_host?: string;
  smtp_port?: number;
  security_type?: MailSenderSecurityType;
  status?: MailSenderStatus;
}

export interface MailSenderStatusPayload {
  status: MailSenderStatus;
}

export interface MailSenderTestPayload {
  test_email: string;
}

export interface MailSenderTestResponse {
  sender_id: string;
  result: MailSenderTestResult;
  tested_at: string;
  error_summary: string | null;
}
