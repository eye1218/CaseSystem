import type { NotificationSummary } from "../../types/notification";

export interface ActionableNotificationCard {
  id: string;
  escalationId: string;
  ticketId: number | null;
  title: string;
  content: string;
  requesterName: string | null;
  createdAt: string;
}

export function buildActionableNotificationCards(
  notifications: NotificationSummary[],
): ActionableNotificationCard[] {
  return notifications
    .filter(
      (notification) =>
        notification.action_required &&
        notification.action_type === "ticket_escalation" &&
        notification.action_status === "pending",
    )
    .map((notification) => ({
      id: notification.id,
      escalationId: String(notification.action_payload.escalation_id ?? ""),
      ticketId:
        typeof notification.action_payload.ticket_id === "number"
          ? notification.action_payload.ticket_id
          : notification.related_resource_type === "ticket" && notification.related_resource_id
            ? Number(notification.related_resource_id)
            : null,
      title: notification.title,
      content: notification.content,
      requesterName:
        typeof notification.action_payload.requester_name === "string"
          ? notification.action_payload.requester_name
          : null,
      createdAt: notification.created_at,
    }))
    .filter((item) => item.escalationId.length > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function resolveNotificationTicketPath(notification: NotificationSummary): string | null {
  if (typeof notification.action_payload.ticket_id === "number") {
    return `/tickets/${notification.action_payload.ticket_id}`;
  }
  if (notification.related_resource_type === "ticket" && notification.related_resource_id) {
    return `/tickets/${notification.related_resource_id}`;
  }
  return null;
}
