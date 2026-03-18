import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CircleDot,
  Database,
  ExternalLink,
  Layers,
  Radio,
  ShieldAlert,
  Tag,
  TimerOff,
  User,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
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

const categories: Record<string, { zh: string; en: string }> = {
  intrusion: { zh: "入侵检测", en: "Intrusion Detection" },
  network: { zh: "网络攻击", en: "Network Attack" },
  data: { zh: "数据安全", en: "Data Security" },
  endpoint: { zh: "终端安全", en: "Endpoint Security" },
  malware: { zh: "恶意软件", en: "Malware" },
  phishing: { zh: "网络钓鱼", en: "Phishing" },
  other: { zh: "其他", en: "Other" },
};

const responsibility: Record<string, { zh: string; en: string }> = {
  T1: { zh: "T1 一线分析员", en: "T1 Analyst" },
  T2: { zh: "T2 二线分析员", en: "T2 Analyst" },
  T3: { zh: "T3 专家", en: "T3 Expert" },
  ADMIN: { zh: "管理员", en: "Administrator" },
};

function priorityBg(priority: string) {
  switch (priority) {
    case "P1":
      return "bg-red-500";
    case "P2":
      return "bg-orange-500";
    case "P3":
      return "bg-yellow-500 text-slate-950";
    default:
      return "bg-emerald-500";
  }
}

function priorityBorder(priority: string) {
  switch (priority) {
    case "P1":
      return "border-red-500";
    case "P2":
      return "border-orange-500";
    case "P3":
      return "border-yellow-400";
    default:
      return "border-emerald-500";
  }
}

function riskTone(score: number) {
  if (score >= 90) {
    return { text: "text-red-600 dark:text-red-400", bar: "bg-red-500" };
  }
  if (score >= 70) {
    return { text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" };
  }
  if (score >= 40) {
    return { text: "text-yellow-600 dark:text-yellow-400", bar: "bg-yellow-500" };
  }
  return { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
}

function statusStyle(status: string) {
  switch (status) {
    case "WAITING_RESPONSE":
      return "bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200";
    case "IN_PROGRESS":
      return "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300";
    case "RESOLVED":
      return "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300";
    case "CLOSED":
      return "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400";
    default:
      return "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300";
  }
}

type DeadlineState = "done" | "overdue" | "warning" | "normal";

function getDeadlineState(
  createdAt: string,
  deadlineAt: string | null,
  currentStatus: string,
) {
  if (!deadlineAt) {
    return null;
  }
  if (currentStatus === "RESOLVED" || currentStatus === "CLOSED") {
    return "done" as DeadlineState;
  }
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const deadline = new Date(deadlineAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(deadline)) {
    return "normal" as DeadlineState;
  }
  if (now > deadline) {
    return "overdue" as DeadlineState;
  }
  const total = deadline - created;
  const elapsed = now - created;
  if (total > 0 && elapsed / total >= 0.8) {
    return "warning" as DeadlineState;
  }
  return "normal" as DeadlineState;
}

function deadlineBadge(state: DeadlineState | null, language: "zh" | "en") {
  if (state === "done") {
    return (
      <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        {language === "zh" ? "已完成" : "Done"}
      </span>
    );
  }
  if (state === "overdue") {
    return (
      <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-400">
        {language === "zh" ? "已超时" : "Overdue"}
      </span>
    );
  }
  if (state === "warning") {
    return (
      <span className="ml-1.5 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
        {language === "zh" ? "即将超时" : "At Risk"}
      </span>
    );
  }
  return null;
}

function deadlineTextColor(state: DeadlineState | null) {
  if (state === "overdue") {
    return "text-red-600 dark:text-red-400";
  }
  if (state === "warning") {
    return "text-yellow-600 dark:text-yellow-400";
  }
  return "text-slate-700 dark:text-slate-300";
}

function localizedCategory(categoryId: string, categoryName: string, language: "zh" | "en") {
  return categories[categoryId]?.[language] ?? categoryName;
}

function localizedResponsibility(level: string, language: "zh" | "en") {
  return responsibility[level]?.[language] ?? level;
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {title}
      </span>
      <div className="ml-1 h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      <div className="text-sm text-slate-800 dark:text-slate-200">{children}</div>
    </div>
  );
}

function PlaceholderValue({ text }: { text: string }) {
  return <span className="text-sm italic text-slate-400 dark:text-slate-500">{text}</span>;
}

function TimelineRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="mt-0.5 flex-shrink-0 text-slate-400">{icon}</div>
      <div className="flex-1">
        <div className="mb-0.5 text-xs text-slate-400 dark:text-slate-500">{label}</div>
        <div className={valueClassName}>{value}</div>
      </div>
    </div>
  );
}

