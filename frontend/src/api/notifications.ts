import { apiFetch, apiPost } from "./client";
import type {
  NotificationListResponse,
  NotificationMutationResponse
} from "../types/notification";

export function listNotifications() {
  return apiFetch<NotificationListResponse>("/api/v1/notifications");
}

export function markNotificationRead(notificationId: string) {
  return apiPost<NotificationMutationResponse>(`/api/v1/notifications/${notificationId}/read`);
}
