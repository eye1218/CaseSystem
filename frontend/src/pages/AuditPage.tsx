import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { listAuditTicketLogs, listAuditTickets } from "../api/audit";
import DateRangePicker from "../components/DateRangePicker";
import { useLanguage } from "../contexts/LanguageContext";
import type {
  AuditLogItem,
  AuditLogListResponse,
  AuditTicketItem,
  AuditTicketListQuery,
} from "../types/audit";
import { formatApiDateTime } from "../utils/datetime";

const STATUS_OPTIONS = [
  "all",
  "WAITING_RESPONSE",
  "IN_PROGRESS",
  "RESPONSE_TIMEOUT",
  "RESOLUTION_TIMEOUT",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;

const ACTION_OPTIONS = [
  "all",
  "created",
  "updated",
  "status_change",
  "resolved",
  "closed",
  "reopened",
  "assigned",
  "claimed",
  "moved_to_pool",
  "escalated",
  "escalation_requested",
  "escalation_accepted",
  "escalation_rejected",
  "report_uploaded",
  "report_updated",
  "report_replaced",
  "report_deleted",
  "comment",
] as const;

const SORT_OPTIONS = ["last_event_at", "log_count", "ticket_id", "risk_score", "updated_at"] as const;

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return {
    startDate: toDateInput(start),
    endDate: toDateInput(end),
  };
}

function actionLabel(actionType: string, zh: boolean): string {
  const labels: Record<string, { zh: string; en: string }> = {
    created: { zh: "创建", en: "Created" },
    updated: { zh: "更新", en: "Updated" },
    status_change: { zh: "状态变更", en: "Status Change" },
    resolved: { zh: "处置完成", en: "Resolved" },
    closed: { zh: "关闭", en: "Closed" },
    reopened: { zh: "重开", en: "Reopened" },
    assigned: { zh: "分配", en: "Assigned" },
    claimed: { zh: "领取", en: "Claimed" },
    moved_to_pool: { zh: "加入池子", en: "Moved to Pool" },
    escalated: { zh: "升级", en: "Escalated" },
    escalation_requested: { zh: "发起升级请求", en: "Escalation Requested" },
    escalation_accepted: { zh: "升级接受", en: "Escalation Accepted" },
    escalation_rejected: { zh: "升级拒绝", en: "Escalation Rejected" },
    report_uploaded: { zh: "报告上传", en: "Report Uploaded" },
    report_updated: { zh: "报告更新", en: "Report Updated" },
    report_replaced: { zh: "报告替换", en: "Report Replaced" },
    report_deleted: { zh: "报告删除", en: "Report Deleted" },
    comment: { zh: "评论", en: "Comment" },
  };
  return labels[actionType]?.[zh ? "zh" : "en"] ?? actionType;
}

function statusClass(status: string): string {
  switch (status) {
    case "WAITING_RESPONSE":
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
    case "IN_PROGRESS":
      return "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300";
    case "RESPONSE_TIMEOUT":
    case "RESOLUTION_TIMEOUT":
      return "border-red-300 bg-red-100 text-red-700 dark:border-red-600 dark:bg-red-900/40 dark:text-red-300";
    case "RESOLVED":
      return "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "CLOSED":
      return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }
}

function actionIcon(item: AuditLogItem) {
  if (item.action_type === "comment") {
    return <MessageSquare className="h-3.5 w-3.5" />;
  }
  if (item.action_type === "resolved") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (item.action_type === "closed") {
    return <Lock className="h-3.5 w-3.5" />;
  }
  if (item.action_type === "claimed") {
    return <UserCheck className="h-3.5 w-3.5" />;
  }
  if (item.action_type === "moved_to_pool") {
    return <Inbox className="h-3.5 w-3.5" />;
  }
  return <Clock3 className="h-3.5 w-3.5" />;
}

function actionTone(item: AuditLogItem): string {
  if (item.action_type === "comment") return "bg-indigo-500";
  if (item.action_type === "resolved") return "bg-emerald-500";
  if (item.action_type === "closed") return "bg-slate-600";
  if (item.action_type === "claimed") return "bg-blue-500";
  if (item.action_type === "moved_to_pool") return "bg-orange-500";
  return "bg-purple-500";
}

function buildTicketQuery(params: {
  search: string;
  actionType: string;
  actor: string;
  visibility: "all" | "PUBLIC" | "INTERNAL";
  mainStatus: (typeof STATUS_OPTIONS)[number];
  createdFrom: string;
  createdTo: string;
  sortBy: (typeof SORT_OPTIONS)[number];
  sortDir: "asc" | "desc";
  limit: number;
  offset: number;
}): AuditTicketListQuery {
  return {
    search: params.search,
    actionType: params.actionType,
    actor: params.actor,
    visibility: params.visibility,
    mainStatus: params.mainStatus,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    limit: params.limit,
    offset: params.offset,
  };
}

