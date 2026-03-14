import { useEffect, useState } from "react";

import type { TicketSummary } from "../../types/ticket.ts";
import { parseApiDate } from "../../utils/datetime.ts";

type Language = "zh" | "en";
type DeadlineKind = "response" | "resolution";

export interface TicketDeadlinePresentation {
  label: string;
  tone: "healthy" | "overdue" | "muted";
  isOverdue: boolean;
}

interface DeadlineDescriptor {
  deadlineAt: string | null;
  completedAt: string | null;
  timeoutAt: string | null;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDuration(totalSeconds: number, language: Language) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const timePart = `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
  if (days <= 0) {
    return timePart;
  }
  return language === "zh" ? `${days}天 ${timePart}` : `${days}d ${timePart}`;
}

function resolveDescriptor(ticket: TicketSummary, kind: DeadlineKind): DeadlineDescriptor {
  if (kind === "response") {
    return {
      deadlineAt: ticket.response_deadline_at,
      completedAt: ticket.responded_at,
      timeoutAt: ticket.response_timeout_at,
    };
  }
  return {
    deadlineAt: ticket.resolution_deadline_at,
    completedAt: ticket.resolved_at ?? ticket.closed_at,
    timeoutAt: ticket.resolution_timeout_at,
  };
}

export function getTicketDeadlinePresentation(
  ticket: TicketSummary,
  kind: DeadlineKind,
  nowMs: number,
  language: Language,
): TicketDeadlinePresentation {
  const descriptor = resolveDescriptor(ticket, kind);
  const deadlineMs = parseApiDate(descriptor.deadlineAt)?.getTime();

  if (deadlineMs == null) {
    return { label: "-", tone: "muted", isOverdue: false };
  }

  const completedMs = parseApiDate(descriptor.completedAt)?.getTime() ?? null;
  if (completedMs != null) {
    const deltaSeconds = Math.abs((deadlineMs - completedMs) / 1000);
    if (completedMs > deadlineMs) {
      return {
        label: language === "zh" ? `超时 ${formatDuration(deltaSeconds, language)}` : `Over ${formatDuration(deltaSeconds, language)}`,
        tone: "overdue",
        isOverdue: true,
      };
    }
    return {
      label: formatDuration(0, language),
      tone: "healthy",
      isOverdue: false,
    };
  }

  const remainingSeconds = (deadlineMs - nowMs) / 1000;
  if (remainingSeconds < 0) {
    return {
      label: language === "zh" ? `超时 ${formatDuration(Math.abs(remainingSeconds), language)}` : `Over ${formatDuration(Math.abs(remainingSeconds), language)}`,
      tone: "overdue",
      isOverdue: true,
    };
  }

  return {
    label: formatDuration(remainingSeconds, language),
    tone: "healthy",
    isOverdue: false,
  };
}

export function useTicketDeadlineClock(syncToken?: string | number | null) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Reserve a single sync point for future websocket-driven ticket refreshes.
    // When ticket payload updates arrive, callers can pass a new token to force
    // an immediate recompute without changing every deadline cell.
    if (syncToken == null) {
      return;
    }
    setNowMs(Date.now());
  }, [syncToken]);

  return nowMs;
}
