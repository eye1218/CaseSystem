import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clock,
  Edit,
  Home,
  Pin,
  PinOff,
  ThumbsUp,
  Trash2,
  User
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  deleteKnowledgeArticle,
  getKnowledgeArticle,
  likeKnowledgeArticle,
  pinKnowledgeArticle,
  unlikeKnowledgeArticle,
  unpinKnowledgeArticle
} from "../api/knowledge";
import KnowledgeCategoryBadge from "../components/KnowledgeCategoryBadge";
import KnowledgeMarkdown from "../components/KnowledgeMarkdown";
import { useLanguage } from "../contexts/LanguageContext";
import type { KnowledgeArticleDetail } from "../types/knowledge";
import { formatApiDateTime } from "../utils/datetime";

function NotFoundState({ language }: { language: "zh" | "en" }) {
  const zh = language === "zh";
  return (
    <div className="p-6">
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
          <AlertTriangle className="h-9 w-9 text-slate-300 dark:text-slate-600" />
        </div>
        <h2 className="mb-2 text-2xl text-slate-700 dark:text-slate-300">{zh ? "知识库不存在或已删除" : "Article Not Found or Deleted"}</h2>
        <p className="mb-6 max-w-xs text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          {zh
            ? "您访问的知识库文章不存在，或已被作者 / 管理员删除。如有疑问，请联系文章作者。"
            : "The knowledge base article you requested does not exist or has been deleted. Please contact the article author if you have questions."}
        </p>
        <Link
          to="/knowledge"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white transition-colors hover:bg-blue-700"
        >
          <Home className="h-3.5 w-3.5" />
          {zh ? "返回知识库列表" : "Back to Knowledge Base"}
        </Link>
      </div>
    </div>
  );
}

export default function KnowledgeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language === "zh";
  const [article, setArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        return;
      }
      setLoading(true);
      setError("");
      try {
        const payload = await getKnowledgeArticle(id);
        if (!cancelled) {
          setArticle(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setArticle(null);
          setError(loadError instanceof Error ? loadError.message : "Failed to load knowledge article");
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
  }, [id]);

  const notFound = !loading && !article && error === "知识库不存在或已删除";

  async function handleLike() {
    if (!article) {
      return;
    }
    setActioning("like");
    setError("");
    try {
      const payload = article.viewer_has_liked ? await unlikeKnowledgeArticle(article.id) : await likeKnowledgeArticle(article.id);
      setArticle(payload);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update like state");
    } finally {
      setActioning(null);
    }
  }

  async function handlePin() {
    if (!article) {
      return;
    }
    setActioning("pin");
    setError("");
    try {
      const payload = article.is_pinned ? await unpinKnowledgeArticle(article.id) : await pinKnowledgeArticle(article.id);
      setArticle(payload);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update pin state");
    } finally {
      setActioning(null);
    }
  }

  async function handleDelete() {
    if (!article) {
      return;
    }
    setActioning("delete");
    setError("");
    try {
      await deleteKnowledgeArticle(article.id);
      navigate("/knowledge", { replace: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete article");
      setActioning(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{zh ? "正在加载知识库…" : "Loading knowledge article..."}</div>;
  }

  if (notFound) {
    return <NotFoundState language={language} />;
  }

  if (!article) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{error || (zh ? "知识库加载失败" : "Failed to load article")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Link to="/knowledge" className="flex items-center gap-1 transition-colors hover:text-blue-600 dark:hover:text-blue-400">
          <BookOpen className="h-3.5 w-3.5" />
          {zh ? "知识库" : "Knowledge Base"}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="max-w-[300px] truncate text-slate-600 dark:text-slate-300">{article.title}</span>
      </div>

      {article.is_pinned ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          <Pin className="h-3.5 w-3.5 flex-shrink-0" />
          {zh ? "此文章已由管理员置顶" : "This article has been pinned by an administrator"}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/knowledge"
              className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {zh ? "返回列表" : "Back to List"}
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleLike()}
                disabled={actioning !== null}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  article.viewer_has_liked
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-300"
                }`}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                {article.viewer_has_liked ? (zh ? "已点赞" : "Liked") : zh ? "点赞" : "Like"}
                <span className="ml-0.5">({article.likes_count})</span>
              </button>

              {article.permissions.can_pin ? (
                <button
                  onClick={() => void handlePin()}
                  disabled={actioning !== null}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                    article.is_pinned
                      ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-amber-600 dark:hover:text-amber-300"
                  }`}
                >
                  {article.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  {article.is_pinned ? (zh ? "取消置顶" : "Unpin") : zh ? "置顶" : "Pin"}
                </button>
              ) : null}

              <button
                onClick={() => article.permissions.can_edit && navigate(`/knowledge/${article.id}/edit`)}
                disabled={!article.permissions.can_edit || actioning !== null}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  article.permissions.can_edit
                    ? "border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-300"
                    : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-600"
                }`}
                title={!article.permissions.can_edit ? (zh ? "仅作者或管理员可编辑" : "Only the author or admin can edit") : undefined}
              >
                <Edit className="h-3.5 w-3.5" />
                {zh ? "编辑" : "Edit"}
              </button>

              <button
                onClick={() => article.permissions.can_delete && void handleDelete()}
                disabled={!article.permissions.can_delete || actioning !== null}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  article.permissions.can_delete
                    ? "border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-600"
                }`}
                title={!article.permissions.can_delete ? (zh ? "仅作者或管理员可删除" : "Only the author or admin can delete") : undefined}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {zh ? "删除" : "Delete"}
              </button>
            </div>
          </div>

          <h1 className="mb-3 text-3xl font-semibold leading-snug text-slate-900 dark:text-white">{article.title}</h1>

          <div className="flex flex-wrap items-center gap-3">
            <KnowledgeCategoryBadge categoryId={article.category_id} language={language} />
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <User className="h-3.5 w-3.5" />
              {article.author_name}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              {zh ? `更新于 ${formatApiDateTime(article.updated_at, language)}` : `Updated ${formatApiDateTime(article.updated_at, language)}`}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <ThumbsUp className="h-3.5 w-3.5" />
              {article.likes_count} {zh ? "次点赞" : "likes"}
            </span>
            {!article.permissions.can_edit && !article.permissions.can_pin ? (
              <span className="ml-auto rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-700/60 dark:text-slate-500">
                {zh ? "编辑与删除按钮仅限作者本人或管理员" : "Edit & Delete available to author/admin only"}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
          <BookOpen className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{zh ? "正文内容" : "Content"}</span>
        </div>
        <div className="px-8 py-6">
          <KnowledgeMarkdown content={article.content_markdown} />
        </div>
      </div>

      <div className="flex items-center justify-center border-t border-slate-200 py-6 dark:border-slate-700">
        <div className="space-y-2 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {zh ? "如果这篇知识库对您有帮助，请给予点赞支持" : "Found this article helpful? Give it a like!"}
          </p>
          <button
            onClick={() => void handleLike()}
            disabled={actioning !== null}
            className={`mx-auto flex items-center gap-2 rounded-lg border px-5 py-2 text-xs transition-all ${
              article.viewer_has_liked
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-300"
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {article.viewer_has_liked ? (zh ? "已点赞" : "Liked") : zh ? "点赞" : "Like"}
            <span className="tabular-nums">({article.likes_count})</span>
          </button>
        </div>
      </div>

      {error && !notFound ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
