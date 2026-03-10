import { ExternalLink, ShieldAlert, TimerOff, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../contexts/LanguageContext";
import type { TicketSummary } from "../types/ticket";
import { formatApiDateTime } from "../utils/datetime";

interface TicketDrawerProps {
  ticket: TicketSummary | null;
  open: boolean;
  onClose: () => void;
}

function statusClass(status: string) {
  switch (status) {
    case "WAITING_RESPONSE":
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
    case "IN_PROGRESS":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
    case "RESOLUTION_TIMEOUT":
    case "RESPONSE_TIMEOUT":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
    case "RESOLVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }
}

function riskClass(score: number) {
  if (score >= 90) return "text-red-600 dark:text-red-400";
  if (score >= 70) return "text-orange-600 dark:text-orange-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-emerald-600 dark:text-emerald-400";
}

export default function TicketDrawer({ ticket, open, onClose }: TicketDrawerProps) {
  const { language, t } = useLanguage();

  return (
    <div
      className="flex-shrink-0 overflow-hidden transition-[width,margin] duration-300 ease-out"
      style={{ width: open ? 460 : 0, marginLeft: open ? 16 : 0 }}
    >
      <div className="flex h-full w-[460px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {ticket ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">#{ticket.id}</span>
                  <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(ticket.main_status)}`}>
                    {t(`status.${ticket.main_status.toLowerCase()}`)}
                  </span>
                </div>
                <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{ticket.title}</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-4">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Description</div>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{ticket.description}</p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <InfoField label={t("ticket.category")} value={ticket.category_name} />
                <InfoField label={t("ticket.priority")} value={ticket.priority} />
                <InfoField
                  label={t("ticket.risk")}
                  value={
                    <span className={`inline-flex items-center gap-2 font-semibold ${riskClass(ticket.risk_score)}`}>
                      <ShieldAlert className="h-4 w-4" />
                      {ticket.risk_score}
                    </span>
                  }
                />
                <InfoField label={t("ticket.subStatus")} value={t(`substatus.${ticket.sub_status.toLowerCase()}`)} />
                <InfoField label={t("ticket.assignee")} value={ticket.assigned_to ?? "-"} />
                <InfoField label={t("ticket.pool")} value={ticket.current_pool_code ?? "-"} />
                <InfoField label={t("ticket.createdAt")} value={formatApiDateTime(ticket.created_at, language)} />
                <InfoField label={t("ticket.updatedAt")} value={formatApiDateTime(ticket.updated_at, language)} />
              </section>

              <section className="grid gap-3">
                <InfoField label={t("ticket.responseDeadline")} value={formatApiDateTime(ticket.response_deadline_at, language)} />
                <InfoField label={t("ticket.resolutionDeadline")} value={formatApiDateTime(ticket.resolution_deadline_at, language)} />
                {ticket.response_timeout_at && (
                  <InfoField
                    label="Response Timeout"
                    value={
                      <span className="inline-flex items-center gap-2 text-red-600 dark:text-red-400">
                        <TimerOff className="h-4 w-4" />
                        {formatApiDateTime(ticket.response_timeout_at, language)}
                      </span>
                    }
                  />
                )}
              </section>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <Link
                to={`/tickets/${ticket.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                Full Details
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}
