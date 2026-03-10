export type RoleCode = "T1" | "T2" | "T3" | "ADMIN" | "CUSTOMER";

export interface AuthenticatedUser {
  id: string;
  username: string;
  display_name: string;
  status: string;
  token_version: number;
  role_version: number;
  active_role: RoleCode;
  roles: RoleCode[];
}

export interface AuthResponse {
  user: AuthenticatedUser;
  session_id: string;
}
