import { ChevronDown, ChevronUp, Edit, Eye, Filter, Plus, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { getTicket, listTickets, type TicketQuery } from "../api/tickets";
import DateRangePicker from "../components/DateRangePicker";
import TicketDrawer from "../components/TicketDrawer";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import {
  getTicketDeadlinePresentation,
  useTicketDeadlineClock,
} from "../features/tickets/deadlines";
import type { TicketClaimStatus, TicketMainStatus, TicketPriority, TicketSummary } from "../types/ticket";
import { formatApiDateTime } from "../utils/datetime";

type SortField = "id" | "priority" | "risk_score" | "created_at" | "response_deadline_at" | "resolution_deadline_at";
type SortDirection = "asc" | "desc";

const categories = [
  { id: "intrusion", zh: "入侵检测", en: "Intrusion Detection" },
  { id: "network", zh: "网络攻击", en: "Network Attack" },
  { id: "data", zh: "数据安全", en: "Data Security" },
  { id: "endpoint", zh: "终端安全", en: "Endpoint Security" },
  { id: "phishing", zh: "网络钓鱼", en: "Phishing" }
];

const priorityOptions = ["P1", "P2", "P3", "P4"];
const mainStatusOptions = [
  "WAITING_RESPONSE",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED"
];
const poolOptions = [
  { value: "T1_POOL", zh: "T1 工单池", en: "T1 Pool" },
  { value: "T2_POOL", zh: "T2 工单池", en: "T2 Pool" },
  { value: "T3_POOL", zh: "T3 工单池", en: "T3 Pool" }
];
const claimStatusOptions: Array<{ value: TicketClaimStatus; zh: string; en: string }> = [
  { value: "unclaimed", zh: "未被领取", en: "Unclaimed" },
  { value: "claimed", zh: "已被领取", en: "Claimed" }
];
const POOL_CODES = ["T1_POOL", "T2_POOL", "T3_POOL"] as const;
type PoolCode = (typeof POOL_CODES)[number];

const PAGE_SIZE = 40;

function metricSummary(items: TicketSummary[]) {
  return {
    waiting: items.filter((item) => item.main_status === "WAITING_RESPONSE").length,
    timeout: items.filter((item) => item.sub_status === "RESPONSE_TIMEOUT" || item.sub_status === "RESOLUTION_TIMEOUT").length,
    closed: items.filter((item) => item.main_status === "RESOLVED" || item.main_status === "CLOSED").length
  };
}

function ticketMatchesFilters(
  ticket: TicketSummary,
  {
    searchTerm,
    filterCategoryIds,
    filterPriorities,
    filterStatuses,
    filterClaimStatuses,
    filterPoolCodes,
    dateRange
  }: {
    searchTerm: string;
    filterCategoryIds: string[];
    filterPriorities: string[];
    filterStatuses: string[];
    filterClaimStatuses: TicketClaimStatus[];
    filterPoolCodes: string[];
    dateRange: { start: string; end: string };
  }
) {
  const normalizedSearch = searchTerm.trim();
  if (normalizedSearch && !String(ticket.id).includes(normalizedSearch)) {
    return false;
  }
  if (filterCategoryIds.length > 0 && !filterCategoryIds.includes(ticket.category_id)) {
    return false;
  }
  if (filterPriorities.length > 0 && !filterPriorities.includes(ticket.priority)) {
    return false;
  }
  if (filterStatuses.length > 0 && !filterStatuses.includes(ticket.main_status)) {
    return false;
  }
  if (filterPoolCodes.length > 0 && (!ticket.current_pool_code || !filterPoolCodes.includes(ticket.current_pool_code))) {
    return false;
  }
  const claimStatus: TicketClaimStatus =
    ticket.assigned_to_user_id || ticket.assigned_to ? "claimed" : "unclaimed";
  if (filterClaimStatuses.length > 0 && !filterClaimStatuses.includes(claimStatus)) {
    return false;
  }
  const createdAt = new Date(ticket.created_at).getTime();
  if (dateRange.start) {
    const start = new Date(`${dateRange.start}T00:00:00`).getTime();
    if (!Number.isNaN(start) && createdAt < start) {
      return false;
    }
  }
  if (dateRange.end) {
    const end = new Date(`${dateRange.end}T23:59:59`).getTime();
    if (!Number.isNaN(end) && createdAt > end) {
      return false;
    }
  }
  return true;
}

function sortTickets(items: TicketSummary[], field: SortField, direction: SortDirection) {
  const priorityRank: Record<TicketSummary["priority"], number> = {
    P1: 1,
    P2: 2,
    P3: 3,
    P4: 4
  };

  const multiplier = direction === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    let comparison = 0;
    switch (field) {
      case "id":
        comparison = left.id - right.id;
        break;
      case "priority":
        comparison = priorityRank[left.priority] - priorityRank[right.priority];
        break;
      case "risk_score":
        comparison = left.risk_score - right.risk_score;
        break;
      case "created_at":
        comparison = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
        break;
      case "response_deadline_at":
        comparison =
          new Date(left.response_deadline_at ?? 0).getTime() -
          new Date(right.response_deadline_at ?? 0).getTime();
        break;
      case "resolution_deadline_at":
        comparison =
          new Date(left.resolution_deadline_at ?? 0).getTime() -
          new Date(right.resolution_deadline_at ?? 0).getTime();
        break;
      default:
        comparison = left.id - right.id;
    }
    return comparison * multiplier;
  });
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
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }
}

