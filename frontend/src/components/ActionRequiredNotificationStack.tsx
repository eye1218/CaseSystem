import { CheckCheck, ExternalLink, ShieldAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { acceptTicketEscalation, rejectTicketEscalation } from "../api/tickets";
import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { buildActionableNotificationCards, resolveNotificationTicketPath } from "../features/notifications/utils";
import { formatApiDateTime } from "../utils/datetime";

export default function ActionRequiredNotificationStack() {
  const { language } = useLanguage();
  const { notifications, refreshNotifications } = useRealtime();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const actionableCards = useMemo(
    () => buildActionableNotificationCards(notifications),
    [notifications],
  );

  if (actionableCards.length === 0 && !errorMessage) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed top-20 right-6 z-40 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {actionableCards.map((card) => {
        const notification = notifications.find((item) => item.id === card.id);
        const ticketPath = notification ? resolveNotificationTicketPath(notification) : null;
        const busy = submittingId === card.id;

        return (
          <section
            key={card.id}
            className="pointer-events-auto overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl dark:border-amber-900/60 dark:bg-slate-900"
          >
            <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/25">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300">
                      {language === "zh" ? "需要处理" : "Action Required"}
                    </span>
                    {card.requesterName ? (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{card.requesterName}</span>
                    ) : null}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{card.title}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {formatApiDateTime(card.createdAt, language)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{card.content}</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                {language === "zh"
                  ? "该弹窗在你接受或拒绝前不会消失，但不会阻塞其他页面操作。"
                  : "This prompt stays visible until you accept or reject, but it does not block the rest of the interface."}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {ticketPath ? (
                  <Link
                    to={ticketPath}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {language === "zh" ? "打开工单" : "Open Ticket"}
                  </Link>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleReject(card.id, card.escalationId, setSubmittingId, setErrorMessage, refreshNotifications)}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    <XCircle className="h-4 w-4" />
                    {busy ? (language === "zh" ? "提交中" : "Submitting") : language === "zh" ? "拒绝" : "Reject"}
                  </button>
                  <button
                    onClick={() => void handleAccept(card.id, card.escalationId, setSubmittingId, setErrorMessage, refreshNotifications)}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCheck className="h-4 w-4" />
                    {busy ? (language === "zh" ? "提交中" : "Submitting") : language === "zh" ? "接受" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {errorMessage ? (
        <div className="pointer-events-auto rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

async function handleAccept(
  notificationId: string,
  escalationId: string,
  setSubmittingId: (value: string | null) => void,
  setErrorMessage: (value: string) => void,
  refreshNotifications: () => Promise<void>,
) {
  setSubmittingId(notificationId);
  setErrorMessage("");
  try {
    await acceptTicketEscalation(escalationId);
    await refreshNotifications();
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : "Failed to accept escalation");
  } finally {
    setSubmittingId(null);
  }
}

async function handleReject(
  notificationId: string,
  escalationId: string,
  setSubmittingId: (value: string | null) => void,
  setErrorMessage: (value: string) => void,
  refreshNotifications: () => Promise<void>,
) {
  setSubmittingId(notificationId);
  setErrorMessage("");
  try {
    await rejectTicketEscalation(escalationId, {});
    await refreshNotifications();
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : "Failed to reject escalation");
  } finally {
    setSubmittingId(null);
  }
}
