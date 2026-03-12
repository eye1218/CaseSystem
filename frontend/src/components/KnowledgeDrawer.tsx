import { type ReactNode, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Clock, Download, ExternalLink, Tag, ThumbsUp, User, X } from "lucide-react";

import type { KnowledgeArticleDetail } from "../types/knowledge";
import { formatApiDateTime } from "../utils/datetime";

interface KnowledgeDrawerProps {
  article: KnowledgeArticleDetail | null;
  open: boolean;
  onClose: () => void;
  language: "zh" | "en";
  loading?: boolean;
  errorMessage?: string | null;
}

type MarkdownProps = { children?: ReactNode; className?: string };

const markdownComponents: Record<string, React.FC<MarkdownProps>> = {
  h1: ({ children }) => (
    <h1 className="mb-4 border-b border-slate-200 pb-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2.5 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
      <span className="inline-block h-4 w-1 rounded-full bg-blue-500" />
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</h3>,
  p: ({ children }) => <p className="mb-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 space-y-1 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-4">{children}</ol>,
  li: ({ children }) => <li className="list-disc text-sm leading-relaxed text-slate-700 marker:text-slate-400 dark:text-slate-300">{children}</li>,
  pre: ({ children }) => <>{children}</>,
  code: ({ children, className }) => {
    const isBlock = /language-/.test(className ?? "");
    return isBlock ? (
      <pre className="my-3 overflow-x-auto rounded-lg bg-slate-950 p-3">
        <code className="font-mono text-xs text-slate-200">{children}</code>
      </pre>
    ) : (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-200">
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-md border-l-4 border-blue-500 bg-blue-50/70 px-3 py-2 text-sm text-slate-600 dark:bg-blue-900/10 dark:text-slate-400">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
  hr: () => <hr className="my-5 border-slate-200 dark:border-slate-700" />
};

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function KnowledgeDrawer({
  article,
  open,
  onClose,
  language,
  loading = false,
  errorMessage = null
}: KnowledgeDrawerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [article?.id, open]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (open) {
      document.addEventListener("keydown", handler);
    }
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, open]);

  const content = article?.content_markdown ?? "";

  return (
    <div
      className={`relative z-20 flex-shrink-0 overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{
        width: open ? 560 : 0,
        marginLeft: open ? 16 : 0,
        transition: "width 280ms cubic-bezier(0.4,0,0.2,1), margin-left 280ms cubic-bezier(0.4,0,0.2,1)"
      }}
    >
      <div className="relative flex h-full w-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {article ? (
          <>
            <div className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <BookOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                    {language === "zh" ? "知识库" : "Knowledge Base"}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="close knowledge drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-4 py-3.5">
                <h2 className="mb-2.5 text-sm font-bold leading-snug text-slate-900 dark:text-white">
                  {article.title}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Tag className="h-3 w-3" />
                    {article.category_name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <User className="h-3 w-3" />
                    {article.author_name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="h-3 w-3" />
                    {formatApiDateTime(article.updated_at, language)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <ThumbsUp className="h-3 w-3" />
                    {article.likes_count}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{article.excerpt}</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="px-5 py-5">
                <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents as never}>
                  {content}
                </Markdown>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {language === "zh" ? "关闭" : "Close"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadMarkdown(content, `${article.id}-${language}.md`)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  {language === "zh" ? "下载 .md" : "Download .md"}
                </button>
                <button
                  onClick={() => window.open(`/knowledge/${article.id}`, "_self")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {language === "zh" ? "完整页面" : "Full Page"}
                </button>
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-slate-400 dark:text-slate-500">
            {language === "zh" ? "正在加载知识库…" : "Loading knowledge article..."}
          </div>
        ) : errorMessage ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-rose-500 dark:text-rose-400">
            {errorMessage}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-slate-400 dark:text-slate-600">
            {language === "zh" ? "请选择文章" : "Select an article"}
          </div>
        )}
      </div>
    </div>
  );
}
