import type { TicketSummary } from "../../types/ticket";
import { parseApiDate } from "../../utils/datetime";
import type { TicketTimeoutReminderConfig } from "./timeoutReminderConfig";

export type TicketTimeoutReminderKind = "response" | "resolution";

export interface TicketTimeoutReminderItem {
  id: string;
  ticketId: number;
  ticketTitle: string;
  kind: TicketTimeoutReminderKind;
  deadlineAt: string;
  remainingSeconds: number;
}

function resolveResponseReminder(
  ticket: TicketSummary,
  nowMs: number,
  responseReminderMinutes: number,
): TicketTimeoutReminderItem | null {
  if (ticket.main_status !== "WAITING_RESPONSE") {
    return null;
  }
  if (ticket.responded_at || ticket.resolved_at || ticket.closed_at) {
    return null;
  }

  const deadline = parseApiDate(ticket.response_deadline_at);
  if (!deadline || !ticket.response_deadline_at) {
    return null;
  }

  const remainingMs = deadline.getTime() - nowMs;
  if (remainingMs <= 0) {
    return null;
  }
  if (remainingMs > responseReminderMinutes * 60_000) {
    return null;
  }

  return {
    id: `${ticket.id}:response:${ticket.response_deadline_at}`,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    kind: "response",
    deadlineAt: ticket.response_deadline_at,
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
  };
}

function resolveResolutionReminder(
  ticket: TicketSummary,
  nowMs: number,
  resolutionReminderMinutes: number,
): TicketTimeoutReminderItem | null {
  if (ticket.main_status === "RESOLVED" || ticket.main_status === "CLOSED") {
    return null;
  }
  if (ticket.resolved_at || ticket.closed_at) {
    return null;
  }

  const deadline = parseApiDate(ticket.resolution_deadline_at);
  if (!deadline || !ticket.resolution_deadline_at) {
    return null;
  }

  const remainingMs = deadline.getTime() - nowMs;
  if (remainingMs <= 0) {
    return null;
  }
  if (remainingMs > resolutionReminderMinutes * 60_000) {
    return null;
  }

  return {
    id: `${ticket.id}:resolution:${ticket.resolution_deadline_at}`,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    kind: "resolution",
    deadlineAt: ticket.resolution_deadline_at,
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
  };
}

export function collectTicketTimeoutReminders(
  tickets: TicketSummary[],
  nowMs: number,
  config: TicketTimeoutReminderConfig,
): TicketTimeoutReminderItem[] {
  const reminders: TicketTimeoutReminderItem[] = [];
  for (const ticket of tickets) {
    const responseReminder = resolveResponseReminder(
      ticket,
      nowMs,
      config.responseReminderMinutes,
    );
    if (responseReminder) {
      reminders.push(responseReminder);
    }

    const resolutionReminder = resolveResolutionReminder(
      ticket,
      nowMs,
      config.resolutionReminderMinutes,
    );
    if (resolutionReminder) {
      reminders.push(resolutionReminder);
    }
  }

  reminders.sort((left, right) => {
    if (left.remainingSeconds !== right.remainingSeconds) {
      return left.remainingSeconds - right.remainingSeconds;
    }
    if (left.ticketId !== right.ticketId) {
      return left.ticketId - right.ticketId;
    }
    return left.kind.localeCompare(right.kind);
  });

  return reminders;
}
