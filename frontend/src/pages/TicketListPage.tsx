import { ChevronDown, ChevronUp, Edit, Eye, Filter, Plus, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { listTickets } from "../api/tickets";
import DateRangePicker from "../components/DateRangePicker";
import TicketDrawer from "../components/TicketDrawer";
import { useLanguage } from "../contexts/LanguageContext";
import type { TicketSummary } from "../types/ticket";
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
  "RESPONSE_TIMEOUT",
  "RESOLUTION_TIMEOUT",
  "RESOLVED",
  "CLOSED"
];

function metricSummary(items: TicketSummary[]) {
  return {
    waiting: items.filter((item) => item.main_status === "WAITING_RESPONSE").length,
    timeout: items.filter((item) => item.main_status === "RESPONSE_TIMEOUT" || item.main_status === "RESOLUTION_TIMEOUT").length,
    closed: items.filter((item) => item.main_status === "RESOLVED" || item.main_status === "CLOSED").length
  };
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

export default function TicketListPage() {
  const { language, t } = useLanguage();
  const [items, setItems] = useState<TicketSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await listTickets({
          ticketId: searchTerm || undefined,
          category: filterCategory,
          priority: filterPriority,
          mainStatus: filterStatus,
          createdFrom: dateRange.start || undefined,
          createdTo: dateRange.end || undefined,
          sortBy: sortField,
          sortDir: sortDirection
        });
        if (cancelled) return;
        setItems(result.items);
        setTotalCount(result.total_count);
        if (selectedTicket) {
          const current = result.items.find((item) => item.id === selectedTicket.id) ?? null;
          setSelectedTicket(current);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [dateRange.end, dateRange.start, filterCategory, filterPriority, filterStatus, searchTerm, selectedTicket?.id, sortDirection, sortField]);

  const metrics = useMemo(() => metricSummary(items), [items]);

  const categoryLabel = (categoryId: string, fallback: string) =>
    categories.find((category) => category.id === categoryId)?.[language] ?? fallback;

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
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard title={t("ticket.metrics.visible")} value={`${items.length} / ${totalCount}`} subtitle="当前列表结果 / 总工单数" />
        <MetricCard title={t("ticket.metrics.waiting")} value={String(metrics.waiting)} subtitle="当前处于待响应状态的工单" />
        <MetricCard title={t("ticket.metrics.timeout")} value={String(metrics.timeout)} subtitle="需要优先盯防的超时工单" />
        <MetricCard title={t("ticket.metrics.closed")} value={String(metrics.closed)} subtitle="用于复盘和闭环的工单" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                showFilters
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
          <div className="mb-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/40">
            <FilterField label={t("ticket.category")}>
              <select
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value)}
                className="ticket-select"
              >
                <option value="all">{language === "zh" ? "全部分类" : "All Categories"}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category[language]}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t("ticket.priority")}>
              <select
                value={filterPriority}
                onChange={(event) => setFilterPriority(event.target.value)}
                className="ticket-select"
              >
                <option value="all">{language === "zh" ? "全部优先级" : "All Priorities"}</option>
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t("ticket.status")}>
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                className="ticket-select"
              >
                <option value="all">{language === "zh" ? "全部状态" : "All Statuses"}</option>
                {mainStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status.toLowerCase()}`)}
                  </option>
                ))}
              </select>
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

        <div className="flex min-h-0 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="overflow-auto">
              <table className="min-w-full border-collapse">
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
                          index % 2 === 0
                            ? "bg-white hover:bg-blue-50/60 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                            : "bg-slate-50/70 hover:bg-blue-50/60 dark:bg-slate-950/40 dark:hover:bg-slate-800/70"
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">#{ticket.id}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${riskClass(ticket.risk_score)}`}>{ticket.risk_score}</span>
                            <RiskBar score={ticket.risk_score} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-xs truncate font-medium text-slate-900 dark:text-white" title={ticket.title}>
                            {ticket.title}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{categoryLabel(ticket.category_id, ticket.category_name)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(ticket.main_status)}`}>
                            {t(`status.${ticket.main_status.toLowerCase()}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ticket.assigned_to ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ticket.current_pool_code ?? "-"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{formatApiDateTime(ticket.response_deadline_at, language)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{formatApiDateTime(ticket.resolution_deadline_at, language)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{formatApiDateTime(ticket.created_at, language)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/tickets/${ticket.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t("ticket.view")}
                            </Link>
                            <button
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              {t("ticket.edit")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <TicketDrawer ticket={selectedTicket} open={selectedTicket !== null} onClose={() => setSelectedTicket(null)} />
        </div>
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

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      {children}
    </label>
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
