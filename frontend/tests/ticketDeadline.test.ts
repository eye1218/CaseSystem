import assert from "node:assert/strict";

import { getTicketDeadlinePresentation } from "../src/features/tickets/deadlines.ts";
import type { TicketSummary } from "../src/types/ticket.ts";

function buildTicket(overrides: Partial<TicketSummary>): TicketSummary {
  return {
    id: 1,
    version: 1,
    title: "Example",
    description: "Example",
    category_id: "intrusion",
    category_name: "Intrusion Detection",
    source: "SIEM",
    priority: "P1",
    risk_score: 90,
    main_status: "IN_PROGRESS",
    sub_status: "NONE",
    created_by: "System",
    assigned_to: "Analyst",
    assigned_to_user_id: "user-analyst",
    current_pool_code: null,
    responsibility_level: "T1",
    response_deadline_at: "2026-03-15T10:05:10",
    resolution_deadline_at: "2026-03-15T11:05:10",
    responded_at: null,
    response_timeout_at: null,
    resolved_at: null,
    resolution_timeout_at: null,
    closed_at: null,
    created_at: "2026-03-15T09:00:00",
    updated_at: "2026-03-15T09:00:00",
    ...overrides,
  };
}

const nowMs = new Date("2026-03-15T10:00:00Z").getTime();

const active = getTicketDeadlinePresentation(buildTicket({}), "response", nowMs, "en");
assert.equal(active.label, "00:05:10");
assert.equal(active.tone, "healthy");
assert.equal(active.isOverdue, false);

const overdue = getTicketDeadlinePresentation(
  buildTicket({ response_deadline_at: "2026-03-15T09:58:50" }),
  "response",
  nowMs,
  "en",
);
assert.equal(overdue.label, "Over 00:01:10");
assert.equal(overdue.tone, "overdue");
assert.equal(overdue.isOverdue, true);

const completedInTime = getTicketDeadlinePresentation(
  buildTicket({ responded_at: "2026-03-15T10:01:00" }),
  "response",
  nowMs,
  "zh",
);
assert.equal(completedInTime.label, "00:00:00");
assert.equal(completedInTime.tone, "healthy");

const completedLate = getTicketDeadlinePresentation(
  buildTicket({
    responded_at: "2026-03-15T10:06:15",
    response_timeout_at: "2026-03-15T10:05:11",
  }),
  "response",
  nowMs,
  "zh",
);
assert.equal(completedLate.label, "超时 00:01:05");
assert.equal(completedLate.tone, "overdue");
