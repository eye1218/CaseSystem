export interface TicketCategoryOption {
  id: string;
  zh: string;
  en: string;
  colorClass: string;
}

export const ticketCategoryOptions: TicketCategoryOption[] = [
  {
    id: "intrusion",
    zh: "入侵检测",
    en: "Intrusion Detection",
    colorClass:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/20 dark:text-rose-300"
  },
  {
    id: "network",
    zh: "网络攻击",
    en: "Network Attack",
    colorClass:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-300"
  },
  {
    id: "data",
    zh: "数据安全",
    en: "Data Security",
    colorClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300"
  },
  {
    id: "endpoint",
    zh: "终端安全",
    en: "Endpoint Security",
    colorClass:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/20 dark:text-violet-300"
  },
  {
    id: "phishing",
    zh: "网络钓鱼",
    en: "Phishing",
    colorClass:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-300"
  }
];

export function getTicketCategory(categoryId: string) {
  return ticketCategoryOptions.find((item) => item.id === categoryId) ?? null;
}
