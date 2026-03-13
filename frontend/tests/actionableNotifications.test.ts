import assert from "node:assert/strict";

import {
  buildActionableNotificationCards,
  resolveNotificationTicketPath,
} from "../src/features/notifications/utils.ts";
import type { NotificationSummary } from "../src/types/notification.ts";

const notifications: NotificationSummary[] = [
  {
    id: "n-1",
    user_id: "user-admin",
    category: "ticket_escalation_request",
    title: "工单升级待处理",
    content: "工单 #100177 等待你确认",
    related_resource_type: "ticket_escalation",
    related_resource_id: "esc-1",
    status: "delivered",
    action_required: true,
    action_type: "ticket_escalation",
    action_status: "pending",
    action_payload: {
      escalation_id: "esc-1",
      ticket_id: 100177,
      requester_name: "Analyst",
    },
    created_at: "2026-03-13T09:00:00Z",
    delivered_at: "2026-03-13T09:00:01Z",
    read_at: null,
    expire_at: null,
  },
  {
    id: "n-2",
    user_id: "user-admin",
    category: "ticket_escalation_accepted",
    title: "升级已接受",
    content: "工单已被接手",
    related_resource_type: "ticket",
    related_resource_id: "100177",
    status: "read",
    action_required: false,
    action_type: null,
    action_status: null,
    action_payload: {},
    created_at: "2026-03-13T09:02:00Z",
    delivered_at: "2026-03-13T09:02:01Z",
    read_at: "2026-03-13T09:03:00Z",
    expire_at: null,
  },
];

const cards = buildActionableNotificationCards(notifications);

assert.deepStrictEqual(cards.map((item) => item.id), ["n-1"]);
assert.strictEqual(cards[0].escalationId, "esc-1");
assert.strictEqual(cards[0].ticketId, 100177);
assert.strictEqual(resolveNotificationTicketPath(notifications[0]), "/tickets/100177");
assert.strictEqual(resolveNotificationTicketPath(notifications[1]), "/tickets/100177");
