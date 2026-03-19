import assert from "node:assert/strict";

import { collectTicketTimeoutReminders } from "../src/features/tickets/timeoutReminders.ts";
import type { TicketSummary } from "../src/types/ticket.ts";

const now = new Date("2026-03-19T10:00:00Z").getTime();

function buildTicket(overrides: Partial<TicketSummary>): TicketSummary {
  return {
    id: 100001,
    version: 1,
    title: "Demo Ticket",
    description: "Demo",
    category_id: "intrusion",
    category_name: "入侵检测",
    source: "INTERNAL",
    priority: "P2",
    risk_score: 60,
    main_status: "WAITING_RESPONSE",
    sub_status: "NONE",
    created_by: "Analyst",
    assigned_to: "Analyst",
    assigned_to_user_id: "user-analyst",
    current_pool_code: null,
    responsibility_level: "T1",
    response_deadline_at: "2026-03-19T10:04:00Z",
    resolution_deadline_at: "2026-03-19T10:20:00Z",
    responded_at: null,
    response_timeout_at: null,
    resolved_at: null,
    resolution_timeout_at: null,
    closed_at: null,
    created_at: "2026-03-19T09:30:00Z",
    updated_at: "2026-03-19T09:30:00Z",
    ...overrides,
  };
}

const reminders = collectTicketTimeoutReminders(
  [
    buildTicket({ id: 100001 }),
    buildTicket({
      id: 100002,
      main_status: "IN_PROGRESS",
      response_deadline_at: "2026-03-19T10:02:00Z",
      responded_at: "2026-03-19T09:40:00Z",
      resolution_deadline_at: "2026-03-19T10:25:00Z",
    }),
    buildTicket({
      id: 100003,
      response_deadline_at: "2026-03-19T10:12:00Z",
      resolution_deadline_at: "2026-03-19T11:20:00Z",
    }),
    buildTicket({
      id: 100004,
      main_status: "RESOLVED",
      resolved_at: "2026-03-19T09:59:00Z",
      response_deadline_at: "2026-03-19T10:03:00Z",
      resolution_deadline_at: "2026-03-19T10:03:00Z",
    }),
  ],
  now,
  {
    key: "DEFAULT",
    responseReminderMinutes: 5,
    resolutionReminderMinutes: 30,
  },
);

assert.deepStrictEqual(
  reminders.map((item) => [item.ticketId, item.kind]),
  [
    [100001, "response"],
    [100001, "resolution"],
    [100002, "resolution"],
  ],
);
