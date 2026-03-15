import type { RoleCode } from "./auth";

export type ManagedUserStatus = "active" | "disabled" | "pending";

export interface UserGroupReference {
  id: string;
  name: string;
}

export interface ManagedUserSummary {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  status: ManagedUserStatus;
  roles: RoleCode[];
  groups: UserGroupReference[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManagedUserDetail extends ManagedUserSummary {
  disabled_at: string | null;
  disabled_reason: string | null;
}

export interface ManagedUserListResponse {
  items: ManagedUserSummary[];
  total_count: number;
}

export interface ManagedUserDetailResponse {
  user: ManagedUserDetail;
}

export interface ManagedUserCreatePayload {
  username: string;
  display_name: string;
  email: string | null;
  password: string;
  role_codes: RoleCode[];
  group_ids: string[];
}

export interface ManagedUserUpdatePayload {
  display_name: string | null;
  email: string | null;
  group_ids: string[];
}

export interface ManagedUserStatusUpdatePayload {
  status: ManagedUserStatus;
  reason?: string | null;
}

export interface ManagedUserPasswordUpdatePayload {
  password: string;
}

export interface UserGroupSummary {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserGroupMember {
  user_id: string;
  username: string;
  display_name: string;
  email: string | null;
  status: ManagedUserStatus;
  roles: RoleCode[];
  added_at: string;
}

export interface UserGroupListResponse {
  items: UserGroupSummary[];
  total_count: number;
}

export interface UserGroupDetailResponse {
  group: UserGroupSummary;
  members: UserGroupMember[];
}

export interface UserGroupCreatePayload {
  name: string;
  description: string | null;
}

export interface UserGroupUpdatePayload {
  name: string | null;
  description: string | null;
}

export interface UserGroupMembersUpdatePayload {
  user_ids: string[];
}