function priorityClass(priority: string) {
  switch (priority) {
    case "P1":
      return "bg-red-500 text-white";
    case "P2":
      return "bg-orange-500 text-white";
    case "P3":
      return "bg-yellow-500 text-slate-950";
    default:
      return "bg-emerald-500 text-white";
  }
}

function riskClass(score: number) {
  if (score >= 90) return "text-red-600 dark:text-red-400";
  if (score >= 70) return "text-orange-600 dark:text-orange-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function RiskBar({ score }: { score: number }) {
  const tone = score >= 90 ? "bg-red-500" : score >= 70 ? "bg-orange-500" : score >= 40 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function toggleSelection<T extends string>(current: T[], value: T) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

interface TicketListPageProps {
  assignedToMeOnly?: boolean;
}

export default function TicketListPage({ assignedToMeOnly = false }: TicketListPageProps) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { lastTicketEvent } = useRealtime();
  const [items, setItems] = useState<TicketSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<TicketPriority[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<TicketMainStatus[]>([]);
  const [filterClaimStatuses, setFilterClaimStatuses] = useState<TicketClaimStatus[]>(() =>
    assignedToMeOnly ? [] : ["unclaimed"]
  );
  const [filterPoolCodes, setFilterPoolCodes] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketSummary | null>(null);
  const [poolTotals, setPoolTotals] = useState<Record<PoolCode, number | null>>({
    T1_POOL: null,
    T2_POOL: null,
    T3_POOL: null
  });
  const [poolTotalsLoading, setPoolTotalsLoading] = useState(false);
  const [poolTotalsError, setPoolTotalsError] = useState("");
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const loadMoreLockedRef = useRef(false);
  const deadlineNowMs = useTicketDeadlineClock(lastTicketEvent?.message_id ?? null);

  const forceAssignedToMe = assignedToMeOnly;

  const listQuery = useMemo<TicketQuery>(
    () => ({
      ticketId: searchTerm || undefined,
      categoryIds: filterCategoryIds.length > 0 ? filterCategoryIds : undefined,
      priorities: filterPriorities.length > 0 ? filterPriorities : undefined,
      mainStatuses: filterStatuses.length > 0 ? filterStatuses : undefined,
      claimStatuses: filterClaimStatuses.length > 0 ? filterClaimStatuses : undefined,
      poolCodes: filterPoolCodes.length > 0 ? filterPoolCodes : undefined,
      createdFrom: dateRange.start || undefined,
      createdTo: dateRange.end || undefined,
      sortBy: sortField,
      sortDir: sortDirection,
      assignedToMe: forceAssignedToMe || undefined,
    }),
    [
      dateRange.end,
      dateRange.start,
      filterCategoryIds,
      filterClaimStatuses,
      filterPoolCodes,
      filterPriorities,
      filterStatuses,
      forceAssignedToMe,
      searchTerm,
      sortDirection,
      sortField
    ]
  );

  const loadPoolTotals = useCallback(async () => {
    setPoolTotalsLoading(true);
    setPoolTotalsError("");

    try {
      const responses = await Promise.allSettled(
        POOL_CODES.map(async (poolCode) => {
          const payload = await listTickets({
            poolCodes: [poolCode],
            limit: 1,
            offset: 0
          });
          return {
            poolCode,
            count: payload.filtered_count ?? payload.total_count
          };
        })
      );

      const nextTotals: Record<PoolCode, number | null> = {
        T1_POOL: null,
        T2_POOL: null,
        T3_POOL: null
      };
      let hasPartialFailure = false;

      for (const response of responses) {
        if (response.status === "fulfilled") {
          nextTotals[response.value.poolCode] = response.value.count;
        } else {
          hasPartialFailure = true;
        }
      }

      setPoolTotals(nextTotals);
      setPoolTotalsError(hasPartialFailure ? "partial_unavailable" : "");
    } catch (error) {
      setPoolTotals({
        T1_POOL: null,
        T2_POOL: null,
        T3_POOL: null
      });
      setPoolTotalsError(errorMessage(error, language === "zh" ? "池子统计加载失败" : "Pool totals unavailable"));
    } finally {
      setPoolTotalsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    loadMoreLockedRef.current = false;

    async function load() {
      setLoading(true);
      setLoadingMore(false);
      setLoadError(null);
      try {
        const result = await listTickets({
          ...listQuery,
          limit: PAGE_SIZE,
          offset: 0
        });
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        const nextFilteredCount = result.filtered_count ?? result.total_count;
        const nextOffset = result.next_offset ?? result.items.length;
        const nextHasMore = result.has_more ?? nextOffset < nextFilteredCount;
        setItems(result.items);
        setTotalCount(result.total_count);
        setFilteredCount(nextFilteredCount);
        setHasMore(nextHasMore);
        setSelectedTicket((current) => {
          if (!current) return null;
          return result.items.find((item) => item.id === current.id) ?? null;
        });
      } catch (error) {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setItems([]);
        setTotalCount(0);
        setFilteredCount(0);
        setHasMore(false);
        setLoadError(
          errorMessage(
            error,
            language === "zh" ? "工单列表加载失败，请稍后重试。" : "Failed to load tickets."
          )
        );
      } finally {
        if (!cancelled && requestSeq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [language, listQuery]);

  useEffect(() => {
    void loadPoolTotals();
  }, [loadPoolTotals]);

  const loadMoreTickets = () => {
    if (loading || loadingMore || !hasMore || loadMoreLockedRef.current) {
      return;
    }

    loadMoreLockedRef.current = true;
    const requestSeq = requestSeqRef.current;
    const nextOffset = items.length;
    setLoadingMore(true);
    setLoadError(null);

    void listTickets({
      ...listQuery,
      limit: PAGE_SIZE,
      offset: nextOffset
    })
      .then((result) => {
        if (requestSeq !== requestSeqRef.current) {
          return;
        }
        const nextFilteredCount = result.filtered_count ?? result.total_count;
        const nextPageOffset = result.next_offset ?? nextOffset + result.items.length;
        const nextHasMore = result.has_more ?? nextPageOffset < nextFilteredCount;
        setItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const incoming = result.items.filter((item) => !existingIds.has(item.id));
          return [...current, ...incoming];
        });
        setTotalCount(result.total_count);
        setFilteredCount(nextFilteredCount);
        setHasMore(nextHasMore);
      })
      .catch((error) => {
        if (requestSeq !== requestSeqRef.current) {
          return;
        }
        setLoadError(
          errorMessage(
            error,
            language === "zh" ? "加载更多工单失败，请稍后重试。" : "Failed to load more tickets."
          )
        );
      })
      .finally(() => {
        if (requestSeq === requestSeqRef.current) {
          setLoadingMore(false);
          loadMoreLockedRef.current = false;
        }
      });
  };

  const handleTableScroll = () => {
    const scrollNode = tableScrollRef.current;
    if (!scrollNode) {
      return;
    }
    const distanceToBottom =
      scrollNode.scrollHeight - (scrollNode.scrollTop + scrollNode.clientHeight);
    if (distanceToBottom <= 4) {
      loadMoreTickets();
    }
  };

  useEffect(() => {
    if (!lastTicketEvent) {
      return;
    }
    const ticketEvent = lastTicketEvent;

    let cancelled = false;

    async function refreshChangedTicket() {
      const ticketId = String(ticketEvent.payload.ticket_id);
      try {
        const nextTicket = await getTicket(ticketId);
        if (cancelled) {
          return;
        }
        const matches = ticketMatchesFilters(nextTicket, {
          searchTerm,
          filterCategoryIds,
          filterPriorities,
          filterStatuses,
          filterClaimStatuses,
          filterPoolCodes,
          dateRange
        });
        setItems((current) => {
          const exists = current.some((item) => item.id === nextTicket.id);
          if (!exists) {
            return current;
          }
          if (!matches) {
            return current.filter((item) => item.id !== nextTicket.id);
          }
          return sortTickets(
            current.map((item) => (item.id === nextTicket.id ? nextTicket : item)),
            sortField,
            sortDirection
          );
        });
        setSelectedTicket((current) => {
          if (!current || current.id !== nextTicket.id) {
            return current;
          }
          return matches ? nextTicket : null;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          const changedTicketId = Number(ticketId);
          setItems((current) => current.filter((item) => item.id !== changedTicketId));
          setSelectedTicket((current) =>
            current?.id === changedTicketId ? null : current
          );
        }
      }
    }

    void refreshChangedTicket();

    return () => {
      cancelled = true;
    };
  }, [
    dateRange,
    filterCategoryIds,
    filterClaimStatuses,
    filterPoolCodes,
    filterPriorities,
    filterStatuses,
    lastTicketEvent,
    searchTerm,
    sortDirection,
    sortField
  ]);

  useEffect(() => {
    if (!lastTicketEvent) {
      return;
    }
    void loadPoolTotals();
  }, [lastTicketEvent, loadPoolTotals]);

  const metrics = useMemo(() => metricSummary(items), [items]);
  const visibleMetricSubtitle =
    language === "zh"
      ? `当前已加载 / 当前筛选结果（总计 ${totalCount}）`
      : `Loaded / filtered result (total ${totalCount})`;

  const categoryLabel = (categoryId: string, fallback: string) =>
    categories.find((category) => category.id === categoryId)?.[language] ?? fallback;
  const hasActiveStructuredFilters =
    filterCategoryIds.length > 0 ||
    filterPriorities.length > 0 ||
    filterStatuses.length > 0 ||
    filterClaimStatuses.length > 0 ||
    filterPoolCodes.length > 0 ||
    Boolean(dateRange.start || dateRange.end);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("desc");
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard title={t("ticket.metrics.visible")} value={`${items.length} / ${filteredCount}`} subtitle={visibleMetricSubtitle} />
        <MetricCard title={t("ticket.metrics.waiting")} value={String(metrics.waiting)} subtitle="当前处于待响应状态的工单" />
        <MetricCard title={t("ticket.metrics.timeout")} value={String(metrics.timeout)} subtitle="需要优先盯防的超时工单" />
        <MetricCard title={t("ticket.metrics.closed")} value={String(metrics.closed)} subtitle="用于复盘和闭环的工单" />
        <PoolTotalsMetricCard language={language} totals={poolTotals} loading={poolTotalsLoading} errorMessage={poolTotalsError} />
      </section>

      <section className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t("common.searchTicketId")}
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
              onClick={() => setShowFilters((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  showFilters || hasActiveStructuredFilters
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Filter className="h-4 w-4" />
                {t("common.filter")}
              </button>
              <Link
                to="/tickets/new"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                {t("common.create")}
              </Link>
            </div>
          </div>

          {showFilters && (
            <div className="mb-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 dark:border-slate-800 dark:bg-slate-950/40">
              <FilterField label={t("ticket.category")}>
                <FilterToggleGroup
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category[language]
                  }))}
                  selectedValues={filterCategoryIds}
                  onToggle={(value) => setFilterCategoryIds((current) => toggleSelection(current, value))}
                />
              </FilterField>

              <FilterField label={t("ticket.priority")}>
                <FilterToggleGroup
                  options={priorityOptions.map((priority) => ({
                    value: priority,
                    label: priority
                  }))}
                  selectedValues={filterPriorities}
                  onToggle={(value) => setFilterPriorities((current) => toggleSelection(current, value as TicketPriority))}
                />
              </FilterField>

              <FilterField label={t("ticket.status")}>
                <FilterToggleGroup
                  options={mainStatusOptions.map((status) => ({
                    value: status,
                    label: t(`status.${status.toLowerCase()}`)
                  }))}
                  selectedValues={filterStatuses}
                  onToggle={(value) => setFilterStatuses((current) => toggleSelection(current, value as TicketMainStatus))}
                />
              </FilterField>

              <FilterField label={t("ticket.claimStatus")}>
                <FilterToggleGroup
                  options={claimStatusOptions.map((status) => ({
                    value: status.value,
                    label: status[language]
                  }))}
                  selectedValues={filterClaimStatuses}
                  onToggle={(value) =>
                    setFilterClaimStatuses((current) => toggleSelection(current, value as TicketClaimStatus))
                  }
                />
              </FilterField>

              <FilterField label={t("ticket.poolFilter")}>
                <FilterToggleGroup
                  options={poolOptions.map((pool) => ({
                    value: pool.value,
                    label: pool[language]
                  }))}
                  selectedValues={filterPoolCodes}
                  onToggle={(value) => setFilterPoolCodes((current) => toggleSelection(current, value))}
                />
              </FilterField>

              <FilterField label={language === "zh" ? "创建时间范围" : "Created Range"}>
                <DateRangePicker
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  onChange={(start, end) => setDateRange({ start, end })}
                />
              </FilterField>
            </div>
          )}

          {loadError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {loadError}
            </div>
          )}

          <div className="min-h-0 overflow-visible">
            <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div
                ref={tableScrollRef}
                onScroll={handleTableScroll}
                className="max-h-[calc(100vh-20rem)] overflow-auto"
              >
                <table className="min-w-[1480px] w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <SortableHead label="ID" field="id" activeField={sortField} direction={sortDirection} onSort={toggleSort} />
                      <SortableHead label={t("ticket.priority")} field="priority" activeField={sortField} direction={sortDirection} onSort={toggleSort} />
                      <SortableHead label={t("ticket.risk")} field="risk_score" activeField={sortField} direction={sortDirection} onSort={toggleSort} icon={<ShieldAlert className="h-3 w-3" />} />
                      <HeadCell label={t("ticket.title")} />
                      <HeadCell label={t("ticket.category")} />
                      <HeadCell label={t("ticket.status")} />
                      <HeadCell label={t("ticket.assignee")} />
                      <HeadCell label={t("ticket.pool")} />
                      <SortableHead label={t("ticket.responseDeadline")} field="response_deadline_at" activeField={sortField} direction={sortDirection} onSort={toggleSort} />
                      <SortableHead label={t("ticket.resolutionDeadline")} field="resolution_deadline_at" activeField={sortField} direction={sortDirection} onSort={toggleSort} />
                      <SortableHead label={t("ticket.createdAt")} field="created_at" activeField={sortField} direction={sortDirection} onSort={toggleSort} />
                      <HeadCell label={t("ticket.actions")} />
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {loading ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                          {t("common.loading")}
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                          {t("common.noData")}
                        </td>
                      </tr>
                    ) : (
                      items.map((ticket, index) => (
                        <tr
                          key={ticket.id}
                          onClick={() => setSelectedTicket(ticket)}
                          className={`cursor-pointer border-b border-slate-100 text-sm transition-colors dark:border-slate-800 ${
                            selectedTicket?.id === ticket.id
                              ? "border-l-2 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20"
                              : index % 2 === 0
                                ? "bg-white hover:bg-blue-50/40 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                                : "bg-slate-50/70 hover:bg-blue-50/40 dark:bg-slate-950/40 dark:hover:bg-slate-800/70"
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono">
                            <Link
                              to={`/tickets/${ticket.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              #{ticket.id}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex flex-nowrap items-center gap-2">
                              <span className={`font-semibold ${riskClass(ticket.risk_score)}`}>{ticket.risk_score}</span>
                              <RiskBar score={ticket.risk_score} />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-xs truncate whitespace-nowrap font-bold text-slate-900 dark:text-white" title={ticket.title}>
                              {ticket.title}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{categoryLabel(ticket.category_id, ticket.category_name)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(ticket.main_status)}`}>
                              {t(`status.${ticket.main_status.toLowerCase()}`)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{ticket.assigned_to ?? "-"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{ticket.current_pool_code ?? "-"}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <DeadlineCell
                              ticket={ticket}
                              kind="response"
                              nowMs={deadlineNowMs}
                              language={language}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <DeadlineCell
                              ticket={ticket}
                              kind="resolution"
                              nowMs={deadlineNowMs}
                              language={language}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{formatApiDateTime(ticket.created_at, language)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                              <Link
                                to={`/tickets/${ticket.id}`}
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {t("ticket.view")}
                              </Link>
                              <Link
                                to={`/tickets/${ticket.id}?edit=1`}
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                {t("ticket.edit")}
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    {!loading && items.length > 0 && loadingMore && (
                      <tr>
                        <td colSpan={12} className="px-6 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                          {language === "zh" ? "正在加载更多工单..." : "Loading more tickets..."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {selectedTicket && (
          <div className="w-full xl:sticky xl:top-[5.5rem] xl:w-[480px] xl:flex-shrink-0">
            <TicketDrawer
              ticket={selectedTicket}
              open={true}
              onClose={() => setSelectedTicket(null)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{subtitle}</div>
    </div>
  );
}

function PoolTotalsMetricCard({
  language,
  totals,
  loading,
  errorMessage
}: {
  language: "zh" | "en";
  totals: Record<PoolCode, number | null>;
  loading: boolean;
  errorMessage: string;
}) {
  const poolItems = [
    { key: "T1_POOL" as const, label: "T1", tone: "text-blue-600 dark:text-blue-300" },
    { key: "T2_POOL" as const, label: "T2", tone: "text-amber-600 dark:text-amber-300" },
    { key: "T3_POOL" as const, label: "T3", tone: "text-rose-600 dark:text-rose-300" }
  ];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500 dark:text-slate-400">{language === "zh" ? "池子总量" : "Pool Totals"}</div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="grid grid-cols-3">
          {poolItems.map((item, index) => (
            <div
              key={item.key}
              className={`px-3 py-2.5 ${index < poolItems.length - 1 ? "border-r border-slate-200 dark:border-slate-800" : ""}`}
            >
              <div className={`mb-1 text-[11px] font-semibold tracking-[0.12em] ${item.tone}`}>{item.label}</div>
              {loading ? (
                <div className="h-7 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              ) : (
                <div className={`font-mono text-3xl font-semibold leading-8 tabular-nums ${item.tone}`}>{totals[item.key] ?? "--"}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={`mt-2 text-xs leading-5 ${errorMessage ? "text-amber-600 dark:text-amber-300" : "text-slate-400"}`}>
        {errorMessage
          ? language === "zh"
            ? "部分池子统计暂不可用"
            : "Some pool totals are temporarily unavailable"
          : language === "zh"
            ? "按当前账号可见范围统计"
            : "Counts scoped to current account visibility"}
      </div>
    </div>
  );
}

function DeadlineCell({
  ticket,
  kind,
  nowMs,
  language,
}: {
  ticket: TicketSummary;
  kind: "response" | "resolution";
  nowMs: number;
  language: "zh" | "en";
}) {
  const presentation = getTicketDeadlinePresentation(ticket, kind, nowMs, language);
  const toneClass =
    presentation.tone === "healthy"
      ? "text-emerald-600 dark:text-emerald-400"
      : presentation.tone === "overdue"
        ? "text-red-600 dark:text-red-400"
        : "text-slate-500 dark:text-slate-400";

  return <span className={`whitespace-nowrap font-mono text-xs font-semibold ${toneClass}`}>{presentation.label}</span>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FilterToggleGroup({
  options,
  selectedValues,
  onToggle,
}: {
  options: Array<{ value: string; label: string }>;
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap content-start gap-2">
      {options.map((option) => {
        const active = selectedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={`h-fit whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const tableHeadLabelClass =
  "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold leading-none uppercase tracking-[0.18em] text-slate-400";

function HeadCell({ label }: { label: string }) {
  return (
    <th className="px-4 py-3 text-left">
      <span className={tableHeadLabelClass}>{label}</span>
    </th>
  );
}

function SortableHead({
  label,
  field,
  activeField,
  direction,
  onSort,
  icon
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  icon?: ReactNode;
}) {
  const active = activeField === field;
  return (
    <th className="px-4 py-3 text-left">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`${tableHeadLabelClass} group transition-colors hover:text-slate-500 dark:hover:text-slate-300`}
      >
        {icon}
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}
