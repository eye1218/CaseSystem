import type { NotificationSummary } from "../../types/notification";
import { parseApiDate } from "../../utils/datetime";

export type TimeoutReminderKind = "response" | "resolution";

export interface TimeoutReminderCard {
  notificationId: string;
  ticketId: number;
  ticketTitle: string;
  kind: TimeoutReminderKind;
  deadlineAt: string;
  remainingSeconds: number;
  status: NotificationSummary["status"];
}

const RESPONSE_CATEGORY = "ticket_timeout_response_reminder";
const RESOLUTION_CATEGORY = "ticket_timeout_resolution_reminder";

function parseNumericTicketId(notification: NotificationSummary): number | null {
  const payloadValue = notification.action_payload.ticket_id;
  if (typeof payloadValue === "number" && Number.isFinite(payloadValue)) {
    return payloadValue;
  }
  if (
    notification.related_resource_type === "ticket"
    && typeof notification.related_resource_id === "string"
  ) {
    const parsed = Number.parseInt(notification.related_resource_id, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseReminderKind(notification: NotificationSummary): TimeoutReminderKind | null {
  const payloadValue = notification.action_payload.reminder_kind;
  if (payloadValue === "response" || payloadValue === "resolution") {
    return payloadValue;
  }
  if (notification.category === RESPONSE_CATEGORY) {
    return "response";
  }
  if (notification.category === RESOLUTION_CATEGORY) {
    return "resolution";
  }
  return null;
}

function parseDeadlineAt(notification: NotificationSummary): string | null {
  const payloadValue = notification.action_payload.deadline_at;
  if (typeof payloadValue !== "string" || payloadValue.trim().length === 0) {
    return null;
  }
  return payloadValue;
}

export function buildTimeoutReminderCards(
  notifications: NotificationSummary[],
  nowMs: number,
): TimeoutReminderCard[] {
  const cards: TimeoutReminderCard[] = [];
  for (const notification of notifications) {
    if (
      notification.category !== RESPONSE_CATEGORY
      && notification.category !== RESOLUTION_CATEGORY
    ) {
      continue;
    }
    if (notification.status === "read") {
      continue;
    }
    const ticketId = parseNumericTicketId(notification);
    if (ticketId === null) {
      continue;
    }
    const reminderKind = parseReminderKind(notification);
    if (reminderKind === null) {
      continue;
    }
    const deadlineAt = parseDeadlineAt(notification);
    if (deadlineAt === null) {
      continue;
    }
    const deadlineDate = parseApiDate(deadlineAt);
    if (!deadlineDate) {
      continue;
    }
    const remainingMs = deadlineDate.getTime() - nowMs;
    if (remainingMs <= 0) {
      continue;
    }
    cards.push({
      notificationId: notification.id,
      ticketId,
      ticketTitle:
        typeof notification.action_payload.ticket_title === "string"
          ? notification.action_payload.ticket_title
          : notification.title,
      kind: reminderKind,
      deadlineAt,
      remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      status: notification.status,
    });
  }
  cards.sort((left, right) => {
    if (left.remainingSeconds !== right.remainingSeconds) {
      return left.remainingSeconds - right.remainingSeconds;
    }
    if (left.ticketId !== right.ticketId) {
      return left.ticketId - right.ticketId;
    }
    return left.kind.localeCompare(right.kind);
  });
  return cards;
}
