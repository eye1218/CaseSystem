import { BookOpen, ChevronRight, Clock, Filter, Pin, Plus, Search, ThumbsUp, User } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listKnowledgeArticles } from "../api/knowledge";
import KnowledgeCategoryBadge from "../components/KnowledgeCategoryBadge";
import { ticketCategoryOptions } from "../constants/ticketCategories";
import { useLanguage } from "../contexts/LanguageContext";
import type { KnowledgeArticleSummary } from "../types/knowledge";
import { formatApiDateTime } from "../utils/datetime";

function KnowledgeCard({
  article,
  language,
  onClick
}: {
  article: KnowledgeArticleSummary;
  language: "zh" | "en";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-700"
    >
      {article.is_pinned ? (
        <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-1.5 dark:border-amber-800/40 dark:bg-amber-900/20">
          <Pin className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            {language === "zh" ? "管理员已置顶" : "Pinned by Admin"}
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <div className="space-y-2">
          <KnowledgeCategoryBadge categoryId={article.category_id} language={language} className="px-2 py-0.5 text-[11px]" />
          <h3 className="line-clamp-2 text-sm leading-snug text-slate-800 transition-colors group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-300">
            {article.title}
          </h3>
        </div>

        {article.excerpt ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{article.excerpt}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <User className="h-3 w-3" />
              <span className="max-w-[100px] truncate">{article.author_name.split(" ")[0]}</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <Clock className="h-3 w-3" />
              {formatApiDateTime(article.updated_at, language)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <ThumbsUp className="h-3 w-3" />
            <span>{article.likes_count}</span>
          </div>
        </div>
      </div>

      <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>
    </button>
  );
}

export default function KnowledgeListPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const zh = language === "zh";
  const [items, setItems] = useState<KnowledgeArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await listKnowledgeArticles();
        if (!cancelled) {
          setItems(payload.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load knowledge articles");
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
  }, []);

  const keyword = deferredSearch.trim().toLowerCase();
  const filtered = items.filter((article) => {
    const matchCategory = selectedCategory === "all" || article.category_id === selectedCategory;
    const matchSearch =
      !keyword ||
      article.title.toLowerCase().includes(keyword) ||
      article.author_name.toLowerCase().includes(keyword);
    return matchCategory && matchSearch;
  });

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{zh ? "知识库" : "Knowledge Base"}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{zh ? "知识库" : "Knowledge Base"}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {zh ? "沉淀与工单处置相关的标准化知识，正文采用 Markdown 格式" : "Standardized knowledge linked to ticket categories, written in Markdown"}
          </p>
        </div>
        <button
          onClick={() => navigate("/knowledge/new")}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {zh ? "新建知识库" : "New Article"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={zh ? "搜索标题、作者…" : "Search title, author…"}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Filter className="h-3 w-3" />
          {zh ? "共" : "Total"} {filtered.length} {zh ? "篇" : "articles"}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-500">
        <Pin className="h-3 w-3 text-amber-500" />
        <span>{zh ? "排序规则：置顶优先 → 点赞数倒序 → 最近更新倒序" : "Sort: Pinned first → Most liked → Recently updated"}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
            selectedCategory === "all"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
          }`}
        >
          {zh ? "全部类别" : "All Categories"}
          <span className="ml-1.5 text-[10px] opacity-70">{items.length}</span>
        </button>
        {ticketCategoryOptions.map((category) => {
          const count = items.filter((article) => article.category_id === category.id).length;
          if (count === 0) {
            return null;
          }
          const isActive = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                isActive
                  ? `${category.colorClass} opacity-100`
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {zh ? category.zh : category.en}
              <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {zh ? "正在加载知识库…" : "Loading knowledge base..."}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
            <BookOpen className="h-7 w-7 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
            {search || selectedCategory !== "all"
              ? zh
                ? "没有符合条件的知识库"
                : "No articles match your filters"
              : zh
                ? "暂无知识库，点击右上角新建"
                : "No articles yet. Click \"New Article\" to get started."}
          </p>
          {!search && selectedCategory === "all" ? (
            <button
              onClick={() => navigate("/knowledge/new")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {zh ? "新建知识库" : "New Article"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((article) => (
            <KnowledgeCard key={article.id} article={article} language={language} onClick={() => navigate(`/knowledge/${article.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