export default function AuditPage() {
  const { language } = useLanguage();
  const zh = language === "zh";

  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [actionType, setActionType] = useState<(typeof ACTION_OPTIONS)[number]>("all");
  const [visibility, setVisibility] = useState<"all" | "PUBLIC" | "INTERNAL">("all");
  const [mainStatus, setMainStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]>("last_event_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const deferredSearch = useDeferredValue(search);
  const deferredActor = useDeferredValue(actor);

  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const [tickets, setTickets] = useState<AuditTicketItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState("");

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const [logsPayload, setLogsPayload] = useState<AuditLogListResponse | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");

  useEffect(() => {
    setOffset(0);
  }, [deferredSearch, deferredActor, actionType, visibility, mainStatus, startDate, endDate, sortBy, sortDir, limit]);

  useEffect(() => {
    let cancelled = false;

    async function loadTickets() {
      setTicketsLoading(true);
      setTicketsError("");
      try {
        const payload = await listAuditTickets(
          buildTicketQuery({
            search: deferredSearch,
            actionType,
            actor: deferredActor,
            visibility,
            mainStatus,
            createdFrom: startDate,
            createdTo: endDate,
            sortBy,
            sortDir,
            limit,
            offset,
          }),
        );

        if (!cancelled) {
          setTickets(payload.items);
          setTotalCount(payload.total_count);
          setFilteredCount(payload.filtered_count);
          setHasMoreTickets(payload.has_more);
          setSelectedTicketId((current) => {
            if (current !== null && payload.items.some((item) => item.ticket_id === current)) {
              return current;
            }
            return payload.items[0]?.ticket_id ?? null;
          });
        }
      } catch (error) {
        if (!cancelled) {
          setTicketsError(error instanceof Error ? error.message : zh ? "加载审计工单失败" : "Failed to load audit tickets");
          setTickets([]);
          setSelectedTicketId(null);
          setTotalCount(0);
          setFilteredCount(0);
          setHasMoreTickets(false);
        }
      } finally {
        if (!cancelled) {
          setTicketsLoading(false);
        }
      }
    }

    void loadTickets();

    return () => {
      cancelled = true;
    };
  }, [
    deferredActor,
    deferredSearch,
    actionType,
    visibility,
    mainStatus,
    startDate,
    endDate,
    sortBy,
    sortDir,
    limit,
    offset,
    refreshToken,
    zh,
  ]);

  useEffect(() => {
    if (!selectedTicketId) {
      setLogsPayload(null);
      setLogsError("");
      setLogsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadLogs() {
      setLogsLoading(true);
      setLogsError("");
      try {
        const mergedItems: AuditLogItem[] = [];
        let queryOffset = 0;
        let ticket: AuditLogListResponse["ticket"] | null = null;
        let totalCount = 0;

        while (true) {
          const payload = await listAuditTicketLogs(selectedTicketId, {
            sortDir: "asc",
            limit: 200,
            offset: queryOffset,
          });
          if (!ticket) {
            ticket = payload.ticket;
            totalCount = payload.total_count;
          }
          mergedItems.push(...payload.items);

          if (!payload.has_more) {
            break;
          }
          const nextOffset = payload.next_offset ?? queryOffset + payload.items.length;
          if (nextOffset <= queryOffset || payload.items.length === 0) {
            break;
          }
          queryOffset = nextOffset;
        }

        if (!cancelled) {
          setLogsPayload({
            ticket: ticket ?? {
              id: selectedTicketId,
              title: `${zh ? "工单" : "Ticket"} #${selectedTicketId}`,
              main_status: "WAITING_RESPONSE",
              sub_status: "NONE",
              priority: "P3",
              risk_score: 0,
              assigned_to: null,
              assigned_to_user_id: null,
              created_at: "",
              updated_at: "",
            },
            items: mergedItems,
            total_count: totalCount,
            filtered_count: mergedItems.length,
            has_more: false,
            next_offset: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setLogsError(error instanceof Error ? error.message : zh ? "加载审计日志失败" : "Failed to load audit logs");
          setLogsPayload(null);
        }
      } finally {
        if (!cancelled) {
          setLogsLoading(false);
        }
      }
    }

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [selectedTicketId, refreshToken, zh]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{zh ? "工单审计" : "Ticket Audit"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {zh ? "按工单查看全量操作与评论日志。" : "Audit every ticket with full action and comment logs."}
            </p>
          </div>
          <button
            onClick={() => setRefreshToken((current) => current + 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-6">
          <label className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={zh ? "搜索工单ID/标题/内容" : "Search by ticket ID/title/content"}
              className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>

          <input
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            placeholder={zh ? "操作人" : "Actor"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />

          <select
            value={actionType}
            onChange={(event) => setActionType(event.target.value as (typeof ACTION_OPTIONS)[number])}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? (zh ? "全部操作" : "All actions") : actionLabel(option, zh)}
              </option>
            ))}
          </select>

          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as "all" | "PUBLIC" | "INTERNAL")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">{zh ? "全部可见性" : "All visibility"}</option>
            <option value="PUBLIC">PUBLIC</option>
            <option value="INTERNAL">INTERNAL</option>
          </select>

          <select
            value={mainStatus}
            onChange={(event) => setMainStatus(event.target.value as (typeof STATUS_OPTIONS)[number])}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? (zh ? "全部状态" : "All status") : option}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(nextStart, nextEnd) => {
                setStartDate(nextStart);
                setEndDate(nextEnd);
              }}
            />
          </div>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as (typeof SORT_OPTIONS)[number])}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="last_event_at">{zh ? "按最近日志" : "Last event"}</option>
            <option value="log_count">{zh ? "按日志数量" : "Log count"}</option>
            <option value="ticket_id">{zh ? "按工单ID" : "Ticket ID"}</option>
            <option value="risk_score">{zh ? "按风险分" : "Risk score"}</option>
            <option value="updated_at">{zh ? "按更新时间" : "Updated at"}</option>
          </select>

          <select
            value={sortDir}
            onChange={(event) => setSortDir(event.target.value as "asc" | "desc")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="desc">{zh ? "降序" : "Desc"}</option>
            <option value="asc">{zh ? "升序" : "Asc"}</option>
          </select>

          <select
            value={String(limit)}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(360px,42%)_1fr]">
        <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            {zh ? `工单 ${filteredCount} / ${totalCount}` : `Tickets ${filteredCount} / ${totalCount}`}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {ticketsLoading ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{zh ? "加载中..." : "Loading..."}</div>
            ) : ticketsError ? (
              <div className="p-4 text-sm text-red-600 dark:text-red-300">{ticketsError}</div>
            ) : tickets.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{zh ? "无匹配工单" : "No matching tickets"}</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">{zh ? "工单" : "Ticket"}</th>
                    <th className="px-4 py-2.5">{zh ? "状态" : "Status"}</th>
                    <th className="px-4 py-2.5">{zh ? "日志数" : "Logs"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tickets.map((ticket) => {
                    const active = selectedTicketId === ticket.ticket_id;
                    return (
                      <tr
                        key={ticket.ticket_id}
                        className={`cursor-pointer ${
                          active
                            ? "bg-blue-50/60 dark:bg-blue-950/30"
                            : "bg-white hover:bg-slate-50 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                        }`}
                        onClick={() => setSelectedTicketId(ticket.ticket_id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">#{ticket.ticket_id}</div>
                          <div className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{ticket.title}</div>
                          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            {zh ? "最近日志" : "Last"}: {formatApiDateTime(ticket.last_event_at, language)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(ticket.main_status)}`}>
                            {ticket.main_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ticket.log_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              {zh ? `当前 ${offset + 1}-${offset + tickets.length}` : `Showing ${offset + 1}-${offset + tickets.length}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset((current) => Math.max(0, current - limit))}
                disabled={offset <= 0}
                className="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
              >
                {zh ? "上一页" : "Prev"}
              </button>
              <button
                onClick={() => setOffset((current) => current + limit)}
                disabled={!hasMoreTickets}
                className="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
              >
                {zh ? "下一页" : "Next"}
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!selectedTicketId ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              {zh ? "请选择左侧工单查看审计日志" : "Select a ticket to view audit logs"}
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {logsPayload?.ticket.title ?? `${zh ? "工单" : "Ticket"} #${selectedTicketId}`}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {zh ? "完整时间线日志" : "Full timeline logs"}: {logsPayload?.total_count ?? 0}
                    </div>
                  </div>
                  <Link
                    to={`/tickets/${selectedTicketId}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {zh ? "打开工单" : "Open Ticket"}
                  </Link>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                {logsLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{zh ? "加载日志中..." : "Loading logs..."}</div>
                ) : logsError ? (
                  <div className="text-sm text-red-600 dark:text-red-300">{logsError}</div>
                ) : !logsPayload || logsPayload.items.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{zh ? "无匹配日志" : "No matching logs"}</div>
                ) : (
                  <div className="relative">
                    {logsPayload.items.map((item, index) => {
                      const isLast = index === logsPayload.items.length - 1;
                      const hasContext = Object.keys(item.context ?? {}).length > 0;
                      return (
                        <div key={item.event_id} className="relative flex gap-4 pb-6">
                          {!isLast && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />}
                          <div className={`relative z-10 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white ${actionTone(item)}`}>
                            {actionIcon(item)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.actor_name}</span>
                              {item.actor_role && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  {item.actor_role}
                                </span>
                              )}
                              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                {actionLabel(item.action_type, zh)}
                              </span>
                              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                {item.visibility}
                              </span>
                              <span className="ml-auto text-xs font-mono text-slate-400">{formatApiDateTime(item.created_at, language)}</span>
                            </div>

                            {item.from_status && item.to_status ? (
                              <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                                <span className={`inline-flex rounded-md border px-2 py-1 font-semibold ${statusClass(item.from_status)}`}>{item.from_status}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                <span className={`inline-flex rounded-md border px-2 py-1 font-semibold ${statusClass(item.to_status)}`}>{item.to_status}</span>
                              </div>
                            ) : null}

                            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                              {item.content}
                            </p>

                            {hasContext && (
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
                                {JSON.stringify(item.context, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {zh ? "已加载完整时间线" : "Full timeline loaded"}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
