import { listConfigs, type SystemConfig } from "../../api/config";

export interface SlaPriorityPolicy {
  id: string;
  priority_code: string;
  response_minutes: number;
  resolution_minutes: number;
  description: string;
}

export function normalizePriorityCode(value: string): string {
  return value.trim().toUpperCase();
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : null;
}

function toSlaPolicy(item: SystemConfig): SlaPriorityPolicy | null {
  const code = normalizePriorityCode(item.key);
  if (!/^[A-Z0-9_-]{1,8}$/.test(code)) {
    return null;
  }
  const responseMinutes = toPositiveInt(item.value.response_minutes);
  const resolutionMinutes = toPositiveInt(item.value.resolution_minutes);
  if (responseMinutes === null || resolutionMinutes === null || resolutionMinutes < responseMinutes) {
    return null;
  }
  return {
    id: `${item.category}:${item.key}`,
    priority_code: code,
    response_minutes: responseMinutes,
    resolution_minutes: resolutionMinutes,
    description: item.description ?? "",
  };
}

export function compareSlaPolicyOrder(left: SlaPriorityPolicy, right: SlaPriorityPolicy): number {
  if (left.response_minutes !== right.response_minutes) {
    return left.response_minutes - right.response_minutes;
  }
  return left.priority_code.localeCompare(right.priority_code);
}

export async function fetchSlaPolicies(): Promise<SlaPriorityPolicy[]> {
  const payload = await listConfigs("ticket.sla_policy");
  return payload.items
    .map(toSlaPolicy)
    .filter((item): item is SlaPriorityPolicy => item !== null)
    .sort(compareSlaPolicyOrder);
}

export function getPriorityOptionsFromPolicies(
  policies: SlaPriorityPolicy[],
  extraCodes: string[] = []
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  const append = (rawCode: string) => {
    const code = normalizePriorityCode(rawCode);
    if (!code || seen.has(code)) {
      return;
    }
    seen.add(code);
    options.push(code);
  };
  policies.forEach((item) => append(item.priority_code));
  extraCodes.forEach((item) => append(item));
  return options;
}

export function pickDefaultPriority(policies: SlaPriorityPolicy[]): string {
  const options = getPriorityOptionsFromPolicies(policies);
  if (options.includes("P2")) {
    return "P2";
  }
  return options[0] ?? "P2";
}
