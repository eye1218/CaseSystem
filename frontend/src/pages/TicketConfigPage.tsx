import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import {
  createConfig,
  deleteConfig,
  listConfigs,
  type SystemConfig,
  updateConfig,
} from "../api/config";
import { useLanguage } from "../contexts/LanguageContext";
import {
  extractTimeoutReminderConfig,
  getDefaultTimeoutReminderConfig,
  TICKET_TIMEOUT_REMINDER_CATEGORY,
  TICKET_TIMEOUT_REMINDER_KEY,
} from "../features/tickets/timeoutReminderConfig";

type TabType = "categories" | "priorities" | "timeoutReminders";
const PRIORITY_CONFIG_CATEGORY = "ticket.sla_policy";

interface CategoryValue {
  zh: string;
  en: string;
}

interface PriorityValue {
  response_minutes: number;
  resolution_minutes: number;
}

interface EditModalState {
  mode: "create" | "edit";
  key: string;
  value: CategoryValue | PriorityValue;
  description: string;
}

interface TimeoutReminderFormState {
  responseReminderMinutes: string;
  resolutionReminderMinutes: string;
}

function parsePositiveMinutes(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isPriorityValue(value: unknown): value is PriorityValue {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.response_minutes === "number" && typeof record.resolution_minutes === "number";
}

export default function TicketConfigPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [activeTab, setActiveTab] = useState<TabType>("categories");
  const [categories, setCategories] = useState<SystemConfig[]>([]);
  const [priorities, setPriorities] = useState<SystemConfig[]>([]);
  const [timeoutReminderForm, setTimeoutReminderForm] = useState<TimeoutReminderFormState>(() => {
    const defaults = getDefaultTimeoutReminderConfig();
    return {
      responseReminderMinutes: String(defaults.responseReminderMinutes),
      resolutionReminderMinutes: String(defaults.resolutionReminderMinutes),
    };
  });
  const [timeoutSaving, setTimeoutSaving] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalState, setModalState] = useState<EditModalState | null>(null);

  const currentConfigs = activeTab === "categories" ? categories : priorities;

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catResult, priResult, reminderResult] = await Promise.all([
        listConfigs("ticket.category"),
        listConfigs(PRIORITY_CONFIG_CATEGORY),
        listConfigs(TICKET_TIMEOUT_REMINDER_CATEGORY),
      ]);
      setCategories(catResult.items);
      setPriorities(priResult.items);
      const reminderConfig = extractTimeoutReminderConfig(reminderResult.items);
      setTimeoutReminderForm({
        responseReminderMinutes: String(reminderConfig.responseReminderMinutes),
        resolutionReminderMinutes: String(reminderConfig.resolutionReminderMinutes),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load configs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleDelete = async (key: string) => {
    if (!confirm(zh ? `确定要删除 ${key} 吗？` : `Delete ${key}?`)) return;
    try {
      await deleteConfig(activeTab === "categories" ? "ticket.category" : PRIORITY_CONFIG_CATEGORY, key);
      await fetchConfigs();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const openCreateModal = () => {
    setModalState({
      mode: "create",
      key: "",
      value: activeTab === "categories" ? { zh: "", en: "" } : { response_minutes: 60, resolution_minutes: 240 },
      description: "",
    });
    setShowModal(true);
  };

  const openEditModal = (config: SystemConfig) => {
    setModalState({
      mode: "edit",
      key: config.key,
      value: config.value as unknown as CategoryValue | PriorityValue,
      description: config.description || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!modalState) return;
    const category = activeTab === "categories" ? "ticket.category" : PRIORITY_CONFIG_CATEGORY;

    try {
      if (modalState.mode === "create") {
        await createConfig(category, modalState.key, modalState.value as unknown as Record<string, unknown>, modalState.description);
      } else {
        await updateConfig(category, modalState.key, modalState.value as unknown as Record<string, unknown>, modalState.description);
      }
      setShowModal(false);
      setModalState(null);
      await fetchConfigs();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Save failed");
    }
  };

  const handleSaveTimeoutReminder = async () => {
    const responseReminderMinutes = parsePositiveMinutes(timeoutReminderForm.responseReminderMinutes);
    const resolutionReminderMinutes = parsePositiveMinutes(timeoutReminderForm.resolutionReminderMinutes);
    if (responseReminderMinutes === null || resolutionReminderMinutes === null) {
      setError(zh ? "提醒时间必须为正整数分钟。" : "Reminder time must be positive integer minutes.");
      setTimeoutMessage(null);
      return;
    }

    setTimeoutSaving(true);
    setError(null);
    setTimeoutMessage(null);
    try {
      try {
        await updateConfig(
          TICKET_TIMEOUT_REMINDER_CATEGORY,
          TICKET_TIMEOUT_REMINDER_KEY,
          {
            response_reminder_minutes: responseReminderMinutes,
            resolution_reminder_minutes: resolutionReminderMinutes,
          },
          zh ? "工单超时前提醒时间（分钟）" : "Ticket timeout reminder minutes",
        );
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) {
          throw e;
        }
        await createConfig(
          TICKET_TIMEOUT_REMINDER_CATEGORY,
          TICKET_TIMEOUT_REMINDER_KEY,
          {
            response_reminder_minutes: responseReminderMinutes,
            resolution_reminder_minutes: resolutionReminderMinutes,
          },
          zh ? "工单超时前提醒时间（分钟）" : "Ticket timeout reminder minutes",
        );
      }
      setTimeoutMessage(zh ? "超时提醒配置已保存。" : "Timeout reminder settings saved.");
      await fetchConfigs();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save timeout reminder config");
      setTimeoutMessage(null);
    } finally {
      setTimeoutSaving(false);
    }
  };

  const renderValueFields = () => {
    if (!modalState) return null;

    if (activeTab === "categories") {
      const val = modalState.value as CategoryValue;
      return (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {zh ? "中文名称" : "Chinese Name"}
            </label>
            <input
              type="text"
              value={val.zh}
              onChange={(e) => setModalState({ ...modalState, value: { ...val, zh: e.target.value } })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {zh ? "英文名称" : "English Name"}
            </label>
            <input
              type="text"
              value={val.en}
              onChange={(e) => setModalState({ ...modalState, value: { ...val, en: e.target.value } })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
        </>
      );
    }
    if (activeTab === "priorities") {
      const val = modalState.value as PriorityValue;
      return (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {zh ? "响应时间（分钟）" : "Response Minutes"}
            </label>
            <input
              type="number"
              min={1}
              value={val.response_minutes}
              onChange={(e) =>
                setModalState({
                  ...modalState,
                  value: { ...val, response_minutes: parseInt(e.target.value, 10) || 0 },
                })
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {zh ? "处置时间（分钟）" : "Resolution Minutes"}
            </label>
            <input
              type="number"
              min={1}
              value={val.resolution_minutes}
              onChange={(e) =>
                setModalState({
                  ...modalState,
                  value: { ...val, resolution_minutes: parseInt(e.target.value, 10) || 0 },
                })
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <span>{zh ? "配置中心" : "Configuration"}</span>
          <span>/</span>
          <span>{zh ? "工单配置" : "Ticket Config"}</span>
        </div>
        <h1 className="text-slate-900 dark:text-white">{zh ? "工单配置" : "Ticket Configuration"}</h1>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => setActiveTab("categories")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "categories"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {zh ? "分类配置" : "Categories"}
          </button>
          <button
            onClick={() => setActiveTab("priorities")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "priorities"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {zh ? "优先级配置" : "Priorities"}
          </button>
          <button
            onClick={() => setActiveTab("timeoutReminders")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "timeoutReminders"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {zh ? "超时提醒配置" : "Timeout Reminder"}
          </button>
        </nav>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">{zh ? "加载中..." : "Loading..."}</div>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      ) : activeTab === "timeoutReminders" ? (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          {timeoutMessage ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
              {timeoutMessage}
            </div>
          ) : null}
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {zh
              ? "配置响应与处置超时前的弹窗提醒时间，单位为分钟。"
              : "Configure popup reminder minutes before response/resolution timeout."}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {zh ? "响应超时前提醒（分钟）" : "Response Reminder (minutes)"}
              </label>
              <input
                type="number"
                min={1}
                value={timeoutReminderForm.responseReminderMinutes}
                onChange={(event) => {
                  setTimeoutReminderForm((current) => ({
                    ...current,
                    responseReminderMinutes: event.target.value,
                  }));
                  setTimeoutMessage(null);
                }}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {zh ? "处置超时前提醒（分钟）" : "Resolution Reminder (minutes)"}
              </label>
              <input
                type="number"
                min={1}
                value={timeoutReminderForm.resolutionReminderMinutes}
                onChange={(event) => {
                  setTimeoutReminderForm((current) => ({
                    ...current,
                    resolutionReminderMinutes: event.target.value,
                  }));
                  setTimeoutMessage(null);
                }}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => void handleSaveTimeoutReminder()}
              disabled={timeoutSaving}
              className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {timeoutSaving
                ? (zh ? "保存中..." : "Saving...")
                : (zh ? "保存提醒配置" : "Save Reminder Settings")}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {activeTab === "categories"
                ? zh ? "工单分类列表" : "Ticket Categories"
                : zh ? "工单优先级列表" : "Ticket Priorities"}
            </h2>
            <button
              onClick={openCreateModal}
              className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
            >
              {zh ? "新增" : "Add"}
            </button>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-2 font-medium">{zh ? "键" : "Key"}</th>
                <th className="px-4 py-2 font-medium">{zh ? "值" : "Value"}</th>
                <th className="px-4 py-2 font-medium">{zh ? "描述" : "Description"}</th>
                <th className="px-4 py-2 font-medium">{zh ? "操作" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {currentConfigs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                    {zh ? "暂无数据" : "No data"}
                  </td>
                </tr>
              ) : (
                currentConfigs.map((config) => (
                  <tr key={config.key} className="text-sm">
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{config.key}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {activeTab === "categories" ? (
                        <>
                          {(config.value as unknown as CategoryValue).zh}
                          {(config.value as unknown as CategoryValue).en && (
                            <span className="ml-2 text-slate-400">/ {(config.value as unknown as CategoryValue).en}</span>
                          )}
                        </>
                      ) : isPriorityValue(config.value) ? (
                        <span>{config.value.response_minutes}m / {config.value.resolution_minutes}m</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{config.description || "-"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEditModal(config)}
                        className="mr-2 text-blue-500 hover:text-blue-600"
                      >
                        {zh ? "编辑" : "Edit"}
                      </button>
                      <button
                        onClick={() => handleDelete(config.key)}
                        className="text-red-500 hover:text-red-600"
                      >
                        {zh ? "删除" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
            <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-white">
              {modalState.mode === "create"
                ? zh ? "新增配置" : "Add Config"
                : zh ? "编辑配置" : "Edit Config"}
            </h3>

            <div className="space-y-4">
              {modalState.mode === "create" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {zh ? "键 (Key)" : "Key"}
                  </label>
                  <input
                    type="text"
                    value={modalState.key}
                    onChange={(e) => setModalState({ ...modalState, key: e.target.value })}
                    placeholder={activeTab === "categories" ? "e.g. intrusion" : "e.g. P1/VIP"}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  />
                </div>
              )}
              {renderValueFields()}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  {zh ? "描述" : "Description"}
                </label>
                <input
                  type="text"
                  value={modalState.description}
                  onChange={(e) => setModalState({ ...modalState, description: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalState(null);
                }}
                className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                {zh ? "取消" : "Cancel"}
              </button>
              <button
                onClick={handleSave}
                className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                {zh ? "保存" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
