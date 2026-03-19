import { listConfigs, type SystemConfig } from "../../api/config";

export const TICKET_TIMEOUT_REMINDER_CATEGORY = "ticket.timeout_reminder";
export const TICKET_TIMEOUT_REMINDER_KEY = "DEFAULT";
export const DEFAULT_RESPONSE_REMINDER_MINUTES = 5;
export const DEFAULT_RESOLUTION_REMINDER_MINUTES = 30;

export interface TicketTimeoutReminderConfig {
  key: string;
  responseReminderMinutes: number;
  resolutionReminderMinutes: number;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function getDefaultTimeoutReminderConfig(): TicketTimeoutReminderConfig {
  return {
    key: TICKET_TIMEOUT_REMINDER_KEY,
    responseReminderMinutes: DEFAULT_RESPONSE_REMINDER_MINUTES,
    resolutionReminderMinutes: DEFAULT_RESOLUTION_REMINDER_MINUTES,
  };
}

export function parseTimeoutReminderConfigItem(item: SystemConfig): TicketTimeoutReminderConfig | null {
  if (item.category !== TICKET_TIMEOUT_REMINDER_CATEGORY) {
    return null;
  }
  const normalizedKey = item.key.trim().toUpperCase();
  if (normalizedKey !== TICKET_TIMEOUT_REMINDER_KEY) {
    return null;
  }
  const responseReminderMinutes = toPositiveInt(item.value.response_reminder_minutes);
  const resolutionReminderMinutes = toPositiveInt(item.value.resolution_reminder_minutes);
  if (responseReminderMinutes === null || resolutionReminderMinutes === null) {
    return null;
  }
  return {
    key: normalizedKey,
    responseReminderMinutes,
    resolutionReminderMinutes,
  };
}

export function extractTimeoutReminderConfig(items: SystemConfig[]): TicketTimeoutReminderConfig {
  const matched = items
    .map(parseTimeoutReminderConfigItem)
    .find((item): item is TicketTimeoutReminderConfig => item !== null);
  return matched ?? getDefaultTimeoutReminderConfig();
}

export async function fetchTicketTimeoutReminderConfig(): Promise<TicketTimeoutReminderConfig> {
  const payload = await listConfigs(TICKET_TIMEOUT_REMINDER_CATEGORY);
  return extractTimeoutReminderConfig(payload.items);
}
