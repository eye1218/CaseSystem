import assert from "node:assert/strict";

import {
  collectNewUnplayedNotifications,
  sortNotificationsByCreatedAt,
} from "../src/features/notifications/realtimePolling.ts";
import type { NotificationSummary } from "../src/types/notification.ts";

function buildNotification(id: string, createdAt: string): NotificationSummary {
  return {
    id,
    user_id: "user-analyst",
    category: "ticket_assigned",
    title: `n-${id}`,
    content: `content-${id}`,
    related_resource_type: "ticket",
    related_resource_id: id,
    status: "pending",
    action_required: false,
    action_type: null,
    action_status: null,
    action_payload: {},
    created_at: createdAt,
    delivered_at: null,
    read_at: null,
    expire_at: null,
  };
}

const n1 = buildNotification("n1", "2026-03-19T10:00:00Z");
const n2 = buildNotification("n2", "2026-03-19T10:02:00Z");
const n3 = buildNotification("n3", "2026-03-19T10:01:00Z");

assert.deepStrictEqual(sortNotificationsByCreatedAt([n1, n2, n3]).map((item) => item.id), [
  "n2",
  "n3",
  "n1",
]);

const current = [n1, n3];
const next = [n2, n3, n1];

assert.deepStrictEqual(
  collectNewUnplayedNotifications(current, next, new Set<string>()).map((item) => item.id),
  ["n2"],
);

assert.deepStrictEqual(
  collectNewUnplayedNotifications(current, next, new Set<string>(["n2"])).map((item) => item.id),
  [],
);