export default function TicketDrawer({ ticket, open, onClose }: TicketDrawerProps) {
  const { language, t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [open, ticket?.id]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  if (!ticket && !open) {
    return null;
  }

  const responseState = getDeadlineState(ticket?.created_at ?? "", ticket?.response_deadline_at ?? null, ticket?.main_status ?? "");
  const resolutionState = getDeadlineState(ticket?.created_at ?? "", ticket?.resolution_deadline_at ?? null, ticket?.main_status ?? "");
  const risk = ticket ? riskTone(ticket.risk_score) : riskTone(0);

  return (
    <div
      className={`w-full transition-[opacity,transform] duration-300 ${
        open ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-4"
      }`}
    >
      <div className="flex max-h-[calc(100vh-7rem)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {ticket ? (
          <>
            <div
              className={`flex flex-shrink-0 items-center gap-3 border-b border-slate-200 border-l-4 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900 ${priorityBorder(ticket.priority)}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="flex-shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">
                  #{ticket.id}
                </span>
                <span className={`inline-flex flex-shrink-0 rounded px-2 py-0.5 text-xs font-bold text-white ${priorityBg(ticket.priority)}`}>
                  {ticket.priority}
                </span>
                <span className={`inline-flex flex-shrink-0 items-center rounded border px-2 py-0.5 text-xs font-semibold ${statusStyle(ticket.main_status)}`}>
                  {t(`status.${ticket.main_status.toLowerCase()}`)}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="space-y-5 px-4 py-4">
                <div>
                  <h2 className="mb-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                    {ticket.title}
                  </h2>
                  <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    {ticket.description}
                  </p>
                </div>

                <div>
                  <SectionHeader
                    icon={<Tag className="h-3.5 w-3.5" />}
                    title={language === "zh" ? "基本信息" : "Basic Info"}
                  />
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    <Field label={language === "zh" ? "分类" : "Category"}>
                      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {localizedCategory(ticket.category_id, ticket.category_name, language)}
                      </span>
                    </Field>

                    <Field label={language === "zh" ? "工单来源" : "Source"}>
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        <Radio className="h-3 w-3" />
                        {ticket.source}
                      </span>
                    </Field>

                    <Field label={language === "zh" ? "优先级" : "Priority"}>
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold text-white ${priorityBg(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                    </Field>

                    <Field label={language === "zh" ? "风险分数" : "Risk Score"}>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${risk.text}`}>{ticket.risk_score}</span>
                        <div className="h-1.5 max-w-[60px] flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div className={`h-full rounded-full ${risk.bar}`} style={{ width: `${ticket.risk_score}%` }} />
                        </div>
                      </div>
                    </Field>

                    <Field label={language === "zh" ? "责任级别" : "Responsibility"}>
                      <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                        <Layers className="h-3 w-3" />
                        {localizedResponsibility(ticket.responsibility_level, language)}
                      </span>
                    </Field>

                    <Field label={language === "zh" ? "创建人" : "Created By"}>
                      <span className="flex items-center gap-1 text-sm">
                        <User className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                        {ticket.created_by}
                      </span>
                    </Field>

                    <Field label={language === "zh" ? "处置人" : "Handler"}>
                      {ticket.assigned_to ? (
                        <span className="flex items-center gap-1 text-sm">
                          <UserCheck className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          {ticket.assigned_to}
                        </span>
                      ) : (
                        <PlaceholderValue text={language === "zh" ? "未分配" : "Unassigned"} />
                      )}
                    </Field>

                    <Field label={language === "zh" ? "当前池子" : "Pool"}>
                      {ticket.current_pool_code ? (
                        <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                          {ticket.current_pool_code}
                        </span>
                      ) : (
                        <PlaceholderValue text="-" />
                      )}
                    </Field>
                  </div>
                </div>

                <div>
                  <SectionHeader
                    icon={<Activity className="h-3.5 w-3.5" />}
                    title={language === "zh" ? "状态信息" : "Status"}
                  />
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    <Field label={language === "zh" ? "主状态" : "Main Status"}>
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${statusStyle(ticket.main_status)}`}>
                        {t(`status.${ticket.main_status.toLowerCase()}`)}
                      </span>
                    </Field>

                    <Field label={language === "zh" ? "子状态" : "Sub-Status"}>
                      {ticket.sub_status !== "NONE" ? (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                          <CircleDot className="h-3 w-3" />
                          {t(`substatus.${ticket.sub_status.toLowerCase()}`)}
                        </span>
                      ) : (
                        <PlaceholderValue text={t("substatus.none")} />
                      )}
                    </Field>
                  </div>
                </div>

                <div>
                  <SectionHeader
                    icon={<Clock className="h-3.5 w-3.5" />}
                    title={language === "zh" ? "SLA 时效" : "SLA Timeline"}
                  />
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        {language === "zh" ? "响应 SLA" : "Response SLA"}
                      </div>
                      <div className="divide-y divide-slate-100 px-3 dark:divide-slate-700/50">
                        <TimelineRow
                          icon={<Clock className="h-3.5 w-3.5" />}
                          label={language === "zh" ? "响应截止时间" : "Response Deadline"}
                          value={
                            ticket.response_deadline_at ? (
                              <div className={`flex items-center gap-1 font-mono text-xs ${deadlineTextColor(responseState)}`}>
                                {formatApiDateTime(ticket.response_deadline_at, language)}
                                {deadlineBadge(responseState, language)}
                              </div>
                            ) : (
                              <PlaceholderValue text={language === "zh" ? "未设置" : "Not set"} />
                            )
                          }
                        />

                        <TimelineRow
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          label={language === "zh" ? "实际响应时间" : "Responded At"}
                          value={
                            ticket.responded_at ? (
                              <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                                {formatApiDateTime(ticket.responded_at, language)}
                              </span>
                            ) : (
                              <PlaceholderValue text={language === "zh" ? "尚未响应" : "Not yet responded"} />
                            )
                          }
                        />

                        {ticket.response_timeout_at && (
                          <TimelineRow
                            icon={<TimerOff className="h-3.5 w-3.5 text-red-500" />}
                            label={language === "zh" ? "响应超时记录" : "Response Timeout At"}
                            value={
                              <span className="font-mono text-xs text-red-600 dark:text-red-400">
                                {formatApiDateTime(ticket.response_timeout_at, language)}
                              </span>
                            }
                          />
                        )}
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        {language === "zh" ? "处置 SLA" : "Resolution SLA"}
                      </div>
                      <div className="divide-y divide-slate-100 px-3 dark:divide-slate-700/50">
                        <TimelineRow
                          icon={<Clock className="h-3.5 w-3.5" />}
                          label={language === "zh" ? "处置截止时间" : "Resolution Deadline"}
                          value={
                            ticket.resolution_deadline_at ? (
                              <div className={`flex items-center gap-1 font-mono text-xs ${deadlineTextColor(resolutionState)}`}>
                                {formatApiDateTime(ticket.resolution_deadline_at, language)}
                                {deadlineBadge(resolutionState, language)}
                              </div>
                            ) : (
                              <PlaceholderValue text={language === "zh" ? "未设置" : "Not set"} />
                            )
                          }
                        />

                        <TimelineRow
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          label={language === "zh" ? "实际处置时间" : "Resolved At"}
                          value={
                            ticket.resolved_at ? (
                              <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                                {formatApiDateTime(ticket.resolved_at, language)}
                              </span>
                            ) : (
                              <PlaceholderValue text={language === "zh" ? "尚未处置完成" : "Not yet resolved"} />
                            )
                          }
                        />

                        {ticket.resolution_timeout_at && (
                          <TimelineRow
                            icon={<TimerOff className="h-3.5 w-3.5 text-red-500" />}
                            label={language === "zh" ? "处置超时记录" : "Resolution Timeout At"}
                            value={
                              <span className="font-mono text-xs text-red-600 dark:text-red-400">
                                {formatApiDateTime(ticket.resolution_timeout_at, language)}
                              </span>
                            }
                          />
                        )}

                        <TimelineRow
                          icon={<AlertTriangle className="h-3.5 w-3.5" />}
                          label={language === "zh" ? "关闭时间" : "Closed At"}
                          value={
                            ticket.closed_at ? (
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                                {formatApiDateTime(ticket.closed_at, language)}
                              </span>
                            ) : (
                              <PlaceholderValue text={language === "zh" ? "尚未关闭" : "Not closed"} />
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionHeader
                    icon={<Database className="h-3.5 w-3.5" />}
                    title={language === "zh" ? "系统信息" : "System Info"}
                  />
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    <Field label={language === "zh" ? "工单 ID" : "Ticket ID"}>
                      <span className="font-mono text-blue-600 dark:text-blue-400">#{ticket.id}</span>
                    </Field>
                    <div />
                    <Field label={language === "zh" ? "创建时间" : "Created At"}>
                      <span className="font-mono text-xs">
                        {formatApiDateTime(ticket.created_at, language)}
                      </span>
                    </Field>
                    <Field label={language === "zh" ? "更新时间" : "Updated At"}>
                      <span className="font-mono text-xs">
                        {formatApiDateTime(ticket.updated_at, language)}
                      </span>
                    </Field>
                  </div>
                </div>

                <div className="h-2" />
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" />
                {language === "zh" ? "关闭" : "Close"}
              </button>

              <Link
                to={`/tickets/${ticket.id}`}
                onClick={(event) => event.stopPropagation()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {language === "zh" ? "查看完整详情" : "Full Details"}
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-xs text-slate-400 dark:text-slate-600">
              {language === "zh" ? "请选择工单" : "Select a ticket"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
