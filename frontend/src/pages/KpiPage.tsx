import { RefreshCw, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { getKpiOverview, listKpiUsers } from "../api/kpi";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { KpiMetricSummary, KpiOverview, KpiTrendPoint, KpiUserItem } from "../types/kpi";

const WINDOW_OPTIONS = [7, 30, 90] as const;
const ROLE_FILTER_OPTIONS = ["all", "T1", "T2", "T3", "ADMIN"] as const;

const USER_TABLE_SORT_FIELDS = [
  "username",
  "display_name",
  "highest_role_code",
  "handled_count",
  "avg_response_seconds",
  "avg_resolution_seconds",
  "sla_attainment_rate",
  "weighted_sla_attainment_rate",
] as const;

type UserSortField = (typeof USER_TABLE_SORT_FIELDS)[number];
type UserSortDir = "asc" | "desc";

type TrendValueField = "handled_count" | "sla_attainment_rate" | "weighted_sla_attainment_rate";

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(2)}%`;
}

function formatDuration(value: number | null, zh: boolean): string {
  if (value === null) return "-";

  const totalSeconds = Math.max(0, Math.round(value));
  if (totalSeconds < 60) {
    return zh ? `${totalSeconds} 秒` : `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return zh ? `${hours} 小时 ${minutes} 分` : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return zh ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`;
  }
  return zh ? `${seconds} 秒` : `${seconds}s`;
}

function formatDay(date: string): string {
  return date.length >= 10 ? date.slice(5) : date;
}

function TrendCard({
  title,
  points,
  valueField,
  lineClass,
  formatter,
  zh,
}: {
  title: string;
  points: KpiTrendPoint[];
  valueField: TrendValueField;
  lineClass: string;
  formatter: (value: number | null) => string;
  zh: boolean;
}) {
  const values = points.map((point) => point[valueField]);
  const numericValues = values.filter((value): value is number => value !== null);
  const hasData = numericValues.length > 0;

  const chartPoints = useMemo(() => {
    if (!hasData || points.length <= 1) {
      return "";
    }

    const fallback = 0;
    const normalizedValues = values.map((value) => value ?? fallback);
    const maxValue = Math.max(...normalizedValues, 1);
    const minValue = Math.min(...normalizedValues, 0);
    const range = maxValue - minValue || 1;

    return normalizedValues
      .map((value, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 32 - ((value - minValue) / range) * 24;
        return `${x},${y}`;
      })
      .join(" ");
  }, [hasData, points, values]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{title}</div>
      {hasData ? (
        <>
          <div className="h-24 rounded-xl border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
            <svg viewBox="0 0 100 36" className="h-full w-full">
              <polyline
                fill="none"
                strokeWidth="2"
                points={chartPoints}
                className={lineClass}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
            <span>{formatDay(points[0]?.date ?? "")}</span>
            <span>{formatter(values[values.length - 1] ?? null)}</span>
            <span>{formatDay(points[points.length - 1]?.date ?? "")}</span>
          </div>
        </>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
          {zh ? "暂无趋势数据" : "No trend data"}
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
    </div>
  );
}

function SummaryGrid({
  summary,
  zh,
}: {
  summary: KpiMetricSummary;
  zh: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        title={zh ? "处理数量" : "Handled"}
        value={String(summary.handled_count)}
        subtitle={zh ? "按完成工单统计" : "Completed tickets"}
      />
      <MetricCard
        title={zh ? "平均响应时长" : "Avg Response"}
        value={formatDuration(summary.avg_response_seconds, zh)}
        subtitle={zh ? "created -> responded" : "created -> responded"}
      />
      <MetricCard
        title={zh ? "平均处置时长" : "Avg Resolution"}
        value={formatDuration(summary.avg_resolution_seconds, zh)}
        subtitle={zh ? "created -> completion" : "created -> completion"}
      />
      <MetricCard
        title={zh ? "SLA 达标率" : "SLA Attainment"}
        value={formatPercent(summary.sla_attainment_rate)}
        subtitle={zh ? "响应+处置双达标" : "Response + resolution"}
      />
      <MetricCard
        title={zh ? "风险加权达标率" : "Weighted SLA"}
        value={formatPercent(summary.weighted_sla_attainment_rate)}
        subtitle={zh ? "风险分加权" : "Risk-score weighted"}
      />
    </div>
  );
}

function TrendGrid({ points, zh }: { points: KpiTrendPoint[]; zh: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <TrendCard
        title={zh ? "处理量趋势" : "Handled Trend"}
        points={points}
        valueField="handled_count"
        lineClass="stroke-blue-600"
        formatter={(value) => String(value ?? 0)}
        zh={zh}
      />
      <TrendCard
        title={zh ? "SLA 达标率趋势" : "SLA Trend"}
        points={points}
        valueField="sla_attainment_rate"
        lineClass="stroke-emerald-600"
        formatter={formatPercent}
        zh={zh}
      />
      <TrendCard
        title={zh ? "风险加权趋势" : "Weighted SLA Trend"}
        points={points}
        valueField="weighted_sla_attainment_rate"
        lineClass="stroke-amber-600"
        formatter={formatPercent}
        zh={zh}
      />
    </div>
  );
}

export default function KpiPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const zh = language === "zh";
  const isAdmin = user?.active_role === "ADMIN";

  const [windowDays, setWindowDays] = useState<(typeof WINDOW_OPTIONS)[number]>(30);
  const [refreshToken, setRefreshToken] = useState(0);

  const [overview, setOverview] = useState<KpiOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTER_OPTIONS)[number]>("all");
  const [sortBy, setSortBy] = useState<UserSortField>("handled_count");
  const [sortDir, setSortDir] = useState<UserSortDir>("desc");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  const [userItems, setUserItems] = useState<KpiUserItem[]>([]);
  const [userFilteredCount, setUserFilteredCount] = useState(0);
  const [userHasMore, setUserHasMore] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");

  useEffect(() => {
    setOffset(0);
  }, [windowDays, deferredSearch, roleFilter, sortBy, sortDir, limit]);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setOverviewLoading(true);
      setOverviewError("");
      try {
        const payload = await getKpiOverview(windowDays);
        if (!cancelled) {
          setOverview(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setOverviewError(error instanceof Error ? error.message : zh ? "加载 KPI 失败" : "Failed to load KPI");
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    }

    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [windowDays, refreshToken, zh]);

  useEffect(() => {
    if (!isAdmin) {
      setUserItems([]);
      setUserFilteredCount(0);
      setUserHasMore(false);
      setUserError("");
      setUserLoading(false);
      return;
    }

    let cancelled = false;

    async function loadUsers() {
      setUserLoading(true);
      setUserError("");
      try {
        const payload = await listKpiUsers({
          windowDays,
          search: deferredSearch,
          roleCode: roleFilter,
          sortBy,
          sortDir,
          limit,
          offset,
        });
        if (!cancelled) {
          setUserItems(payload.items);
          setUserFilteredCount(payload.filtered_count);
          setUserHasMore(payload.has_more);
        }
      } catch (error) {
        if (!cancelled) {
          setUserError(error instanceof Error ? error.message : zh ? "加载用户 KPI 失败" : "Failed to load user KPI");
        }
      } finally {
        if (!cancelled) {
          setUserLoading(false);
        }
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [deferredSearch, isAdmin, limit, offset, refreshToken, roleFilter, sortBy, sortDir, windowDays, zh]);

  function handleSort(nextField: UserSortField) {
    if (sortBy === nextField) {
      setSortDir((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(nextField);
    setSortDir("desc");
  }

  const canGoPrev = offset > 0;
  const canGoNext = userHasMore;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{zh ? "KPI 绩效看板" : "KPI Dashboard"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {zh
                ? "按响应与处置时效统计个人与团队绩效。"
                : "Performance indicators based on response and resolution efficiency."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setWindowDays(option)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  windowDays === option
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {zh ? `近 ${option} 天` : `${option}d`}
              </button>
            ))}
            <button
              onClick={() => setRefreshToken((current) => current + 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              {zh ? "刷新" : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      {overviewLoading && !overview ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {zh ? "正在加载 KPI 数据..." : "Loading KPI data..."}
        </div>
      ) : overviewError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {overviewError}
        </div>
      ) : overview ? (
        <>
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{zh ? "个人 KPI" : "My KPI"}</h3>
            <SummaryGrid summary={overview.personal.summary} zh={zh} />
            <TrendGrid points={overview.personal.trend} zh={zh} />
          </section>

          {isAdmin && (
            <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{zh ? "全员 KPI" : "All Users KPI"}</h3>

              {overview.global ? (
                <>
                  <SummaryGrid summary={overview.global.summary} zh={zh} />
                  <TrendGrid points={overview.global.trend} zh={zh} />
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  {zh ? "暂无全员 KPI 数据。" : "No global KPI data."}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{zh ? "用户绩效列表" : "User KPI List"}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={zh ? "搜索用户名/姓名" : "Search username/display name"}
                        className="rounded-lg border border-slate-300 py-1.5 pl-7 pr-3 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                    </label>
                    <select
                      value={roleFilter}
                      onChange={(event) => setRoleFilter(event.target.value as (typeof ROLE_FILTER_OPTIONS)[number])}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="all">{zh ? "全部角色" : "All roles"}</option>
                      <option value="T1">T1</option>
                      <option value="T2">T2</option>
                      <option value="T3">T3</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <select
                      value={String(limit)}
                      onChange={(event) => setLimit(Number(event.target.value))}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                </div>

                {userError ? (
                  <div className="p-4 text-sm text-red-600 dark:text-red-300">{userError}</div>
                ) : userLoading ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{zh ? "加载中..." : "Loading..."}</div>
                ) : userItems.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{zh ? "暂无用户数据" : "No user data"}</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                          <tr>
                            <SortableTh
                              label={zh ? "用户" : "User"}
                              field="display_name"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                            <SortableTh
                              label={zh ? "最高角色" : "Role"}
                              field="highest_role_code"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                            <SortableTh
                              label={zh ? "处理数" : "Handled"}
                              field="handled_count"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                            <SortableTh
                              label={zh ? "平均响应" : "Avg Response"}
                              field="avg_response_seconds"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                            <SortableTh
                              label={zh ? "平均处置" : "Avg Resolution"}
                              field="avg_resolution_seconds"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                            <SortableTh
                              label={zh ? "SLA 达标" : "SLA"}
                              field="sla_attainment_rate"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                            <SortableTh
                              label={zh ? "风险加权" : "Weighted SLA"}
                              field="weighted_sla_attainment_rate"
                              sortBy={sortBy}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {userItems.map((item) => (
                            <tr key={item.user_id} className="bg-white dark:bg-slate-900/40">
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-800 dark:text-slate-100">{item.display_name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">@{item.username}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                <span className="mr-2 rounded border border-slate-200 px-2 py-0.5 text-xs dark:border-slate-700">{item.highest_role_code}</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500">{item.roles.join(", ")}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.handled_count}</td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDuration(item.avg_response_seconds, zh)}</td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDuration(item.avg_resolution_seconds, zh)}</td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatPercent(item.sla_attainment_rate)}</td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatPercent(item.weighted_sla_attainment_rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <span>
                        {zh
                          ? `当前展示 ${offset + 1}-${offset + userItems.length} / ${userFilteredCount}`
                          : `Showing ${offset + 1}-${offset + userItems.length} of ${userFilteredCount}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOffset((current) => Math.max(0, current - limit))}
                          disabled={!canGoPrev}
                          className="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                        >
                          {zh ? "上一页" : "Prev"}
                        </button>
                        <button
                          onClick={() => setOffset((current) => current + limit)}
                          disabled={!canGoNext}
                          className="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                        >
                          {zh ? "下一页" : "Next"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function SortableTh({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: UserSortField;
  sortBy: UserSortField;
  sortDir: UserSortDir;
  onSort: (field: UserSortField) => void;
}) {
  const active = sortBy === field;
  const indicator = active ? (sortDir === "desc" ? "↓" : "↑") : "↕";

  return (
    <th className="px-4 py-3 font-semibold">
      <button className="inline-flex items-center gap-1" onClick={() => onSort(field)}>
        <span>{label}</span>
        <span>{indicator}</span>
      </button>
    </th>
  );
}
