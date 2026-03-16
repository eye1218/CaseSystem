export interface ApiToken {
  id: string;
  name: string;
  active_role_code: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
}

export interface ApiTokenCreatedResponse extends ApiToken {
  raw_token: string;
}

export interface ApiTokenListResponse {
  items: ApiToken[];
}

export interface ApiTokenCreatePayload {
  name: string;
  active_role_code: string;
}
