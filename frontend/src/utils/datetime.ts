const TIMEZONE_PATTERN = /(Z|[+-]\d{2}:\d{2})$/;

export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = TIMEZONE_PATTERN.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatApiDateTime(value: string | null | undefined, language: "zh" | "en"): string {
  const parsed = parseApiDate(value);
  if (!parsed) return "-";
  return parsed.toLocaleString(language === "zh" ? "zh-CN" : "en-US", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
