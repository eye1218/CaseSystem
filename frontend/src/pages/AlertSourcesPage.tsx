import {
  Database,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import {
  createAlertSource,
  listAlertSources,
  queryAlertSourceByTickets,
  testAlertSource,
  updateAlertSource,
  updateAlertSourceStatus,
} from "../api/alertSources";
import { useLanguage } from "../contexts/LanguageContext";
import type {
  AlertSourceCreatePayload,
  AlertSourceQueryResponse,
  AlertSourceStatus,
  AlertSourceSummary,
  AlertSourceTestResponse,
} from "../types/alertSource";
import { formatApiDateTime } from "../utils/datetime";

interface AlertSourceFormState {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  database_name: string;
  table_name: string;
  ticket_match_field: string;
  status: AlertSourceStatus;
}

function defaultFormState(): AlertSourceFormState {
  return {
    name: "",
    host: "",
    port: "9030",
    username: "",
    password: "",
    database_name: "",
    table_name: "",
    ticket_match_field: "alert_id",
    status: "ENABLED",
  };
}

function fromSource(item: AlertSourceSummary): AlertSourceFormState {
  return {
    name: item.name,
    host: item.host,
    port: String(item.port),
    username: item.username,
    password: "",
    database_name: item.database_name,
    table_name: item.table_name,
    ticket_match_field: item.ticket_match_field,
    status: item.status,
  };
}

function formEquals(left: AlertSourceFormState, right: AlertSourceFormState): boolean {
  return (
    left.name === right.name &&
    left.host === right.host &&
    left.port === right.port &&
    left.username === right.username &&
    left.password === right.password &&
    left.database_name === right.database_name &&
    left.table_name === right.table_name &&
    left.ticket_match_field === right.ticket_match_field &&
    left.status === right.status
  );
}

function parseTicketKeys(value: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const segment of value.split(/[\n,;]+/)) {
    const normalized = segment.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function renderValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function statusPalette(status: AlertSourceStatus) {
  return status === "ENABLED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300";
}

function resultPalette(result: AlertSourceSummary["latest_test_status"] | AlertSourceTestResponse["result"]) {
  if (result === "SUCCESS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300";
  }
  if (result === "FAILED") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export default function AlertSourcesPage() {
  const { language } = useLanguage();
  const zh = language === "zh";

  const [items, setItems] = useState<AlertSourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AlertSourceStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [actionSourceId, setActionSourceId] = useState<string | null>(null);
  const [ticketKeysInput, setTicketKeysInput] = useState("");
  const [latestTestResponse, setLatestTestResponse] = useState<AlertSourceTestResponse | null>(null);
  const [latestQueryResponse, setLatestQueryResponse] = useState<AlertSourceQueryResponse | null>(null);
  const [form, setForm] = useState<AlertSourceFormState>(defaultFormState());

  async function loadPage() {
    setLoading(true);
    setError("");
    try {
      const response = await listAlertSources();
      setItems(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load alert sources");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.host.toLowerCase().includes(keyword) ||
        item.username.toLowerCase().includes(keyword) ||
        item.database_name.toLowerCase().includes(keyword) ||
        item.table_name.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [items, search, statusFilter]);

  const selectedSource = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const savedForm = useMemo(
    () => (selectedSource ? fromSource(selectedSource) : null),
    [selectedSource],
  );
  const hasUnsavedChanges =
    panelMode === "edit" && savedForm !== null && !formEquals(form, savedForm);

  const queryRows = useMemo(
    () => latestQueryResponse?.items.flatMap((item) => item.rows) ?? [],
    [latestQueryResponse],
  );
  const queryColumns = useMemo(() => {
    const columns = new Set<string>();
    for (const row of queryRows) {
      Object.keys(row).forEach((key) => columns.add(key));
    }
    return Array.from(columns);
  }, [queryRows]);

  function openCreatePanel() {
    setPanelMode("create");
    setSelectedId(null);
    setFieldErrors({});
    setError("");
    setLatestTestResponse(null);
    setLatestQueryResponse(null);
    setTicketKeysInput("");
    setForm(defaultFormState());
  }

  function openEditPanel(item: AlertSourceSummary) {
    setPanelMode("edit");
    setSelectedId(item.id);
    setFieldErrors({});
    setError("");
    setLatestTestResponse(null);
    setLatestQueryResponse(null);
    setTicketKeysInput("");
    setForm(fromSource(item));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const parsedPort = Number.parseInt(form.port, 10);
      if (!Number.isFinite(parsedPort)) {
        setFieldErrors({ port: zh ? "请输入合法端口" : "Enter a valid port" });
        setSaving(false);
        return;
      }

      const payload: AlertSourceCreatePayload = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: parsedPort,
        username: form.username.trim(),
        password: form.password,
        database_name: form.database_name.trim(),
        table_name: form.table_name.trim(),
        ticket_match_field: form.ticket_match_field.trim(),
        status: form.status,
      };

      let saved: AlertSourceSummary;
      if (panelMode === "create") {
        saved = await createAlertSource(payload);
      } else {
        if (!selectedId) {
          throw new Error(zh ? "请选择要编辑的数据源" : "Select a source to edit");
        }
        const updatePayload = {
          name: payload.name,
          host: payload.host,
          port: payload.port,
          username: payload.username,
          database_name: payload.database_name,
          table_name: payload.table_name,
          ticket_match_field: payload.ticket_match_field,
          status: payload.status,
          ...(form.password.trim() ? { password: form.password } : {}),
        };
        saved = await updateAlertSource(selectedId, updatePayload);
      }

      await loadPage();
      openEditPanel(saved);
    } catch (saveError) {
      if (
        saveError instanceof ApiError &&
        saveError.detail &&
        typeof saveError.detail === "object" &&
        "field_errors" in (saveError.detail as Record<string, unknown>)
      ) {
        const detail = saveError.detail as { field_errors?: Record<string, string> };
        setFieldErrors(detail.field_errors ?? {});
      }
      setError(saveError instanceof Error ? saveError.message : "Failed to save alert source");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(item: AlertSourceSummary) {
    setActionSourceId(item.id);
    setError("");
    try {
      const nextStatus: AlertSourceStatus = item.status === "ENABLED" ? "DISABLED" : "ENABLED";
      const updated = await updateAlertSourceStatus(item.id, nextStatus);
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (selectedId === updated.id) {
        setForm((current) => ({ ...current, status: updated.status }));
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update source status");
    } finally {
      setActionSourceId(null);
    }
  }

  async function handleTestConnection() {
    if (!selectedId) {
      return;
    }
    if (hasUnsavedChanges) {
      setError(zh ? "请先保存当前修改，再执行连接测试。" : "Save changes before running connection test.");
      return;
    }
    setTesting(true);
    setError("");
    setLatestTestResponse(null);
    try {
      const response = await testAlertSource(selectedId);
      setLatestTestResponse(response);
      await loadPage();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Failed to test alert source");
    } finally {
      setTesting(false);
    }
  }

  async function handleRunQuery() {
    if (!selectedId) {
      return;
    }
    if (hasUnsavedChanges) {
      setError(zh ? "请先保存当前修改，再执行批量查询。" : "Save changes before running batch query.");
      return;
    }

    const ticketKeys = parseTicketKeys(ticketKeysInput);
    if (ticketKeys.length === 0) {
      setFieldErrors((current) => ({
        ...current,
        ticket_keys: zh ? "请至少输入一个工单匹配值" : "Enter at least one ticket key",
      }));
      return;
    }

    setQuerying(true);
    setError("");
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.ticket_keys;
      return next;
    });
    try {
      const response = await queryAlertSourceByTickets(selectedId, { ticket_keys: ticketKeys });
      setLatestQueryResponse(response);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : "Failed to query alert source");
      setLatestQueryResponse(null);
    } finally {
      setQuerying(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Database className="h-3.5 w-3.5" />
            <span>{zh ? "配置中心 / 告警数据源" : "Configuration / Alert Sources"}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {zh ? "告警数据源配置" : "Alert Source Configurations"}
          </h1>
          <p className="max-w-4xl text-xs text-slate-500 dark:text-slate-400">
            {zh
              ? "配置外部告警库连接，支持管理员在配置中心直接测试连接，并按工单匹配字段批量查询告警表的全字段明细。"
              : "Configure external alert database connections, validate them from the admin console, and batch query full alert rows by ticket match keys."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadPage()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {zh ? "刷新" : "Refresh"}
          </button>
          <button
            onClick={openCreatePanel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {zh ? "新增数据源" : "New Source"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <Table2 className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "数据源列表" : "Source List"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 border-b border-slate-200 px-5 py-4 md:grid-cols-[minmax(0,1fr)_180px] dark:border-slate-700">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {zh ? "搜索" : "Search"}
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={zh ? "名称、主机、库表、账号、ID" : "Name, host, database, table, username, or ID"}
                    className="w-full rounded-lg border border-slate-200 bg-white px-9 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {zh ? "状态" : "Status"}
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | AlertSourceStatus)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                >
                  <option value="all">{zh ? "全部" : "All"}</option>
                  <option value="ENABLED">{zh ? "启用" : "Enabled"}</option>
                  <option value="DISABLED">{zh ? "停用" : "Disabled"}</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">{zh ? "数据源" : "Source"}</th>
                    <th className="px-4 py-3">{zh ? "库表" : "Table"}</th>
                    <th className="px-4 py-3">{zh ? "匹配字段" : "Match Field"}</th>
                    <th className="px-4 py-3">{zh ? "最近测试" : "Latest Test"}</th>
                    <th className="px-4 py-3">{zh ? "状态" : "Status"}</th>
                    <th className="px-4 py-3 text-right">{zh ? "操作" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        {zh ? "正在加载数据源..." : "Loading alert sources..."}
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        {zh ? "暂无符合条件的数据源" : "No alert sources found"}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const selected = selectedId === item.id && panelMode === "edit";
                      return (
                        <tr
                          key={item.id}
                          onClick={() => openEditPanel(item)}
                          className={`cursor-pointer transition-colors ${
                            selected
                              ? "bg-blue-50/70 dark:bg-blue-950/20"
                              : "hover:bg-slate-50 dark:hover:bg-slate-900/40"
                          }`}
                        >
                          <td className="px-5 py-4">
                            <div className="space-y-1">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {item.host}:{item.port} · {item.username}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                            {item.database_name}.{item.table_name}
                          </td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                            {item.ticket_match_field}
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${resultPalette(item.latest_test_status)}`}
                              >
                                {item.latest_test_status ?? (zh ? "未测试" : "Untested")}
                              </span>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {item.latest_test_at ? formatApiDateTime(item.latest_test_at) : "-"}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusPalette(item.status)}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleToggleStatus(item);
                              }}
                              disabled={actionSourceId === item.id}
                              className="inline-flex rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              {actionSourceId === item.id
                                ? zh
                                  ? "处理中..."
                                  : "Working..."
                                : item.status === "ENABLED"
                                  ? zh
                                    ? "停用"
                                    : "Disable"
                                  : zh
                                    ? "启用"
                                    : "Enable"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <Database className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "批量查询结果" : "Batch Query Results"}
              </span>
            </div>

            {latestQueryResponse ? (
              <div className="space-y-4 px-5 py-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{zh ? "匹配字段" : "Match Field"}</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {latestQueryResponse.ticket_match_field}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{zh ? "查询键数" : "Queried Keys"}</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {latestQueryResponse.queried_ticket_keys.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{zh ? "命中键数" : "Matched Keys"}</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {latestQueryResponse.matched_ticket_keys.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{zh ? "返回行数" : "Returned Rows"}</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {latestQueryResponse.total_rows}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-900/60">
                      <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        <th className="px-4 py-3">{zh ? "查询键" : "Ticket Key"}</th>
                        <th className="px-4 py-3">{zh ? "命中行数" : "Rows"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {latestQueryResponse.items.map((item) => (
                        <tr key={item.ticket_key}>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.ticket_key}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.row_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {latestQueryResponse.unmatched_ticket_keys.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {zh ? "未命中键" : "Unmatched Keys"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {latestQueryResponse.unmatched_ticket_keys.map((key) => (
                        <span
                          key={key}
                          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-900/60">
                      <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {queryColumns.map((column) => (
                          <th key={column} className="px-4 py-3">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {queryRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={Math.max(queryColumns.length, 1)}
                            className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                          >
                            {zh ? "当前查询未返回任何行" : "This query returned no rows"}
                          </td>
                        </tr>
                      ) : (
                        queryRows.map((row, index) => (
                          <tr key={`${index}-${renderValue(row[latestQueryResponse.ticket_match_field])}`}>
                            {queryColumns.map((column) => (
                              <td key={column} className="max-w-[260px] px-4 py-3 align-top text-slate-700 dark:text-slate-200">
                                <div className="truncate" title={renderValue(row[column])}>
                                  {renderValue(row[column])}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {zh ? "选择一个已保存的数据源并执行批量查询后，结果会展示在这里。" : "Select a saved source and run a batch query to view results here."}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <div className="space-y-0.5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {panelMode === "create"
                    ? zh
                      ? "新建数据源"
                      : "Create Source"
                    : zh
                      ? "编辑数据源"
                      : "Edit Source"}
                </div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {panelMode === "create" ? (zh ? "新增外部告警库连接" : "New external alert source") : selectedSource?.name}
                </div>
              </div>
              {selectedSource ? (
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusPalette(selectedSource.status)}`}
                >
                  {selectedSource.status}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 px-5 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {zh ? "数据源名称" : "Source name"}
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.name ? <div className="text-xs text-rose-600">{fieldErrors.name}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Host
                  </span>
                  <input
                    value={form.host}
                    onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.host ? <div className="text-xs text-rose-600">{fieldErrors.host}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Port
                  </span>
                  <input
                    value={form.port}
                    onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.port ? <div className="text-xs text-rose-600">{fieldErrors.port}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {zh ? "状态" : "Status"}
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AlertSourceStatus }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  >
                    <option value="ENABLED">{zh ? "启用" : "Enabled"}</option>
                    <option value="DISABLED">{zh ? "停用" : "Disabled"}</option>
                  </select>
                  {fieldErrors.status ? <div className="text-xs text-rose-600">{fieldErrors.status}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {zh ? "用户名" : "Username"}
                  </span>
                  <input
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.username ? <div className="text-xs text-rose-600">{fieldErrors.username}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {panelMode === "create" ? (zh ? "密码" : "Password") : zh ? "密码（留空则不更新）" : "Password (leave blank to keep current)"}
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.password ? <div className="text-xs text-rose-600">{fieldErrors.password}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {zh ? "数据库名" : "Database"}
                  </span>
                  <input
                    value={form.database_name}
                    onChange={(event) => setForm((current) => ({ ...current, database_name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.database_name ? <div className="text-xs text-rose-600">{fieldErrors.database_name}</div> : null}
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {zh ? "表名" : "Table"}
                  </span>
                  <input
                    value={form.table_name}
                    onChange={(event) => setForm((current) => ({ ...current, table_name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  />
                  {fieldErrors.table_name ? <div className="text-xs text-rose-600">{fieldErrors.table_name}</div> : null}
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {zh ? "工单匹配字段" : "Ticket match field"}
                </span>
                <input
                  value={form.ticket_match_field}
                  onChange={(event) => setForm((current) => ({ ...current, ticket_match_field: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                />
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {zh
                    ? "用于执行批量查询的匹配列，例如 alert_id。"
                    : "Column used to match incoming ticket keys, for example alert_id."}
                </div>
                {fieldErrors.ticket_match_field ? (
                  <div className="text-xs text-rose-600">{fieldErrors.ticket_match_field}</div>
                ) : null}
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? (zh ? "保存中..." : "Saving...") : zh ? "保存配置" : "Save source"}
                </button>
                {panelMode === "edit" ? (
                  <button
                    onClick={() => void handleTestConnection()}
                    disabled={testing || !selectedId}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    {testing ? (zh ? "测试中..." : "Testing...") : zh ? "测试连接" : "Test connection"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <PlayCircle className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {zh ? "连接测试与批量查询" : "Connection Test & Batch Query"}
              </span>
            </div>

            <div className="space-y-4 px-5 py-4">
              {latestTestResponse ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${resultPalette(latestTestResponse.result)}`}
                    >
                      {latestTestResponse.result}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatApiDateTime(latestTestResponse.tested_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    {latestTestResponse.error_summary ?? latestTestResponse.message}
                  </div>
                  {latestTestResponse.sample_columns.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestTestResponse.sample_columns.map((column) => (
                        <span
                          key={column}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {column}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {zh
                    ? "保存并选择一个数据源后，可以在这里执行连接测试。"
                    : "Save and select a source to run a connection test here."}
                </div>
              )}

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {zh ? "批量工单匹配值" : "Batch ticket keys"}
                </span>
                <textarea
                  value={ticketKeysInput}
                  onChange={(event) => setTicketKeysInput(event.target.value)}
                  rows={6}
                  placeholder={
                    zh
                      ? "每行一个工单匹配值，或使用逗号分隔，例如：\nALERT-001\nALERT-002"
                      : "One key per line, or separate with commas, for example:\nALERT-001\nALERT-002"
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                />
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {zh
                    ? "系统会使用上方配置的匹配字段查询，并返回命中记录的全部列值。"
                    : "The system queries by the configured match field and returns every column from matched rows."}
                </div>
                {fieldErrors.ticket_keys ? <div className="text-xs text-rose-600">{fieldErrors.ticket_keys}</div> : null}
              </label>

              <button
                onClick={() => void handleRunQuery()}
                disabled={querying || !selectedId}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Database className="h-3.5 w-3.5" />
                {querying ? (zh ? "查询中..." : "Querying...") : zh ? "执行批量查询" : "Run batch query"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
