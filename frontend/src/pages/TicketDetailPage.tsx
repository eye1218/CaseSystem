import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Inbox,
  Lock,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  UserCheck
} from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { addTicketComment, getTicketDetail, getTicketLive, runTicketAction, updateTicket } from "../api/tickets";
import RelatedKnowledgePanel from "../components/RelatedKnowledgePanel";
import TicketReportSections from "../components/TicketReportSections";
import { ticketCategoryOptions } from "../constants/ticketCategories";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import type { TicketActivityItem, TicketDetail, TicketLive, TicketPriority } from "../types/ticket";
import { formatApiDateTime, parseApiDate } from "../utils/datetime";

type MainTab = "activity" | "alerts" | "context";

interface EditFormState {
  title: string;
  description: string;
  category_id: string;
  priority: TicketPriority;
  risk_score: string;
}

const categoryOptions = ticketCategoryOptions.map((item) => ({
  value: item.id,
  zh: item.zh,
  en: item.en
}));

const actionOrder = ["respond", "resolve", "close", "reopen", "claim", "move_to_pool", "edit"];

function priorityClass(priority: string) {
  switch (priority) {
    case "P1":
      return "bg-red-500 text-white";
    case "P2":
      return "bg-orange-500 text-white";
    case "P3":
      return "bg-yellow-400 text-slate-950";
    default:
      return "bg-emerald-500 text-white";
  }
}

function statusClass(status: string) {
  switch (status) {
    case "WAITING_RESPONSE":
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
    case "IN_PROGRESS":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
    case "RESPONSE_TIMEOUT":
    case "RESOLUTION_TIMEOUT":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
    case "RESOLVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "CLOSED":
      return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";
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

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function actionLabel(action: string, language: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    respond: { zh: "响应", en: "Respond" },
    resolve: { zh: "处置完成", en: "Resolve" },
    close: { zh: "关闭", en: "Close" },
    reopen: { zh: "重开", en: "Reopen" },
    claim: { zh: "领取工单", en: "Claim" },
    move_to_pool: { zh: "加入池子", en: "Move to Pool" },
    edit: { zh: "编辑", en: "Edit" }
  };
  return labels[action]?.[language] ?? action;
}

function actionIcon(action: string) {
  switch (action) {
    case "respond":
      return <Radio className="h-4 w-4" />;
    case "resolve":
      return <CheckCircle2 className="h-4 w-4" />;
    case "close":
      return <Lock className="h-4 w-4" />;
    case "reopen":
      return <RefreshCw className="h-4 w-4" />;
    case "claim":
      return <UserCheck className="h-4 w-4" />;
    case "move_to_pool":
      return <Inbox className="h-4 w-4" />;
    default:
      return <Edit3 className="h-4 w-4" />;
  }
}

function markdownComponents() {
  return {
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="mt-0 mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
        <span className="inline-block h-4 w-1 rounded-full bg-blue-500" />
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</h3>
    ),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="mb-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>
    ),
    ul: ({ children }: { children?: ReactNode }) => <ul className="mb-2 space-y-1 pl-4">{children}</ul>,
    li: ({ children }: { children?: ReactNode }) => (
      <li className="list-disc text-sm text-slate-700 marker:text-slate-400 dark:text-slate-300">{children}</li>
    ),
    pre: ({ children }: { children?: ReactNode }) => (
      <pre className="my-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">{children}</pre>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
        {children}
      </code>
    )
  };
}

function ActivityIcon({ item }: { item: TicketActivityItem }) {
  switch (item.item_type) {
    case "created":
      return <Clock3 className="h-3.5 w-3.5" />;
    case "resolved":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "closed":
      return <Lock className="h-3.5 w-3.5" />;
    case "comment":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "claimed":
      return <UserCheck className="h-3.5 w-3.5" />;
    case "moved_to_pool":
      return <Inbox className="h-3.5 w-3.5" />;
    default:
      return <RefreshCw className="h-3.5 w-3.5" />;
  }
}

