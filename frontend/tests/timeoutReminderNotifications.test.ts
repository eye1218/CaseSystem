import assert from "node:assert/strict";

import { buildTimeoutReminderCards } from "../src/features/notifications/timeoutReminderNotifications.ts";
import type { NotificationSummary } from "../src/types/notification.ts";

const now = new Date("2026-03-19T10:00:00Z").getTime();

const notifications: NotificationSummary[] = [
  {
    id: "n-response",
    user_id: "user-analyst",
    category: "ticket_timeout_response_reminder",
    title: "响应提醒",
    content: "请尽快响应",
    related_resource_type: "ticket",
    related_resource_id: "100101",
    status: "pending",
    action_required: false,
    action_type: null,
    action_status: null,
    action_payload: {
      ticket_id: 100101,
      ticket_title: "响应提醒工单",
      reminder_kind: "response",
      deadline_at: "2026-03-19T10:03:00Z",
      remaining_seconds: 180,
      pool_code: "T1_POOL",
    },
    created_at: "2026-03-19T09:55:00Z",
    delivered_at: null,
    read_at: null,
    expire_at: null,
  },
  {
    id: "n-resolution",
    user_id: "user-analyst",
    category: "ticket_timeout_resolution_reminder",
    title: "处置提醒",
    content: "请尽快处置",
    related_resource_type: "ticket",
    related_resource_id: "100102",
    status: "delivered",
    action_required: false,
    action_type: null,
    action_status: null,
    action_payload: {
      ticket_id: 100102,
      ticket_title: "处置提醒工单",
      reminder_kind: "resolution",
      deadline_at: "2026-03-19T10:08:00Z",
      remaining_seconds: 480,
      pool_code: "T1_POOL",
    },
    created_at: "2026-03-19T09:56:00Z",
    delivered_at: null,
    read_at: null,
    expire_at: null,
  },
  {
    id: "n-read",
    user_id: "user-analyst",
    category: "ticket_timeout_response_reminder",
    title: "已读提醒",
    content: "read",
    related_resource_type: "ticket",
    related_resource_id: "100103",
    status: "read",
    action_required: false,
    action_type: null,
    action_status: null,
    action_payload: {
      ticket_id: 100103,
      ticket_title: "已读工单",
      reminder_kind: "response",
      deadline_at: "2026-03-19T10:04:00Z",
      remaining_seconds: 240,
      pool_code: "T1_POOL",
    },
    created_at: "2026-03-19T09:57:00Z",
    delivered_at: null,
    read_at: "2026-03-19T09:58:00Z",
    expire_at: null,
  },
  {
    id: "n-expired",
    user_id: "user-analyst",
    category: "ticket_timeout_resolution_reminder",
    title: "过期提醒",
    content: "expired",
    related_resource_type: "ticket",
    related_resource_id: "100104",
    status: "pending",
    action_required: false,
    action_type: null,
    action_status: null,
    action_payload: {
      ticket_id: 100104,
      ticket_title: "过期工单",
      reminder_kind: "resolution",
      deadline_at: "2026-03-19T09:59:00Z",
      remaining_seconds: 0,
      pool_code: "T1_POOL",
    },
    created_at: "2026-03-19T09:50:00Z",
    delivered_at: null,
    read_at: null,
    expire_at: null,
  },
];

const cards = buildTimeoutReminderCards(notifications, now);

assert.deepStrictEqual(
  cards.map((item) => [item.notificationId, item.ticketId, item.kind]),
  [
    ["n-response", 100101, "response"],
    ["n-resolution", 100102, "resolution"],
  ],
);

