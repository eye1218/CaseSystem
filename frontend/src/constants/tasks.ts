import type { RecipientSourceType, TaskStatus, TaskTemplateStatus, TaskType } from "../types/task";

export const taskTypeOptions: Array<{ value: Extract<TaskType, "EMAIL" | "WEBHOOK">; zh: string; en: string }> = [
  { value: "EMAIL", zh: "邮件任务", en: "Email Task" },
  { value: "WEBHOOK", zh: "回调任务", en: "Webhook Task" },
];

export const taskStatusOptions: Array<{ value: TaskStatus; zh: string; en: string }> = [
  { value: "PENDING", zh: "待执行", en: "Pending" },
  { value: "RUNNING", zh: "执行中", en: "Running" },
  { value: "SUCCESS", zh: "成功", en: "Success" },
  { value: "FAILED", zh: "失败", en: "Failed" },
  { value: "CANCELLED", zh: "已取消", en: "Cancelled" },
];

export const taskTemplateStatusOptions: Array<{ value: TaskTemplateStatus; zh: string; en: string }> = [
  { value: "ACTIVE", zh: "启用", en: "Active" },
  { value: "INACTIVE", zh: "停用", en: "Inactive" },
];

export const recipientSourceOptions: Array<{ value: RecipientSourceType; zh: string; en: string }> = [
  { value: "CUSTOM_EMAIL", zh: "自定义邮箱", en: "Custom Email" },
  { value: "CURRENT_HANDLER", zh: "当前处理人", en: "Current Handler" },
  { value: "ROLE_MEMBERS", zh: "角色全部成员", en: "Role Members" },
];

export function getTaskTypeLabel(taskType: TaskType, language: "zh" | "en") {
  return taskTypeOptions.find((item) => item.value === taskType)?.[language] ?? taskType;
}

export function getTaskStatusLabel(status: TaskStatus, language: "zh" | "en") {
  return taskStatusOptions.find((item) => item.value === status)?.[language] ?? status;
}

export function getTaskTemplateStatusLabel(status: TaskTemplateStatus, language: "zh" | "en") {
  return taskTemplateStatusOptions.find((item) => item.value === status)?.[language] ?? status;
}

export function getRecipientSourceLabel(sourceType: RecipientSourceType, language: "zh" | "en") {
  return recipientSourceOptions.find((item) => item.value === sourceType)?.[language] ?? sourceType;
}

export function getTaskStatusPalette(status: TaskStatus) {
  if (status === "SUCCESS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300";
  }
  if (status === "FAILED") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300";
  }
  if (status === "RUNNING") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300";
  }
  if (status === "CANCELLED") {
    return "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300";
}

export function getTaskTemplateStatusPalette(status: TaskTemplateStatus) {
  if (status === "ACTIVE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300";
  }
  return "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400";
}
