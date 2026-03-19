import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { buildTimeoutReminderCards } from "../features/notifications/timeoutReminderNotifications";
import { playTimeoutReminderSound } from "../features/notifications/sound";
import { formatApiDateTime } from "../utils/datetime";

function formatRemainingMinutesLabel(remainingSeconds: number, zh: boolean): string {
  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  return zh ? `剩余约 ${minutes} 分钟` : `About ${minutes} min left`;
}

export default function TicketTimeoutReminderStack() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { notifications, markAsRead, soundEnabled } = useRealtime();
  const navigate = useNavigate();
  const zh = language === "zh";

  const [nowMs, setNowMs] = useState(() => Date.now());
  const playedReminderIdsRef = useRef<Set<string>>(new Set());

  const isInternalUser = user?.active_role
    ? user.active_role !== "CUSTOMER"
    : false;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleReminders = useMemo(
    () => buildTimeoutReminderCards(notifications, nowMs).slice(0, 3),
    [notifications, nowMs],
  );

  useEffect(() => {
    if (!soundEnabled || visibleReminders.length === 0) {
      return;
    }
    const hasNewReminder = visibleReminders.some(
      (item) => !playedReminderIdsRef.current.has(item.notificationId),
    );
    for (const item of visibleReminders) {
      playedReminderIdsRef.current.add(item.notificationId);
    }
    if (hasNewReminder) {
      void playTimeoutReminderSound();
    }
  }, [soundEnabled, visibleReminders]);

  if (!isInternalUser || visibleReminders.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-30 flex w-[400px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {visibleReminders.map((item) => {
        const timeoutTypeLabel = item.kind === "response"
          ? (zh ? "响应超时提醒" : "Response Timeout Reminder")
          : (zh ? "处置超时提醒" : "Resolution Timeout Reminder");

        return (
          <section
            key={item.notificationId}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl dark:border-amber-900/60 dark:bg-slate-900"
          >
            <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/25">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                      {timeoutTypeLabel}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {zh ? `工单 #${item.ticketId}` : `Ticket #${item.ticketId}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    void markAsRead(item.notificationId);
                  }}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3 px-4 py-3">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {item.ticketTitle}
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                <div>{formatRemainingMinutesLabel(item.remainingSeconds, zh)}</div>
                <div className="mt-1">
                  {zh ? "超时时间：" : "Deadline:"} {formatApiDateTime(item.deadlineAt, language)}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/tickets/${item.ticketId}`);
                    if (item.status !== "read") {
                      void markAsRead(item.notificationId);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {zh ? "打开工单" : "Open Ticket"}
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
