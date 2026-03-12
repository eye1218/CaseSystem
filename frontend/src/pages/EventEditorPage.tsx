import {
  ChevronDown,
  Info,
  Plus,
  Radio,
  Save,
  Tag,
  Timer,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { startTransition, useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  createEventRule,
  getEventRule,
  listEventTaskTemplates,
  updateEventRule,
} from "../api/events";
import {
  categoryOptions,
  eventFilterFieldOptions,
  eventStatusOptions,
  eventTimeUnitOptions,
  eventTriggerPointOptions,
  eventTypeOptions,
} from "../constants/eventRules";
import {
  EventPreviewCard,
  EventSectionCard,
  EventStatsCard,
  EventStatusBadge,
  EventTaskGroupBadge,
  EventTimingHint,
  EventTypeBadge,
} from "../components/EventRuleUi";
import { useLanguage } from "../contexts/LanguageContext";
import type {
  EventFilterField,
  EventRuleDetail,
  EventRuleFilter,
  EventRulePayload,
  EventRuleStatus,
  EventRuleTimeRule,
  EventRuleType,
  EventTaskTemplate,
  EventTriggerPoint,
} from "../types/event";
import { createClientId } from "../utils/clientId";

interface EditableFilter extends EventRuleFilter {
  clientId: string;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

function toLocalDateTime(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultTimeRule(eventType: EventRuleType): EventRuleTimeRule {
  if (eventType === "normal") {
    return { mode: "immediate", delay_amount: 5, delay_unit: "minutes" };
  }
  return {
    mode: "timer",
    target_offset_amount: 30,
    target_offset_unit: "minutes",
    adjustment_direction: "before",
    adjustment_amount: 5,
    adjustment_unit: "minutes",
  };
}

function defaultFilter(field: EventFilterField): EditableFilter {
  if (field === "priority") {
    return {
      clientId: createClientId("filter"),
      field,
      operator: "in",
      values: ["P1"],
    };
  }
  if (field === "category") {
    return {
      clientId: createClientId("filter"),
      field,
      operator: "in",
      values: ["intrusion"],
    };
  }
  if (field === "risk_score") {
    return {
      clientId: createClientId("filter"),
      field,
      operator: "between",
      min_value: 80,
      max_value: 100,
    };
  }
  return {
    clientId: createClientId("filter"),
    field,
    operator: "between",
    start_at: "",
    end_at: "",
  };
}

function TagInput({
  tags,
  onChange,
  language,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  language: "zh" | "en";
}) {
  const [value, setValue] = useState("");

  function addTag() {
    const normalized = value.trim();
    if (!normalized) return;
    if (!tags.includes(normalized)) {
      onChange([...tags, normalized]);
    }
    setValue("");
  }

  return (
    <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
        >
          {tag}
          <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))}>
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTag();
          }
        }}
        placeholder={tags.length === 0 ? (language === "zh" ? "输入标签并回车确认…" : "Add tag and press Enter…") : ""}
        className="min-w-[120px] flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
      />
    </div>
  );
}

