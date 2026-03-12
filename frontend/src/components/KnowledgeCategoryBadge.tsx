import { Tag } from "lucide-react";

import { getTicketCategory } from "../constants/ticketCategories";

export default function KnowledgeCategoryBadge({
  categoryId,
  language,
  className = "px-2.5 py-1 text-xs"
}: {
  categoryId: string;
  language: "zh" | "en";
  className?: string;
}) {
  const category = getTicketCategory(categoryId);
  if (!category) {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${category.colorClass} ${className}`}>
      <Tag className="h-3 w-3" />
      {language === "zh" ? category.zh : category.en}
    </span>
  );
}
