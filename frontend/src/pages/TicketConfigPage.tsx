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

type TabType = "categories" | "priorities";

interface CategoryValue {
  zh: string;
  en: string;
}

interface PriorityValue {
  zh: string;
  en: string;
  rank: number;
}

interface EditModalState {
  mode: "create" | "edit";
  key: string;
  value: CategoryValue | PriorityValue;
  description: string;
}

export default function TicketConfigPage() {
  const { language, t } = useLanguage();
  const zh = language === "zh";
  const [activeTab, setActiveTab] = useState<TabType>("categories");
  const [categories, setCategories] = useState<SystemConfig[]>([]);
  const [priorities, setPriorities] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalState, setModalState] = useState<EditModalState | null>(null);

  const currentConfigs = activeTab === "categories" ? categories : priorities;
  const setConfigs = activeTab === "categories" ? setCategories : setPriorities;

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catResult, priResult] = await Promise.all([
        listConfigs("ticket.category"),
        listConfigs("ticket.priority"),
      ]);
      setCategories(catResult.items);
      setPriorities(priResult.items);
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
      await deleteConfig(activeTab === "categories" ? "ticket.category" : "ticket.priority", key);
      await fetchConfigs();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const openCreateModal = () => {
    setModalState({
      mode: "create",
      key: "",
      value: activeTab === "categories" ? { zh: "", en: "" } : { zh: "", en: "", rank: 0 },
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
    const category = activeTab === "categories" ? "ticket.category" : "ticket.priority";

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
    } else {
      const val = modalState.value as PriorityValue;
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {zh ? "优先级顺序" : "Rank"}
            </label>
            <input
              type="number"
              value={val.rank}
              onChange={(e) => setModalState({ ...modalState, value: { ...val, rank: parseInt(e.target.value) || 0 } })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
        </>
      );
    }
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
        </nav>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">{zh ? "加载中..." : "Loading..."}</div>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
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
                      {(config.value as unknown as CategoryValue).zh || (config.value as unknown as PriorityValue).zh}
                      {(config.value as unknown as CategoryValue).en && (
                        <span className="ml-2 text-slate-400">/ {(config.value as unknown as CategoryValue).en}</span>
                      )}
                      {(config.value as unknown as PriorityValue).rank !== undefined && (
                        <span className="ml-2 text-slate-400">#{(config.value as unknown as PriorityValue).rank}</span>
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
                    placeholder={activeTab === "categories" ? "e.g. intrusion" : "e.g. P1"}
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