function EnumChipGroup({
  options,
  values,
  onChange,
  language,
}: {
  options: Array<{ value: string; zh: string; en: string }>;
  values: string[];
  onChange: (next: string[]) => void;
  language: "zh" | "en";
}) {
  function toggle(value: string) {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-all ${
              active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700"
            }`}
          >
            {option[language]}
          </button>
        );
      })}
    </div>
  );
}

function TaskTemplateModal({
  items,
  selectedIds,
  onSelect,
  onClose,
  language,
}: {
  items: EventTaskTemplate[];
  selectedIds: string[];
  onSelect: (taskTemplate: EventTaskTemplate) => void;
  onClose: () => void;
  language: "zh" | "en";
}) {
  const available = items.filter((item) => !selectedIds.includes(item.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[70vh] w-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-sm text-slate-800 dark:text-slate-100">
              {language === "zh" ? "选择任务模板" : "Select Task Template"}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {language === "zh"
                ? "命中规则后会异步并行下发所有已绑定任务模板"
                : "All selected task templates are dispatched asynchronously in parallel."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {available.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
              {language === "zh" ? "所有任务模板都已经绑定" : "All task templates are already selected"}
            </div>
          ) : (
            available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-left transition-all hover:border-blue-400 hover:bg-blue-50/60 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-800 dark:text-slate-100">{item.name}</span>
                    <EventTaskGroupBadge task={item} language={language} />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
                <Plus className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300 transition-colors group-hover:text-blue-500 dark:text-slate-600" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function EventEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language === "zh";
  const isEditing = Boolean(id);
  const codeInputId = useId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showTaskModal, setShowTaskModal] = useState(false);

  const [taskTemplates, setTaskTemplates] = useState<EventTaskTemplate[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [eventType, setEventType] = useState<EventRuleType>("normal");
  const [status, setStatus] = useState<EventRuleStatus>("draft");
  const [triggerPoint, setTriggerPoint] = useState<EventTriggerPoint>("ticket.created");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [filters, setFilters] = useState<EditableFilter[]>([]);
  const [timeRule, setTimeRule] = useState<EventRuleTimeRule>(defaultTimeRule("normal"));
  const [taskTemplateIds, setTaskTemplateIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [templatesResponse, detailResponse] = await Promise.all([
          listEventTaskTemplates(),
          isEditing && id ? getEventRule(id) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        startTransition(() => {
          setTaskTemplates(templatesResponse.items);
          if (detailResponse) {
            applyDetail(detailResponse);
          }
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load editor data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isEditing]);

  function applyDetail(detail: EventRuleDetail) {
    setName(detail.name);
    setCode(detail.code);
    setEventType(detail.event_type);
    setStatus(detail.status);
    setTriggerPoint(detail.trigger_point);
    setDescription(detail.description ?? "");
    setTags(detail.tags);
    setFilters(
      detail.filters.map((filter) => ({
        ...filter,
        clientId: createClientId("filter"),
        start_at: filter.field === "created_at" ? toLocalDateTime(filter.start_at) : filter.start_at,
        end_at: filter.field === "created_at" ? toLocalDateTime(filter.end_at) : filter.end_at,
      })),
    );
    setTimeRule(detail.time_rule);
    setTaskTemplateIds(detail.bound_tasks.map((task) => task.id));
  }

  const selectedTasks = taskTemplateIds
    .map((taskId) => taskTemplates.find((item) => item.id === taskId))
    .filter((item): item is EventTaskTemplate => Boolean(item));

  const previewDetail: EventRuleDetail = {
    id: id ?? "preview",
    name: name || (zh ? "未命名 Event" : "Untitled Event"),
    code: code || "evt_preview",
    event_type: eventType,
    status,
    trigger_point: triggerPoint,
    object_type: "ticket",
    description: description || null,
    tags,
    filters: filters,
    time_rule: timeRule,
    bound_tasks: selectedTasks,
    filter_summary: "",
    trigger_summary: "",
    created_at: new Date().toISOString(),
    created_by: "Admin",
    updated_at: new Date().toISOString(),
    updated_by: "Admin",
  };

  function updateFilter(clientId: string, next: Partial<EditableFilter>) {
    setFilters((current) =>
      current.map((item) => (item.clientId === clientId ? { ...item, ...next } : item)),
    );
  }

  function changeFilterField(clientId: string, field: EventFilterField) {
    setFilters((current) =>
      current.map((item) => (item.clientId === clientId ? defaultFilter(field) : item)),
    );
  }

  function removeFilter(clientId: string) {
    setFilters((current) => current.filter((item) => item.clientId !== clientId));
  }

  function addFilter(field: EventFilterField) {
    setFilters((current) => [...current, defaultFilter(field)]);
  }

  function addTaskTemplate(taskTemplate: EventTaskTemplate) {
    setTaskTemplateIds((current) => [...current, taskTemplate.id]);
  }

  function removeTaskTemplate(taskId: string) {
    setTaskTemplateIds((current) => current.filter((item) => item !== taskId));
  }

  function buildPayload(nextStatus?: EventRuleStatus): EventRulePayload {
    return {
      name,
      code: code.trim() || undefined,
      event_type: eventType,
      status: nextStatus ?? status,
      trigger_point: triggerPoint,
      description: description.trim() || undefined,
      tags,
      filters: filters.map((filter) => {
        if (filter.field === "priority" || filter.field === "category") {
          return {
            field: filter.field,
            operator: "in",
            values: filter.values ?? [],
          };
        }
        if (filter.field === "risk_score") {
          return {
            field: "risk_score",
            operator: "between",
            min_value: filter.min_value,
            max_value: filter.max_value,
          };
        }
        return {
          field: "created_at",
          operator: "between",
          start_at: filter.start_at ? new Date(filter.start_at).toISOString() : undefined,
          end_at: filter.end_at ? new Date(filter.end_at).toISOString() : undefined,
        };
      }),
      time_rule:
        eventType === "normal"
          ? {
              mode: timeRule.mode === "delayed" ? "delayed" : "immediate",
              delay_amount: timeRule.delay_amount,
              delay_unit: timeRule.delay_unit,
            }
          : {
              mode: "timer",
              target_offset_amount: timeRule.target_offset_amount,
              target_offset_unit: timeRule.target_offset_unit,
              adjustment_direction: timeRule.adjustment_direction,
              adjustment_amount: timeRule.adjustment_amount,
              adjustment_unit: timeRule.adjustment_unit,
            },
      task_template_ids: taskTemplateIds,
    };
  }

  async function handleSave(enableAfterSave = false) {
    setSaving(true);
    setError("");
    setFieldErrors({});

    try {
      const payload = buildPayload(enableAfterSave ? "enabled" : status);
      const detail = isEditing && id ? await updateEventRule(id, payload) : await createEventRule(payload);
      navigate(`/events/${detail.id}`, { replace: true });
    } catch (saveError) {
      if (
        saveError instanceof ApiError &&
        saveError.detail &&
        typeof saveError.detail === "object" &&
        "field_errors" in (saveError.detail as Record<string, unknown>)
      ) {
        const detail = saveError.detail as { field_errors?: Record<string, string> };
        setFieldErrors(detail.field_errors ?? {});
        setError(saveError.message);
      } else {
        setError(saveError instanceof Error ? saveError.message : "Failed to save event");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 p-6">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {zh ? "正在加载 Event 编辑器…" : "Loading event editor..."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Radio className="h-3.5 w-3.5" />
            <Link to="/events" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
              {zh ? "Event 中心" : "Event Center"}
            </Link>
            <span>/</span>
            <span className="text-slate-600 dark:text-slate-300">
              {isEditing ? (zh ? "编辑 Event" : "Edit Event") : zh ? "新建 Event" : "New Event"}
            </span>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <EventSectionCard
                title={zh ? "A · 基础信息" : "A · Basic Information"}
                subtitle={zh ? "定义规则名称、类型、触发点和标签" : "Define rule name, type, trigger point, and tags"}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "Event 名称" : "Event Name"} <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={`${inputClass} ${fieldErrors.name ? "border-red-400 dark:border-red-600" : ""}`}
                      placeholder={zh ? "例如：P1 工单创建立即通知" : "Example: P1 Ticket Created Notify"}
                    />
                    {fieldErrors.name ? <p className="text-[11px] text-red-500">{fieldErrors.name}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={codeInputId} className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "Event 编码（可选）" : "Event Code (optional)"}
                    </label>
                    <input
                      id={codeInputId}
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                      }
                      className={`${inputClass} font-mono`}
                      placeholder="evt_p1_ticket_created"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "Event 类型" : "Event Type"} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-700/50">
                      {eventTypeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setEventType(option.value);
                            setTimeRule(defaultTimeRule(option.value));
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs transition-all ${
                            eventType === option.value
                              ? "border border-slate-200 bg-white text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          {option.value === "normal" ? <Zap className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
                          {option[language]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "规则状态" : "Rule Status"} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
                      {eventStatusOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setStatus(option.value)}
                          className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-all ${
                            status === option.value
                              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          {option[language]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "触发点" : "Trigger Point"} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={triggerPoint}
                        onChange={(event) => setTriggerPoint(event.target.value as EventTriggerPoint)}
                        className={`${inputClass} appearance-none pr-8`}
                      >
                        {eventTriggerPointOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option[language]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    </div>
                    {fieldErrors.trigger_point ? (
                      <p className="text-[11px] text-red-500">{fieldErrors.trigger_point}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "标签 Tags" : "Tags"}
                    </label>
                    <TagInput tags={tags} onChange={setTags} language={language} />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300">
                      {zh ? "说明（可选）" : "Description (optional)"}
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      className={`${inputClass} resize-none`}
                      placeholder={
                        zh
                          ? "描述该 Event 的业务目的、作用对象与触发背景…"
                          : "Describe the event purpose, target, and trigger context…"
                      }
                    />
                  </div>
                </div>
              </EventSectionCard>

              <EventSectionCard
                title={zh ? "B · 触发对象与过滤条件" : "B · Object & Filter Conditions"}
                subtitle={zh ? "当前版本仅支持工单，创建时间仅允许绝对时间范围" : "Ticket only in this version. Created time only supports absolute ranges."}
              >
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200/50 bg-blue-50/60 px-3 py-2.5 text-[11px] text-blue-700 dark:border-blue-800/30 dark:bg-blue-900/10 dark:text-blue-300">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {zh
                      ? "同一字段多值按 OR 处理，不同字段之间按 AND 处理；不支持嵌套条件组、不支持 NOT、不支持相对时间过滤。"
                      : "Multiple values within one field are OR, different fields are AND. Nested groups, NOT conditions, and relative time filters are not supported."}
                  </span>
                </div>

                <div className="mb-3 space-y-2">
                  {filters.map((filter, index) => (
                    <div key={filter.clientId} className="space-y-1.5">
                      <div className="grid grid-cols-1 items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40 lg:grid-cols-[140px_1fr_32px]">
                        <div className="relative">
                          <select
                            value={filter.field}
                            onChange={(event) => changeFilterField(filter.clientId, event.target.value as EventFilterField)}
                            className={`${inputClass} h-8 appearance-none py-0 pr-8`}
                          >
                            {eventFilterFieldOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option[language]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                        </div>

                        <div className="space-y-2">
                          {filter.field === "priority" ? (
                            <EnumChipGroup
                              options={[
                                { value: "P1", zh: "P1 严重", en: "P1 Critical" },
                                { value: "P2", zh: "P2 高", en: "P2 High" },
                                { value: "P3", zh: "P3 中", en: "P3 Medium" },
                                { value: "P4", zh: "P4 低", en: "P4 Low" },
                              ]}
                              values={filter.values ?? []}
                              onChange={(values) => updateFilter(filter.clientId, { values })}
                              language={language}
                            />
                          ) : null}
                          {filter.field === "category" ? (
                            <EnumChipGroup
                              options={categoryOptions}
                              values={filter.values ?? []}
                              onChange={(values) => updateFilter(filter.clientId, { values })}
                              language={language}
                            />
                          ) : null}
                          {filter.field === "risk_score" ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={filter.min_value ?? ""}
                                onChange={(event) => updateFilter(filter.clientId, { min_value: Number(event.target.value) })}
                                className={`${inputClass} w-24`}
                              />
                              <span className="text-xs text-slate-400">~</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={filter.max_value ?? ""}
                                onChange={(event) => updateFilter(filter.clientId, { max_value: Number(event.target.value) })}
                                className={`${inputClass} w-24`}
                              />
                            </div>
                          ) : null}
                          {filter.field === "created_at" ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <input
                                type="datetime-local"
                                value={filter.start_at ?? ""}
                                onChange={(event) => updateFilter(filter.clientId, { start_at: event.target.value })}
                                className={inputClass}
                              />
                              <input
                                type="datetime-local"
                                value={filter.end_at ?? ""}
                                onChange={(event) => updateFilter(filter.clientId, { end_at: event.target.value })}
                                className={inputClass}
                              />
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFilter(filter.clientId)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {index < filters.length - 1 ? (
                        <div className="flex items-center gap-2 px-3">
                          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                          <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                            AND
                          </span>
                          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {fieldErrors["filters[0].operator"] ? (
                  <p className="mb-3 text-[11px] text-red-500">{fieldErrors["filters[0].operator"]}</p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {eventFilterFieldOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => addFilter(option.value)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
                    >
                      <Plus className="h-3 w-3" />
                      {zh ? `添加${option.zh}` : `Add ${option.en}`}
                    </button>
                  ))}
                </div>
              </EventSectionCard>

              <EventSectionCard
                title={zh ? "C · 触发时间规则" : "C · Trigger Timing"}
                subtitle={
                  zh
                    ? eventType === "normal"
                      ? "普通 Event 支持立即触发或延迟触发"
                      : "计时 Event 统一基于工单创建时间计算时刻 A"
                    : eventType === "normal"
                      ? "Normal Events support immediate or delayed dispatching"
                      : "Timer Events are always computed from ticket created time"
                }
              >
                {eventType === "normal" ? (
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      {[
                        {
                          value: "immediate",
                          label: zh ? "满足条件后立即触发" : "Trigger immediately",
                          hint: zh
                            ? "工单触发点命中后不等待，立即下发任务模板"
                            : "Dispatch task templates immediately once the trigger point matches.",
                        },
                        {
                          value: "delayed",
                          label: zh ? "满足条件后延迟触发" : "Trigger with delay",
                          hint: zh
                            ? "在工单事件发生后等待指定时长，再异步下发任务模板"
                            : "Wait for the configured duration after the ticket event, then dispatch templates.",
                        },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                            timeRule.mode === option.value
                              ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40"
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              timeRule.mode === option.value
                                ? "border-blue-500 bg-blue-500"
                                : "border-slate-300 dark:border-slate-600"
                            }`}
                          >
                            {timeRule.mode === option.value ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </div>
                          <input
                            type="radio"
                            className="sr-only"
                            checked={timeRule.mode === option.value}
                            onChange={() =>
                              setTimeRule((current) => ({
                                ...current,
                                mode: option.value as "immediate" | "delayed",
                              }))
                            }
                          />
                          <div>
                            <p className="text-xs text-slate-800 dark:text-slate-100">{option.label}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{option.hint}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {timeRule.mode === "delayed" ? (
                      <div className="flex flex-wrap items-center gap-3 pl-4">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{zh ? "延迟时长：" : "Delay:"}</span>
                        <input
                          type="number"
                          min={1}
                          value={timeRule.delay_amount ?? 5}
                          onChange={(event) =>
                            setTimeRule((current) => ({
                              ...current,
                              mode: "delayed",
                              delay_amount: Number(event.target.value),
                            }))
                          }
                          className={`${inputClass} w-24`}
                        />
                        <div className="relative">
                          <select
                            value={timeRule.delay_unit ?? "minutes"}
                            onChange={(event) =>
                              setTimeRule((current) => ({
                                ...current,
                                mode: "delayed",
                                delay_unit: event.target.value as EventRuleTimeRule["delay_unit"],
                              }))
                            }
                            className={`${inputClass} appearance-none pr-8`}
                          >
                            {eventTimeUnitOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option[language]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-lg border border-violet-200/50 bg-violet-50/60 px-3 py-2.5 text-[11px] text-violet-700 dark:border-violet-800/30 dark:bg-violet-900/10 dark:text-violet-300">
                      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {zh
                          ? "计时 Event 统一按“工单创建时间 + 目标偏移 = 时刻 A，再按提前 / 延后做最终偏移”计算。"
                          : "Timer Events are calculated as “ticket created time + target offset = moment A”, then adjusted before/after for final dispatch time."}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-600 dark:text-slate-300">
                          {zh ? "目标偏移时长" : "Target Offset"}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={timeRule.target_offset_amount ?? 30}
                          onChange={(event) =>
                            setTimeRule((current) => ({
                              ...current,
                              mode: "timer",
                              target_offset_amount: Number(event.target.value),
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-600 dark:text-slate-300">
                          {zh ? "目标偏移单位" : "Target Unit"}
                        </label>
                        <div className="relative">
                          <select
                            value={timeRule.target_offset_unit ?? "minutes"}
                            onChange={(event) =>
                              setTimeRule((current) => ({
                                ...current,
                                mode: "timer",
                                target_offset_unit: event.target.value as EventRuleTimeRule["target_offset_unit"],
                                adjustment_unit: current.adjustment_unit ?? (event.target.value as EventRuleTimeRule["target_offset_unit"]),
                              }))
                            }
                            className={`${inputClass} appearance-none pr-8`}
                          >
                            {eventTimeUnitOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option[language]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-600 dark:text-slate-300">
                          {zh ? "调整方向" : "Adjustment Direction"}
                        </label>
                        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-700/50">
                          {[
                            { value: "before", zh: "提前", en: "Before" },
                            { value: "after", zh: "延后", en: "After" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setTimeRule((current) => ({
                                  ...current,
                                  mode: "timer",
                                  adjustment_direction: option.value as "before" | "after",
                                }))
                              }
                              className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-all ${
                                timeRule.adjustment_direction === option.value
                                  ? "bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {option[language]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-600 dark:text-slate-300">
                          {zh ? "调整时长" : "Adjustment Amount"}
                        </label>
                        <div className="grid grid-cols-[1fr_110px] gap-2">
                          <input
                            type="number"
                            min={0}
                            value={timeRule.adjustment_amount ?? 5}
                            onChange={(event) =>
                              setTimeRule((current) => ({
                                ...current,
                                mode: "timer",
                                adjustment_amount: Number(event.target.value),
                              }))
                            }
                            className={inputClass}
                          />
                          <div className="relative">
                            <select
                              value={timeRule.adjustment_unit ?? timeRule.target_offset_unit ?? "minutes"}
                              onChange={(event) =>
                                setTimeRule((current) => ({
                                  ...current,
                                  mode: "timer",
                                  adjustment_unit: event.target.value as EventRuleTimeRule["adjustment_unit"],
                                }))
                              }
                              className={`${inputClass} appearance-none pr-8`}
                            >
                              {eventTimeUnitOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option[language]}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </EventSectionCard>

              <EventSectionCard
                title={zh ? "D · 绑定任务模板" : "D · Bound Task Templates"}
                subtitle={zh ? "命中规则后异步并行下发所有选中的任务模板" : "All selected task templates are dispatched asynchronously in parallel when the rule matches"}
              >
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200/50 bg-amber-50/70 px-3 py-2.5 text-[11px] text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/10 dark:text-amber-300">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div className="space-y-0.5">
                    <p>{zh ? "Event 模块只下发 task_template_id，不管理任务实例。" : "The Event module only dispatches task_template_id and does not manage task instances."}</p>
                    <p>{zh ? "多个任务模板将并行下发，顺序不做保证。" : "Multiple task templates are dispatched in parallel and ordering is not guaranteed."}</p>
                  </div>
                </div>

                {fieldErrors.task_template_ids ? (
                  <p className="mb-3 text-[11px] text-red-500">{fieldErrors.task_template_ids}</p>
                ) : null}

                <div className="space-y-2">
                  {selectedTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[11px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
                      {zh ? "尚未绑定任务模板，点击下方按钮添加" : "No task templates selected yet. Use the button below to add one."}
                    </div>
                  ) : (
                    selectedTasks.map((task, index) => (
                      <div
                        key={task.id}
                        className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50"
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500 dark:bg-slate-700">
                          {index + 1}
                        </span>
                        <EventTaskGroupBadge task={task} language={language} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-800 dark:text-slate-100">{task.name}</p>
                          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">{task.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTaskTemplate(task.id)}
                          className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowTaskModal(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {zh ? "添加任务模板" : "Add Task Template"}
                </button>
              </EventSectionCard>
            </div>

            <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {zh ? "当前配置" : "Current Config"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-4">
                  <EventTypeBadge eventType={eventType} language={language} />
                  <EventStatusBadge status={status} language={language} />
                </div>
              </div>
              <EventPreviewCard detail={previewDetail} language={language} />
              <EventTimingHint eventType={eventType} triggerPoint={triggerPoint} timeRule={timeRule} language={language} />
              <EventStatsCard detail={previewDetail} language={language} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3.5 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {zh ? "取消" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave(false)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Save className="h-3.5 w-3.5" />
          {zh ? "保存" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave(true)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" />
          {zh ? "保存并启用" : "Save & Enable"}
        </button>
      </div>

      {showTaskModal ? (
        <TaskTemplateModal
          items={taskTemplates}
          selectedIds={taskTemplateIds}
          onSelect={addTaskTemplate}
          onClose={() => setShowTaskModal(false)}
          language={language}
        />
      ) : null}
    </div>
  );
}
