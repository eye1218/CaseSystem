import { apiDelete, apiDeleteJson, apiFetch, apiPatch, apiPost } from "./client";
import {
  buildUserGroupListPath,
  buildUserListPath,
  type UserGroupListQueryInput,
  type UserListQueryInput,
} from "../features/userManagement/utils";
import type {
  ManagedUserCreatePayload,
  ManagedUserDetailResponse,
  ManagedUserListResponse,
  ManagedUserStatus,
  ManagedUserUpdatePayload,
  UserGroupCreatePayload,
  UserGroupDetailResponse,
  UserGroupListResponse,
  UserGroupMembersUpdatePayload,
  UserGroupUpdatePayload,
} from "../types/userManagement";

export function listUsers(query: UserListQueryInput = {}) {
  return apiFetch<ManagedUserListResponse>(buildUserListPath(query));
}

export function getUserDetail(userId: string) {
  return apiFetch<ManagedUserDetailResponse>(`/api/v1/users/${userId}`);
}

export function createUser(payload: ManagedUserCreatePayload) {
  return apiPost<ManagedUserDetailResponse>("/api/v1/users", payload);
}

export function updateUser(userId: string, payload: ManagedUserUpdatePayload) {
  return apiPatch<ManagedUserDetailResponse>(`/api/v1/users/${userId}`, payload);
}

export function updateUserStatus(userId: string, status: ManagedUserStatus, reason?: string | null) {
  return apiPost<ManagedUserDetailResponse>(`/api/v1/users/${userId}/status`, { status, reason });
}

export function deleteUser(userId: string) {
  return apiDelete(`/api/v1/users/${userId}`);
}

export function listUserGroups(query: UserGroupListQueryInput = {}) {
  return apiFetch<UserGroupListResponse>(buildUserGroupListPath(query));
}

export function getUserGroupDetail(groupId: string) {
  return apiFetch<UserGroupDetailResponse>(`/api/v1/user-groups/${groupId}`);
}

export function createUserGroup(payload: UserGroupCreatePayload) {
  return apiPost<UserGroupDetailResponse>("/api/v1/user-groups", payload);
}

export function updateUserGroup(groupId: string, payload: UserGroupUpdatePayload) {
  return apiPatch<UserGroupDetailResponse>(`/api/v1/user-groups/${groupId}`, payload);
}

export function deleteUserGroup(groupId: string) {
  return apiDelete(`/api/v1/user-groups/${groupId}`);
}

export function addUserGroupMembers(groupId: string, payload: UserGroupMembersUpdatePayload) {
  return apiPost<UserGroupDetailResponse>(`/api/v1/user-groups/${groupId}/members`, payload);
}

export function removeUserGroupMember(groupId: string, userId: string) {
  return apiDeleteJson<UserGroupDetailResponse>(`/api/v1/user-groups/${groupId}/members/${userId}`);
}
