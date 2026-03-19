import type { NotificationSummary } from "../../types/notification";

export function sortNotificationsByCreatedAt(
  notifications: NotificationSummary[],
): NotificationSummary[] {
  return [...notifications].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

export function collectNewUnplayedNotifications(
  current: NotificationSummary[],
  next: NotificationSummary[],
  playedIds: ReadonlySet<string>,
): NotificationSummary[] {
  const currentIds = new Set(current.map((item) => item.id));
  return next.filter(
    (item) => !currentIds.has(item.id) && !playedIds.has(item.id),
  );
}
