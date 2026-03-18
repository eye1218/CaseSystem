import type { RoleCode } from "../../types/auth";

export function isInternalRole(role: RoleCode): boolean {
  return role !== "CUSTOMER";
}

export function getDefaultRouteForRole(role: RoleCode): string {
  return isInternalRole(role) ? "/" : "/tickets";
}

export function hasMenuAccess(role: RoleCode, menuItem: string): boolean {
  const accessMatrix: Record<RoleCode, string[]> = {
    T1: ["dashboard", "tickets", "notifications", "knowledge", "tasks", "reports"],
    T2: ["dashboard", "tickets", "notifications", "knowledge", "tasks", "reports", "kpi"],
    T3: ["dashboard", "tickets", "notifications", "knowledge", "tasks", "reports", "kpi"],
    ADMIN: ["dashboard", "tickets", "notifications", "knowledge", "events", "tasks", "reports", "kpi", "configuration", "users", "audit", "recycle"],
    CUSTOMER: ["tickets", "reports", "notifications"]
  };

  return accessMatrix[role]?.includes(menuItem) ?? false;
}
