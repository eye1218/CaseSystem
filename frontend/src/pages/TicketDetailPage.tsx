import {
  ArrowUpRight,
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
  UserPlus,
  UserCheck
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useSearchParams, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { getKnowledgeArticle } from "../api/knowledge";
import {
  addTicketComment,
  assignTicket,
  escalateTicketToPool,
  escalateTicketToUser,
  getTicketAlerts,
  getTicketContext,
  getTicketDetail,
  getTicketLive,
  listInternalTicketUsers,
  runTicketAction,
  updateTicket
} from "../api/tickets";
import TicketOwnershipActionPanel from "../components/TicketOwnershipActionPanel";
import KnowledgeDrawer from "../components/KnowledgeDrawer";
import RelatedKnowledgePanel from "../components/RelatedKnowledgePanel";
import TicketReportSections from "../components/TicketReportSections";
import { ticketCategoryOptions } from "../constants/ticketCategories";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import type { KnowledgeArticleDetail, KnowledgeArticleSummary } from "../types/knowledge";
import type {
  InternalTicketUser,
  TicketAlarmLookupResponse,
  TicketActivityItem,
  TicketContextResponse,
  TicketDetail,
  TicketLive,
  TicketPriority,
} from "../types/ticket";
import { formatApiDateTime, parseApiDate } from "../utils/datetime";

type MainTab = "activity" | "alerts" | "context";
type OwnershipActionMode = "assign" | "escalate_user" | "escalate_pool";

interface EditFormState {
  title: string;
  description: string;
  category_id: string;
  priority: TicketPriority;
  risk_score: string;
  alarm_ids_text: string;
  context_markdown: string;
}

interface ToastState {
  id: number;
  message: string;
}

function parseAlarmIds(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const categoryOptions = ticketCategoryOptions.map((item) => ({
  value: item.id,
  zh: item.zh,
  en: item.en
}));

const actionOrder = [
  "assign",
  "claim",
  "escalate_user",
  "escalate_pool",
  "move_to_pool",
  "respond",
  "resolve",
  "close",
  "reopen",
  "edit"
];

const ALERT_DETAIL_FIELDS = [
  "alert_date",
  "alert_time",
  "log_source",
  "alert_type",
  "action",
  "src_ip",
  "dst_ip",
  "alert_ts_ms",
  "version",
  "log_source_ip",
  "vendor",
  "log_type",
  "severity",
  "raw",
  "alert_id",
  "alert_name",
  "alert_description",
  "cve_id",
  "src_port",
  "dst_port",
  "protocol",
  "ingest_time",
  "net_direction",
  "optional"
] as const;

const ALERT_SUMMARY_FIELDS: Array<(typeof ALERT_DETAIL_FIELDS)[number]> = [
  "alert_date",
  "alert_time",
  "severity",
  "src_ip",
  "dst_ip",
  "log_source"
];

type AlertDetailField = (typeof ALERT_DETAIL_FIELDS)[number];
const ALERT_LONG_FIELDS: AlertDetailField[] = ["alert_description", "optional", "raw"];

function compactValue(value: unknown) {
  if (value == null || value === "") {
    return "-";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function detailValue(field: AlertDetailField, value: unknown) {
  if (value == null || value === "") {
    return "-";
  }

  if (field === "optional") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return "-";
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return JSON.stringify(parsed, null, 2);
      } catch {
        return trimmed;
      }
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function isLongAlertField(field: AlertDetailField) {
  return field === "alert_description" || field === "raw" || field === "optional";
}

function isMonoAlertField(field: AlertDetailField) {
  return [
    "alert_time",
    "alert_ts_ms",
    "version",
    "src_ip",
    "dst_ip",
    "log_source_ip",
    "alert_id",
    "cve_id",
    "src_port",
    "dst_port",
    "protocol",
    "ingest_time"
  ].includes(field);
}

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

function nextPoolCode(currentPoolCode: string | null, responsibilityLevel: string) {
  const level = currentPoolCode ? currentPoolCode.replace("_POOL", "") : responsibilityLevel;
  if (level === "T1") return "T2_POOL";
  if (level === "T2") return "T3_POOL";
  return null;
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
    assign: { zh: "直接分配", en: "Assign" },
    claim: { zh: "领取工单", en: "Claim" },
    escalate_user: { zh: "升级给用户", en: "Escalate User" },
    escalate_pool: { zh: "升级到池子", en: "Escalate Pool" },
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
    case "assign":
      return <UserPlus className="h-4 w-4" />;
    case "escalate_user":
    case "escalate_pool":
      return <ArrowUpRight className="h-4 w-4" />;
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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [ownershipAction, setOwnershipAction] = useState<OwnershipActionMode | null>(null);
  const [ownershipTargets, setOwnershipTargets] = useState<InternalTicketUser[]>([]);
  const [ownershipTargetId, setOwnershipTargetId] = useState("");
  const [ownershipNote, setOwnershipNote] = useState("");
  const [ownershipError, setOwnershipError] = useState("");
  const [knowledgeDrawerOpen, setKnowledgeDrawerOpen] = useState(false);
  const [knowledgeDrawerLoading, setKnowledgeDrawerLoading] = useState(false);
  const [knowledgeDrawerError, setKnowledgeDrawerError] = useState("");
  const [knowledgeDrawerArticle, setKnowledgeDrawerArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [alertLookup, setAlertLookup] = useState<TicketAlarmLookupResponse | null>(null);
  const [alertLookupLoading, setAlertLookupLoading] = useState(false);
  const [alertLookupError, setAlertLookupError] = useState("");
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({});
  const [ticketContext, setTicketContext] = useState<TicketContextResponse | null>(null);
  const [ticketContextLoading, setTicketContextLoading] = useState(false);
  const [ticketContextError, setTicketContextError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [form, setForm] = useState<EditFormState>({
    title: "",
    description: "",
    category_id: "intrusion",
    priority: "P2",
    risk_score: "50",
    alarm_ids_text: "",
    context_markdown: ""
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

  const loadAlertLookup = async (ticketId: string) => {
    setAlertLookupLoading(true);
    setAlertLookupError("");
    try {
      const payload = await getTicketAlerts(ticketId);
      setAlertLookup(payload);
      setExpandedAlerts({});
      if (payload.missing_alarm_ids.length > 0) {
        setToast({
          id: Date.now(),
          message:
            language === "zh"
              ? `有 ${payload.missing_alarm_ids.length} 个关联告警不存在：${payload.missing_alarm_ids.join("、")}`
              : `${payload.missing_alarm_ids.length} related alerts were not found: ${payload.missing_alarm_ids.join(", ")}`
        });
      }
    } catch (loadError) {
      setAlertLookupError(loadError instanceof Error ? loadError.message : "Failed to load related alerts");
    } finally {
      setAlertLookupLoading(false);
    }
  };

  const loadTicketContext = async (ticketId: string) => {
    setTicketContextLoading(true);
    setTicketContextError("");
    try {
      const payload = await getTicketContext(ticketId);
      setTicketContext(payload);
    } catch (loadError) {
      setTicketContextError(loadError instanceof Error ? loadError.message : "Failed to load ticket context");
    } finally {
      setTicketContextLoading(false);
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
    setKnowledgeDrawerOpen(false);
    setKnowledgeDrawerLoading(false);
    setKnowledgeDrawerError("");
    setKnowledgeDrawerArticle(null);
    setAlertLookup(null);
    setAlertLookupError("");
    setExpandedAlerts({});
    setTicketContext(null);
    setTicketContextError("");
    setOwnershipAction(null);
    setOwnershipTargetId("");
    setOwnershipNote("");
    setOwnershipError("");
    setEditing(false);
  }, [id]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      risk_score: String(detail.ticket.risk_score),
      alarm_ids_text: detail.alarm_ids.join("\n"),
      context_markdown: detail.context_markdown ?? ""
    });
    setCommentVisibility(user?.active_role === "CUSTOMER" ? "PUBLIC" : "INTERNAL");
  }, [detail, user?.active_role]);

  useEffect(() => {
    if (!id || !detail || tab !== "alerts" || alertLookupLoading || alertLookup !== null || Boolean(alertLookupError)) {
      return;
    }
    void loadAlertLookup(id);
  }, [alertLookup, alertLookupError, alertLookupLoading, detail, id, tab]);

  useEffect(() => {
    if (!id || !detail || tab !== "context" || ticketContextLoading || ticketContext !== null || Boolean(ticketContextError)) {
      return;
    }
    void loadTicketContext(id);
  }, [detail, id, tab, ticketContext, ticketContextError, ticketContextLoading]);

  useEffect(() => {
    if (!detail || searchParams.get("edit") !== "1") {
      return;
    }
    if (detail.available_actions.includes("edit")) {
      setEditing(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [detail, searchParams, setSearchParams]);

  const ticket = detail?.ticket;

  const openOwnershipAction = async (mode: OwnershipActionMode) => {
    setOwnershipAction(mode);
    setOwnershipError("");
    setOwnershipNote("");

    if (mode === "assign" || mode === "escalate_user") {
      try {
        const payload = await listInternalTicketUsers();
        setOwnershipTargets(payload.items);
        setOwnershipTargetId((current) => current || payload.items[0]?.id || "");
      } catch (loadError) {
        setOwnershipError(loadError instanceof Error ? loadError.message : "Failed to load internal users");
      }
      return;
    }

    setOwnershipTargetId("");
  };

  const handleAction = async (action: string) => {
    if (!id || !detail) return;
    if (action === "edit") {
      setEditing((current) => !current);
      return;
    }
    if (action === "assign" || action === "escalate_user" || action === "escalate_pool") {
      await openOwnershipAction(action);
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

  const handleOwnershipSubmit = async () => {
    if (!id || !detail || !ownershipAction) return;

    setSubmitting(ownershipAction);
    setOwnershipError("");
    setError("");
    try {
      let payload: TicketDetail;
      if (ownershipAction === "assign") {
        payload = await assignTicket(id, {
          version: detail.ticket.version,
          target_user_id: ownershipTargetId,
          note: ownershipNote.trim() || undefined
        });
      } else if (ownershipAction === "escalate_user") {
        payload = await escalateTicketToUser(id, {
          version: detail.ticket.version,
          target_user_id: ownershipTargetId,
          note: ownershipNote.trim() || undefined
        });
      } else {
        payload = await escalateTicketToPool(id, {
          version: detail.ticket.version,
          note: ownershipNote.trim() || undefined
        });
      }
      setDetail(payload);
      setOwnershipAction(null);
      setOwnershipNote("");
      setOwnershipError("");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Action failed";
      setOwnershipError(message);
      setError(message);
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
        risk_score: Number(form.risk_score),
        alarm_ids: parseAlarmIds(form.alarm_ids_text),
        context_markdown: form.context_markdown
      });
      setDetail(payload);
      setAlertLookup(null);
      setAlertLookupError("");
      setTicketContext(null);
      setTicketContextError("");
      setEditing(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Update failed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleKnowledgeSelect = async (article: KnowledgeArticleSummary) => {
    setKnowledgeDrawerOpen(true);
    setKnowledgeDrawerError("");

    if (knowledgeDrawerArticle?.id === article.id) {
      return;
    }

    setKnowledgeDrawerLoading(true);
    setKnowledgeDrawerArticle(null);

    try {
      const payload = await getKnowledgeArticle(article.id);
      setKnowledgeDrawerArticle(payload);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load knowledge article";
      setKnowledgeDrawerError(message);
      setError(message);
    } finally {
      setKnowledgeDrawerLoading(false);
    }
  };

  const toggleAlertExpand = (rowKey: string) => {
    setExpandedAlerts((current) => ({
      ...current,
      [rowKey]: !current[rowKey]
    }));
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</div>;
  }

  if (!detail || !ticket) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{error || "Ticket not found."}</div>;
  }

  const availableActions = actionOrder.filter((action) => detail.available_actions.includes(action));
  const visibleContext = ticketContext?.content_markdown ?? detail.context_markdown;

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

              {ownershipAction && (
                <TicketOwnershipActionPanel
                  mode={ownershipAction}
                  language={language}
                  targetUsers={ownershipTargets}
                  targetUserId={ownershipTargetId}
                  note={ownershipNote}
                  submitting={submitting === ownershipAction}
                  errorMessage={ownershipError}
                  targetPoolCode={nextPoolCode(ticket.current_pool_code, ticket.responsibility_level)}
                  onTargetUserChange={setOwnershipTargetId}
                  onNoteChange={setOwnershipNote}
                  onCancel={() => {
                    setOwnershipAction(null);
                    setOwnershipError("");
                    setOwnershipNote("");
                  }}
                  onSubmit={() => {
                    void handleOwnershipSubmit();
                  }}
                />
              )}

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
                  <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                    <span className="mb-2 block font-medium">{language === "zh" ? "关联告警 ID" : "Related Alert IDs"}</span>
                    <textarea
                      rows={4}
                      value={form.alarm_ids_text}
                      onChange={(event) => setForm((current) => ({ ...current, alarm_ids_text: event.target.value }))}
                      placeholder={language === "zh" ? "每行一个告警 ID，或使用逗号分隔。" : "One alert ID per line, or separate with commas."}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </label>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                    <span className="mb-2 block font-medium">{language === "zh" ? "工单上下文（Markdown）" : "Ticket Context (Markdown)"}</span>
                    <textarea
                      rows={8}
                      value={form.context_markdown}
                      onChange={(event) => setForm((current) => ({ ...current, context_markdown: event.target.value }))}
                      placeholder={language === "zh" ? "支持 Markdown，留空表示清空。" : "Markdown supported. Leave empty to clear."}
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
                {alertLookupLoading ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {language === "zh" ? "正在查询关联告警..." : "Loading related alerts..."}
                  </div>
                ) : alertLookupError ? (
                  <div className="space-y-3 px-5 py-8 text-center">
                    <div className="text-sm text-rose-600 dark:text-rose-300">{alertLookupError}</div>
                    <button
                      type="button"
                      onClick={() => {
                        if (id) {
                          void loadAlertLookup(id);
                        }
                      }}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {language === "zh" ? "重试" : "Retry"}
                    </button>
                  </div>
                ) : !alertLookup || alertLookup.alarm_ids.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {language === "zh" ? "当前工单没有配置关联告警 ID。" : "No related alert IDs are configured for this ticket."}
                  </div>
                ) : (
                  <div className="space-y-4 px-5 py-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <InfoCard label={language === "zh" ? "关联告警数" : "Linked Alerts"} value={alertLookup.alarm_ids.length} />
                      <InfoCard label={language === "zh" ? "命中告警数" : "Matched Alerts"} value={alertLookup.alarm_ids.length - alertLookup.missing_alarm_ids.length} />
                      <InfoCard label={language === "zh" ? "缺失告警数" : "Missing Alerts"} value={alertLookup.missing_alarm_ids.length} />
                      <InfoCard label={language === "zh" ? "数据表" : "Table"} value={alertLookup.table_name ?? "-"} />
                    </div>

                    {alertLookup.missing_alarm_ids.length > 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                        {language === "zh" ? "未找到的告警 ID：" : "Missing alert IDs:"} {alertLookup.missing_alarm_ids.join(", ")}
                      </div>
                    ) : null}

                    <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-950">
                          <tr className="border-b border-slate-200 dark:border-slate-800">
                            <th className="w-10 px-2 py-3" />
                            <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              {language === "zh" ? "告警 ID" : "Alert ID"}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              {language === "zh" ? "状态" : "Status"}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              {language === "zh" ? "命中行数" : "Rows"}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">alert_date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">alert_time</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">severity</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">src_ip</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">dst_ip</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">log_source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {alertLookup.items.map((item) => {
                            const rowKey = `${item.sort_order}-${item.alarm_id}`;
                            const expanded = Boolean(expandedAlerts[rowKey]);
                            const row = item.rows[0] ?? {};
                            const canExpand = item.found && item.rows.length > 0;
                            return (
                              <Fragment key={rowKey}>
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="px-2 py-3">
                                    {canExpand ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleAlertExpand(rowKey)}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                                        aria-label={expanded ? (language === "zh" ? "收起告警详情" : "Collapse alert detail") : language === "zh" ? "展开告警详情" : "Expand alert detail"}
                                        aria-pressed={expanded}
                                      >
                                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
                                      </button>
                                    ) : (
                                      <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300 dark:text-slate-700">·</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 font-mono text-xs text-slate-500">{item.sort_order + 1}</td>
                                  <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">{item.alarm_id}</td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`rounded border px-2 py-1 text-xs font-semibold ${
                                        item.found
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                                      }`}
                                    >
                                      {item.found ? (language === "zh" ? "已找到" : "Found") : language === "zh" ? "不存在" : "Missing"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.row_count}</td>
                                  {ALERT_SUMMARY_FIELDS.map((field) => (
                                    <td key={`${rowKey}-${field}`} className="max-w-[240px] px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                                      <div className="truncate font-mono" title={compactValue(row[field])}>
                                        {compactValue(row[field])}
                                      </div>
                                    </td>
                                  ))}
                                </tr>
                                {expanded ? (
                                  <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                                    <td colSpan={11} className="px-4 py-4">
                                      <div className="space-y-3">
                                        {item.rows.length === 0 ? (
                                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                            {language === "zh" ? "当前告警无可展示的匹配明细。" : "No matched row details are available for this alert."}
                                          </div>
                                        ) : (
                                          item.rows.map((matchedRow, index) => (
                                            <div
                                              key={`${rowKey}-matched-${index}`}
                                              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
                                            >
                                              <div className="mb-3 flex items-center justify-between gap-3">
                                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                  {language === "zh" ? `命中记录 #${index + 1}` : `Matched Row #${index + 1}`}
                                                </div>
                                                <div className="truncate font-mono text-xs text-slate-500 dark:text-slate-300">
                                                  {compactValue(matchedRow.alert_id)}
                                                </div>
                                              </div>

                                              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                                                {ALERT_DETAIL_FIELDS.filter((field) => !isLongAlertField(field)).map((field) => {
                                                  const value = detailValue(field, matchedRow[field]);
                                                  return (
                                                    <div
                                                      key={`${rowKey}-${index}-${field}`}
                                                      className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-950/30"
                                                    >
                                                      <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">{field}</div>
                                                      <div
                                                        className={`break-all leading-5 text-slate-700 dark:text-slate-200 ${
                                                          isMonoAlertField(field) ? "font-mono text-[11px]" : "text-xs"
                                                        }`}
                                                        title={value}
                                                      >
                                                        {value}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>

                                              <div className="mt-2 space-y-2">
                                                {ALERT_LONG_FIELDS.map((field) => {
                                                  const value = detailValue(field, matchedRow[field]);
                                                  return (
                                                    <div
                                                      key={`${rowKey}-${index}-${field}-long`}
                                                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/30"
                                                    >
                                                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">{field}</div>
                                                      {value === "-" ? (
                                                        <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">-</div>
                                                      ) : (
                                                        <pre
                                                          className={`max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-100 p-2.5 leading-5 text-slate-800 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 ${
                                                            field === "alert_description" ? "text-xs" : "font-mono text-[11px]"
                                                          }`}
                                                        >
                                                          {value}
                                                        </pre>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "context" && (
              <div className="px-5 py-5">
                {ticketContextLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{language === "zh" ? "正在加载工单上下文..." : "Loading ticket context..."}</div>
                ) : ticketContextError ? (
                  <div className="space-y-3">
                    <div className="text-sm text-rose-600 dark:text-rose-300">{ticketContextError}</div>
                    <button
                      type="button"
                      onClick={() => {
                        if (id) {
                          void loadTicketContext(id);
                        }
                      }}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {language === "zh" ? "重试" : "Retry"}
                    </button>
                  </div>
                ) : visibleContext ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents() as never}>
                    {visibleContext}
                  </Markdown>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{language === "zh" ? "当前工单无扩展上下文。" : "No ticket context for this ticket."}</div>
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
              onSelectArticle={(article) => {
                void handleKnowledgeSelect(article);
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

        </aside>
      </div>

      <KnowledgeDrawer
        article={knowledgeDrawerArticle}
        open={knowledgeDrawerOpen}
        onClose={() => {
          setKnowledgeDrawerOpen(false);
          setKnowledgeDrawerLoading(false);
          setKnowledgeDrawerError("");
        }}
        language={language}
        loading={knowledgeDrawerLoading}
        errorMessage={knowledgeDrawerError}
      />

      {error && (
        <div className="fixed right-6 bottom-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed right-6 top-24 z-40 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-xl dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {toast.message}
        </div>
      )}
    </div>
  );
}