function ActivityTone(item: TicketActivityItem) {
  switch (item.item_type) {
    case "created":
      return "bg-slate-500";
    case "resolved":
      return "bg-emerald-500";
    case "closed":
      return "bg-slate-600";
    case "comment":
      return "bg-indigo-500";
    case "claimed":
      return "bg-blue-500";
    case "moved_to_pool":
      return "bg-orange-500";
    default:
      return "bg-purple-500";
  }
}

function SlaCard({
  label,
  deadline,
  createdAt,
  done,
  language
}: {
  label: string;
  deadline: string | null;
  createdAt: string;
  done: boolean;
  language: "zh" | "en";
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!deadline) {
    return <InfoCard label={label} value="-" />;
  }

  const createdAtDate = parseApiDate(createdAt);
  const deadlineDate = parseApiDate(deadline);
  if (!createdAtDate || !deadlineDate) {
    return <InfoCard label={label} value="-" />;
  }

  const createdTime = createdAtDate.getTime();
  const deadlineTime = deadlineDate.getTime();
  const total = Math.max(deadlineTime - createdTime, 1);
  const remaining = deadlineTime - now.getTime();
  const progress = Math.min(Math.max((now.getTime() - createdTime) / total, 0), 1);
  const overdue = !done && remaining <= 0;
  const atRisk = !done && !overdue && progress >= 0.8;
  const tone = done ? "bg-emerald-500" : overdue ? "bg-red-500" : atRisk ? "bg-orange-500" : "bg-blue-500";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
        <span
          className={`text-xs font-medium ${
            done
              ? "text-emerald-600 dark:text-emerald-400"
              : overdue
                ? "text-red-600 dark:text-red-400"
                : atRisk
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-blue-600 dark:text-blue-400"
          }`}
        >
          {done ? (language === "zh" ? "已达成" : "Met") : overdue ? (language === "zh" ? "已超时" : "Overdue") : atRisk ? (language === "zh" ? "即将到期" : "At Risk") : language === "zh" ? "进行中" : "Active"}
        </span>
      </div>
      <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">{formatApiDateTime(deadline, language)}</div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full ${tone}`} style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className={`text-sm font-semibold ${done ? "text-emerald-600 dark:text-emerald-400" : overdue ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-white"}`}>
        {done ? (language === "zh" ? "已完成" : "Completed") : formatDuration(Math.abs(remaining))}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}

function mergeLiveIntoDetail(current: TicketDetail, live: TicketLive): TicketDetail {
  return {
    ...current,
    ticket: live.ticket,
    available_actions: live.available_actions,
    activity_feed: live.activity_feed,
    raw_alerts: live.raw_alerts,
    responsibility_summary: live.responsibility_summary,
    permission_scope: live.permission_scope
  };
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const { lastTicketEvent } = useRealtime();
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<MainTab>("activity");
  const [commentText, setCommentText] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"PUBLIC" | "INTERNAL">("INTERNAL");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    title: "",
    description: "",
    category_id: "intrusion",
    priority: "P2",
    risk_score: "50"
  });

  const loadDetail = async (ticketId: string) => {
    setLoading(true);
    setError("");
    try {
      const payload = await getTicketDetail(ticketId);
      setDetail(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      await loadDetail(id);
      if (cancelled) {
        return;
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !lastTicketEvent) {
      return;
    }
    const ticketId = id;
    if (String(lastTicketEvent.payload.ticket_id) !== ticketId) {
      return;
    }

    let cancelled = false;

    async function refreshLiveSlices() {
      try {
        const payload = await getTicketLive(ticketId);
        if (cancelled) {
          return;
        }
        setDetail((current) => (current ? mergeLiveIntoDetail(current, payload) : current));
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        if (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404)) {
          setDetail(null);
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to refresh ticket");
      }
    }

    void refreshLiveSlices();

    return () => {
      cancelled = true;
    };
  }, [id, lastTicketEvent]);

  useEffect(() => {
    if (!detail) return;
    setForm({
      title: detail.ticket.title,
      description: detail.ticket.description,
      category_id: detail.ticket.category_id,
      priority: detail.ticket.priority,
      risk_score: String(detail.ticket.risk_score)
    });
    setCommentVisibility(user?.active_role === "CUSTOMER" ? "PUBLIC" : "INTERNAL");
  }, [detail, user?.active_role]);

  const ticket = detail?.ticket;

  const handleAction = async (action: string) => {
    if (!id || !detail) return;
    if (action === "edit") {
      setEditing((current) => !current);
      return;
    }

    setSubmitting(action);
    setError("");
    try {
      const payload = await runTicketAction(id, action, {
        version: detail.ticket.version
      });
      setDetail(payload);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !detail || !commentText.trim()) return;

    setSubmitting("comment");
    setError("");
    try {
      const payload = await addTicketComment(id, {
        version: detail.ticket.version,
        content: commentText.trim(),
        visibility: commentVisibility
      });
      setDetail(payload);
      setCommentText("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Comment failed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !detail) return;

    setSubmitting("edit");
    setError("");
    try {
      const payload = await updateTicket(id, {
        version: detail.ticket.version,
        title: form.title,
        description: form.description,
        category_id: form.category_id,
        priority: form.priority,
        risk_score: Number(form.risk_score)
      });
      setDetail(payload);
      setEditing(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Update failed");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</div>;
  }

  if (!detail || !ticket) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{error || "Ticket not found."}</div>;
  }

  const localizedContext = detail.siem_context_markdown[language];
  const summaryText = detail.responsibility_summary[language];
  const contextSummary = detail.external_context.summary[language];
  const availableActions = actionOrder.filter((action) => detail.available_actions.includes(action));

  return (
    <div className="flex h-full items-stretch p-6">
      <div className="flex min-w-0 flex-1 gap-6">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="space-y-4">
            <Link
              to="/tickets"
              className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("nav.tickets")}
            </Link>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{ticket.id}</span>
                    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(ticket.main_status)}`}>
                      {t(`status.${ticket.main_status.toLowerCase()}`)}
                    </span>
                    <span className="inline-flex rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {t(`substatus.${ticket.sub_status.toLowerCase()}`)}
                    </span>
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold ${riskClass(ticket.risk_score)} dark:bg-slate-800`}>
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {ticket.risk_score}
                    </span>
                  </div>
                  <h1 className="mb-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{ticket.title}</h1>
                  <p className="max-w-4xl text-sm leading-7 text-slate-600 dark:text-slate-300">{ticket.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:max-w-md lg:justify-end">
                  {availableActions.map((action) => (
                    <button
                      key={action}
                      onClick={() => void handleAction(action)}
                      disabled={submitting !== null}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                        action === "respond" || action === "resolve"
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : action === "close" || action === "reopen"
                            ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {actionIcon(action)}
                      {submitting === action ? t("common.loading") : actionLabel(action, language)}
                    </button>
                  ))}
                </div>
              </div>

              {editing && (
                <form onSubmit={handleEditSubmit} className="mb-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50 md:grid-cols-2">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block font-medium">{t("ticket.title")}</span>
                    <input
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block font-medium">{t("ticket.category")}</span>
                    <select
                      value={form.category_id}
                      onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option[language]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block font-medium">{t("ticket.priority")}</span>
                    <select
                      value={form.priority}
                      onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TicketPriority }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    >
                      {["P1", "P2", "P3", "P4"].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-600 dark:text-slate-300">
                    <span className="mb-2 block font-medium">{t("ticket.risk")}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.risk_score}
                      onChange={(event) => setForm((current) => ({ ...current, risk_score: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                    <span className="mb-2 block font-medium">Description</span>
                    <textarea
                      rows={5}
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  <div className="md:col-span-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting === "edit"}
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {submitting === "edit" ? t("common.loading") : "Save"}
                    </button>
                  </div>
                </form>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <InfoCard label={t("ticket.category")} value={ticket.category_name} />
                <InfoCard label="Source" value={ticket.source} />
                <InfoCard label={t("ticket.assignee")} value={ticket.assigned_to ?? "-"} />
                <InfoCard label={t("ticket.pool")} value={ticket.current_pool_code ?? "-"} />
                <InfoCard label={t("ticket.createdAt")} value={formatApiDateTime(ticket.created_at, language)} />
                <InfoCard label={t("ticket.updatedAt")} value={formatApiDateTime(ticket.updated_at, language)} />
                <InfoCard label="Created By" value={ticket.created_by} />
                <InfoCard label="Role Scope" value={detail.permission_scope.current_role} />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              {(
                [
                  { value: "activity", label: language === "zh" ? "评论与协作" : "Activity" },
                  { value: "alerts", label: language === "zh" ? "原始告警" : "Alerts" },
                  { value: "context", label: language === "zh" ? "上下文摘要" : "Context" }
                ] as Array<{ value: MainTab; label: string }>
              ).map((item) => (
                <button
                  key={item.value}
                  onClick={() => setTab(item.value)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    tab === item.value
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "activity" && (
              <div className="px-5 py-5">
                <div className="relative">
                  {detail.activity_feed.map((item, index) => {
                    const isLast = index === detail.activity_feed.length - 1;
                    return (
                      <div key={item.id} className="relative flex gap-4 pb-6">
                        {!isLast && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />}
                        <div className={`relative z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white ${ActivityTone(item)}`}>
                          <ActivityIcon item={item} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.actor_name}</span>
                            {item.actor_role && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {item.actor_role}
                              </span>
                            )}
                            <span className="ml-auto text-xs font-mono text-slate-400">{formatApiDateTime(item.created_at, language)}</span>
                          </div>
                          {item.from_status && item.to_status ? (
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                              <span className={`inline-flex rounded-md border px-2 py-1 font-semibold ${statusClass(item.from_status)}`}>
                                {t(`status.${item.from_status.toLowerCase()}`)}
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              <span className={`inline-flex rounded-md border px-2 py-1 font-semibold ${statusClass(item.to_status)}`}>
                                {t(`status.${item.to_status.toLowerCase()}`)}
                              </span>
                            </div>
                          ) : (
                            <p
                              className={`rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
                                item.item_type === "comment"
                                  ? "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                                  : "text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {item.content}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleCommentSubmit} className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {language === "zh" ? "补充评论" : "Add Comment"}
                    </div>
                    {user?.active_role !== "CUSTOMER" && (
                      <select
                        value={commentVisibility}
                        onChange={(event) => setCommentVisibility(event.target.value as "PUBLIC" | "INTERNAL")}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="INTERNAL">{language === "zh" ? "内部评论" : "Internal"}</option>
                        <option value="PUBLIC">{language === "zh" ? "公开评论" : "Public"}</option>
                      </select>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder={language === "zh" ? "添加评论、处置结论或补充上下文..." : "Add a comment, resolution note, or context..."}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-slate-500">{language === "zh" ? "支持 Markdown 文本" : "Markdown text supported"}</span>
                    <button
                      type="submit"
                      disabled={submitting === "comment" || !commentText.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {submitting === "comment" ? t("common.loading") : language === "zh" ? "提交评论" : "Submit"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {tab === "alerts" && (
              <div className="overflow-auto">
                {detail.raw_alerts.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{language === "zh" ? "当前工单没有原始告警列表。" : "No raw alerts for this ticket."}</div>
                ) : (
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950">
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {["#", language === "zh" ? "时间" : "Time", "Rule", language === "zh" ? "源 IP:端口" : "Src IP:Port", language === "zh" ? "目标主机" : "Destination", language === "zh" ? "用户名" : "User", language === "zh" ? "结果" : "Result"].map((label) => (
                          <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detail.raw_alerts.map((alert) => (
                        <tr key={`${alert.rule_id}-${alert.seq}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{alert.seq}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{alert.time}</td>
                          <td className="px-4 py-3">
                            <span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                              {alert.rule_id}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                            {alert.src_ip}:{alert.src_port}
                          </td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{alert.dst_host}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">{alert.user}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded border px-2 py-1 text-xs font-semibold ${alert.result === "FAIL" || alert.result === "SUSPICIOUS" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
                              {alert.result}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === "context" && (
              <div className="px-5 py-5">
                {localizedContext ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents() as never}>
                    {localizedContext}
                  </Markdown>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{language === "zh" ? "当前工单无扩展上下文摘要。" : "No external context for this ticket."}</div>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="w-[368px] space-y-6 2xl:w-[392px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">SLA</h2>
            </div>
            <div className="space-y-3">
              <SlaCard
                label={language === "zh" ? "响应 SLA" : "Response SLA"}
                deadline={ticket.response_deadline_at}
                createdAt={ticket.created_at}
                done={Boolean(ticket.responded_at)}
                language={language}
              />
              <SlaCard
                label={language === "zh" ? "处置 SLA" : "Resolution SLA"}
                deadline={ticket.resolution_deadline_at}
                createdAt={ticket.created_at}
                done={Boolean(ticket.resolved_at || ticket.closed_at)}
                language={language}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{language === "zh" ? "责任归属" : "Responsibility"}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label={t("ticket.assignee")} value={ticket.assigned_to ?? (language === "zh" ? "未领取" : "Unclaimed")} />
              <InfoCard label={t("ticket.pool")} value={ticket.current_pool_code ?? "-"} />
              <div className="col-span-2">
                <InfoCard label={language === "zh" ? "责任层级" : "Tier"} value={ticket.responsibility_level} />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
              {summaryText}
            </div>
          </div>

          {user?.active_role !== "CUSTOMER" ? (
            <RelatedKnowledgePanel
              categoryId={ticket.category_id}
              items={detail.related_knowledge}
              language={language}
              canCreate
              onRefresh={() => {
                if (id) {
                  void loadDetail(id);
                }
              }}
            />
          ) : null}

          <TicketReportSections
            currentRole={user?.active_role}
            detail={detail}
            language={language}
            onError={setError}
            onRefresh={async () => {
              if (id) {
                await loadDetail(id);
              }
            }}
          />

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{language === "zh" ? "外部上下文摘要" : "External Context"}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="Source" value={detail.external_context.source} />
              <InfoCard label="Rule" value={detail.external_context.rule_name} />
              <InfoCard label="Severity" value={detail.external_context.severity} />
              <InfoCard label="Asset" value={detail.external_context.asset} />
              <div className="col-span-2">
                <InfoCard label="Indicator" value={detail.external_context.indicator} />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
              {contextSummary}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{language === "zh" ? "权限与范围" : "Permissions"}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label={language === "zh" ? "当前角色" : "Current Role"} value={detail.permission_scope.current_role} />
              <InfoCard label={language === "zh" ? "页面范围" : "Page Scope"} value={detail.permission_scope.page_scope} />
              <div className="col-span-2">
                <InfoCard label={language === "zh" ? "评论范围" : "Comment Scope"} value={detail.permission_scope.comment_scope} />
              </div>
              <div className="col-span-2">
                <InfoCard
                  label={language === "zh" ? "隐藏字段" : "Hidden Fields"}
                  value={detail.permission_scope.hidden_fields.length ? detail.permission_scope.hidden_fields.join(" / ") : language === "zh" ? "无" : "None"}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {error && (
        <div className="fixed right-6 bottom-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
