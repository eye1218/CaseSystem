import { apiDeleteJson, apiFetch, apiPost } from "./client";
import type { AuthResponse } from "../types/auth";
import type { ApiToken, ApiTokenCreatePayload, ApiTokenCreatedResponse, ApiTokenListResponse } from "../types/apiToken";

export function fetchCurrentUser() {
  return apiFetch<AuthResponse>("/auth/me");
}

export function login(username: string, password: string) {
  return apiPost<AuthResponse>("/auth/login", { username, password });
}

export function logout() {
  return apiPost<{ message: string }>("/auth/logout");
}

export function switchRole(activeRoleCode: string) {
  return apiPost<AuthResponse>("/auth/switch-role", { active_role_code: activeRoleCode });
}

export function issueSocketToken() {
  return apiFetch<{ token: string }>("/auth/socket-token");
}

export function listApiTokens() {
  return apiFetch<ApiTokenListResponse>("/auth/tokens");
}

export function createApiToken(payload: ApiTokenCreatePayload) {
  return apiPost<ApiTokenCreatedResponse>("/auth/tokens", payload);
}

export function revokeApiToken(tokenId: string) {
  return apiDeleteJson<{ message: string }>(`/auth/tokens/${tokenId}`);
}
