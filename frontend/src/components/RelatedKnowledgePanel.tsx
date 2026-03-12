import { BookOpen, ChevronRight, Clock, Pin, Plus, RefreshCw, ThumbsUp, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getTicketCategory } from "../constants/ticketCategories";
import type { KnowledgeArticleSummary } from "../types/knowledge";
import { createRelatedKnowledgeClickHandler } from "../utils/relatedKnowledge";
import { formatApiDateTime } from "../utils/datetime";

export default function RelatedKnowledgePanel({
  categoryId,
  items,
  language,
  onRefresh,
  canCreate,
  onSelectArticle
}: {
  categoryId: string;
  items: KnowledgeArticleSummary[];
  language: "zh" | "en";
  onRefresh?: () => void;
  canCreate: boolean;
  onSelectArticle?: (article: KnowledgeArticleSummary) => void;
}) {
  const navigate = useNavigate();
  const zh = language === "zh";
  const category = getTicketCategory(categoryId);
  const categoryName = category ? (zh ? category.zh : category.en) : categoryId;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-800/80">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-blue-500" />
            <h2 className="text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {zh ? "相关知识库" : "Related Knowledge"}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 dark:text-slate-500">{items.length}</span>
            {onRefresh ? (
              <button
                onClick={onRefresh}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title={zh ? "刷新" : "Refresh"}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
        {category ? (
          <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
            <span>{zh ? "按当前工单类别匹配：" : "Matched by ticket category:"}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${category.colorClass}`}>{categoryName}</span>
          </div>
        ) : null}
      </div>

      <div className="max-h-[360px] space-y-1.5 overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="mb-2 h-7 w-7 text-slate-200 dark:text-slate-700" />
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {zh ? `暂无与「${categoryName}」类别相关的知识库` : `No articles found for category "${categoryName}"`}
            </p>
          </div>
        ) : (
          items.map((article) => (
            <button
              key={article.id}
              onClick={createRelatedKnowledgeClickHandler(article, {
                navigate,
                onSelectArticle
              })}
              className="group flex w-full items-start gap-2.5 rounded-lg border border-slate-100 px-3 py-2.5 text-left transition-all hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10"
            >
              {article.is_pinned ? <Pin className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" /> : null}
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 line-clamp-2 text-xs leading-snug text-slate-700 transition-colors group-hover:text-blue-700 dark:text-slate-300 dark:group-hover:text-blue-300">
                  {article.title}
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    <User className="h-2.5 w-2.5" />
                    {article.author_name.split(" ")[0]}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    <Clock className="h-2.5 w-2.5" />
                    {formatApiDateTime(article.updated_at, language)}
                  </span>
                  <span className="ml-auto flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    <ThumbsUp className="h-2.5 w-2.5" />
                    {article.likes_count}
                  </span>
                </div>
              </div>
              <ChevronRight className="mt-1 h-3 w-3 flex-shrink-0 text-slate-300 transition-colors group-hover:text-blue-500 dark:text-slate-600" />
            </button>
          ))
        )}
      </div>

      {canCreate ? (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/50">
          <button
            onClick={() => navigate(`/knowledge/new?categoryId=${categoryId}`)}
            className="flex w-full items-center gap-2 text-xs text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <Plus className="h-3.5 w-3.5" />
            {zh ? `新建「${categoryName}」知识库` : `New article for "${categoryName}"`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
