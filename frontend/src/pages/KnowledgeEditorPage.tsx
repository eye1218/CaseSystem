import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Columns,
  Edit,
  Eye,
  Info,
  RefreshCw,
  Save,
  Tag
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { createKnowledgeArticle, getKnowledgeArticle, updateKnowledgeArticle } from "../api/knowledge";
import KnowledgeCategoryBadge from "../components/KnowledgeCategoryBadge";
import KnowledgeMarkdown from "../components/KnowledgeMarkdown";
import { ticketCategoryOptions } from "../constants/ticketCategories";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { KnowledgeArticleDetail } from "../types/knowledge";
import { formatApiDateTime } from "../utils/datetime";

type EditorMode = "edit" | "split" | "preview";

const PLACEHOLDER_CONTENT = `# 知识库标题

> **适用范围**：T1 / T2 / T3 分析员
> **作者**：

---

## 概述

在此描述该知识库的适用场景和目标读者。

---

## 处置步骤

### 步骤 1：确认告警

在这里描述具体步骤。

\`\`\`bash
# 示例命令
echo "Hello, SOC"
\`\`\`

---

## 参考资料

- 参考链接 1
- 参考链接 2
`;

export default function KnowledgeEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user } = useAuth();
  const zh = language === "zh";
  const isEdit = Boolean(id);

  const [existingArticle, setExistingArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") ?? "");
  const [content, setContent] = useState(PLACEHOLDER_CONTENT);
  const [mode, setMode] = useState<EditorMode>("split");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success">("idle");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<{ title?: string; categoryId?: string; content?: string }>({});

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
          setExistingArticle(payload);
          setTitle(payload.title);
          setCategoryId(payload.category_id);
          setContent(payload.content_markdown);
        }
      } catch (loadError) {
        if (!cancelled) {
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

  const canSave = !isEdit || existingArticle?.permissions.can_edit;

  function validate() {
    const nextErrors: { title?: string; categoryId?: string; content?: string } = {};
    if (!title.trim()) {
      nextErrors.title = zh ? "请输入标题" : "Title is required";
    }
    if (!categoryId) {
      nextErrors.categoryId = zh ? "请选择工单类别" : "Please select a ticket category";
    }
    if (!content.trim()) {
      nextErrors.content = zh ? "正文不能为空" : "Content is required";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate() || !canSave) {
      return;
    }

    setSaveState("saving");
    setError("");
    try {
      if (isEdit && id) {
        await updateKnowledgeArticle(id, {
          title: title.trim(),
          category_id: categoryId,
          content_markdown: content
        });
        setSaveState("success");
        navigate(`/knowledge/${id}`, { replace: true });
      } else {
        const article = await createKnowledgeArticle({
          title: title.trim(),
          category_id: categoryId,
          content_markdown: content
        });
        setSaveState("success");
        navigate(`/knowledge/${article.id}`, { replace: true });
      }
    } catch (saveError) {
      setSaveState("idle");
      setError(saveError instanceof Error ? saveError.message : "Failed to save article");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{zh ? "正在加载知识库…" : "Loading knowledge article..."}</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-3.5 dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {zh ? "返回" : "Back"}
        </button>
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
          <Link to="/knowledge" className="transition-colors hover:text-blue-600 dark:hover:text-blue-400">
            {zh ? "知识库" : "Knowledge Base"}
          </Link>
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
          <span className="truncate text-slate-600 dark:text-slate-300">{isEdit ? (zh ? "编辑文章" : "Edit Article") : zh ? "新建文章" : "New Article"}</span>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-700/60">
          {([
            { value: "edit", icon: <Edit className="h-3.5 w-3.5" />, label: zh ? "编辑" : "Edit" },
            { value: "split", icon: <Columns className="h-3.5 w-3.5" />, label: zh ? "分栏" : "Split" },
            { value: "preview", icon: <Eye className="h-3.5 w-3.5" />, label: zh ? "预览" : "Preview" }
          ] as const).map((item) => (
            <button
              key={item.value}
              onClick={() => setMode(item.value)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] transition-all ${
                mode === item.value
                  ? "bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {saveState === "success" ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5" />
              {zh ? "保存成功，正在跳转…" : "Saved! Redirecting…"}
            </span>
          ) : null}
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saveState === "saving" || saveState === "success" || !canSave}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-blue-700 disabled:opacity-70"
          >
            {saveState === "saving" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {zh ? "保存知识库" : "Save Article"}
          </button>
        </div>
      </div>

      {isEdit && existingArticle ? (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          {zh
            ? `正在编辑：${existingArticle.title} · 最近更新：${formatApiDateTime(existingArticle.updated_at, language)} · 作者：${existingArticle.author_name}`
            : `Editing: ${existingArticle.title} · Last updated: ${formatApiDateTime(existingArticle.updated_at, language)} · Author: ${existingArticle.author_name}`}
        </div>
      ) : null}

      {!canSave && existingArticle ? (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-2.5 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-3.5 w-3.5" />
          {zh ? "仅作者本人或管理员可编辑该知识库" : "Only the author or an admin can edit this article"}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{zh ? "基础信息" : "Basic Information"}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {zh ? "标题" : "Title"}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setErrors((current) => ({ ...current, title: undefined }));
                  }}
                  placeholder={zh ? "请输入知识库文章标题…" : "Enter article title…"}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:ring-2 focus:ring-blue-500 dark:text-slate-100 ${
                    errors.title
                      ? "border-red-400 bg-white dark:border-red-600 dark:bg-slate-800"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                  }`}
                />
                {errors.title ? <p className="text-[11px] text-red-500">{errors.title}</p> : null}
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <Tag className="h-3 w-3" />
                  {zh ? "关联工单类别" : "Ticket Category"}
                  <span className="text-red-500">*</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setErrors((current) => ({ ...current, categoryId: undefined }));
                  }}
                  className={`w-full appearance-none rounded-lg border px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:ring-2 focus:ring-blue-500 dark:text-slate-200 ${
                    errors.categoryId
                      ? "border-red-400 bg-white dark:border-red-600 dark:bg-slate-800"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  <option value="">{zh ? "请选择工单类别…" : "Select a ticket category…"}</option>
                  {ticketCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {zh ? category.zh : category.en}
                    </option>
                  ))}
                </select>
                {errors.categoryId ? <p className="text-[11px] text-red-500">{errors.categoryId}</p> : null}
                {categoryId ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <KnowledgeCategoryBadge categoryId={categoryId} language={language} className="px-2 py-0.5 text-[11px]" />
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {zh ? "（一篇文章只能关联一个工单类别）" : "(One article can only link to one category)"}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-600 dark:text-slate-300">{zh ? "作者" : "Author"}</label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                  {existingArticle?.author_name ?? user?.display_name ?? "Unknown"}
                  <span className="ml-2 text-[10px] opacity-60">{zh ? "（自动填入）" : "(auto-filled)"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-700 dark:bg-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{zh ? "正文内容（Markdown）" : "Content (Markdown)"}</span>
                <span className="text-xs text-red-500">*</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                <Info className="h-3 w-3" />
                {zh ? "支持 Markdown 格式，不支持富文本工具栏" : "Markdown only, no rich text toolbar"}
              </div>
            </div>

            {errors.content ? (
              <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-600 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-400">
                {errors.content}
              </div>
            ) : null}

            <div className={`${mode === "split" ? "grid grid-cols-2" : "flex flex-col"}`} style={{ minHeight: "520px" }}>
              {mode === "edit" || mode === "split" ? (
                <div className={`flex flex-col ${mode === "split" ? "border-r border-slate-200 dark:border-slate-700" : ""}`}>
                  {mode === "split" ? (
                    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50/50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                      <Edit className="h-3 w-3 text-slate-400" />
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{zh ? "编辑区" : "Editor"}</span>
                    </div>
                  ) : null}
                  <textarea
                    value={content}
                    onChange={(event) => {
                      setContent(event.target.value);
                      setErrors((current) => ({ ...current, content: undefined }));
                    }}
                    className="flex-1 w-full resize-none bg-slate-900 p-5 font-mono text-xs leading-relaxed text-slate-200 outline-none dark:bg-slate-950"
                    placeholder={zh ? "在此输入 Markdown 正文内容…" : "Enter Markdown content here…"}
                    style={{ minHeight: mode === "split" ? "520px" : "480px" }}
                  />
                </div>
              ) : null}

              {mode === "preview" || mode === "split" ? (
                <div className="flex flex-col overflow-auto">
                  {mode === "split" ? (
                    <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50/50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                      <Eye className="h-3 w-3 text-slate-400" />
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{zh ? "预览区" : "Preview"}</span>
                    </div>
                  ) : null}
                  <div className="flex-1 overflow-auto px-8 py-6">
                    {content.trim() ? (
                      <KnowledgeMarkdown content={content} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs italic text-slate-400 dark:text-slate-500">
                        {zh ? "预览区将在此处实时渲染 Markdown 内容" : "Markdown preview will appear here as you type"}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-slate-600 dark:text-slate-300">{zh ? "Markdown 快速参考" : "Markdown Quick Reference"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: zh ? "一级标题" : "H1", code: "# 标题" },
                { label: zh ? "二级标题" : "H2", code: "## 标题" },
                { label: zh ? "粗体" : "Bold", code: "**文本**" },
                { label: zh ? "列表" : "List", code: "- 列表项" },
                { label: zh ? "待办" : "Checklist", code: "- [ ] 任务" },
                { label: zh ? "代码块" : "Code", code: "```bash\n...\n```" },
                { label: zh ? "表格" : "Table", code: "| 列 | 列 |" },
                { label: zh ? "引用" : "Quote", code: "> 引用内容" },
                { label: zh ? "分隔线" : "HR", code: "---" },
                { label: zh ? "链接" : "Link", code: "[文字](url)" },
                { label: zh ? "行内代码" : "Inline", code: "`代码`" },
                { label: zh ? "强调" : "Italic", code: "*斜体*" }
              ].map((item) => (
                <div key={item.label} className="space-y-0.5">
                  <div className="text-slate-400 dark:text-slate-500">{item.label}</div>
                  <code className="block break-all rounded border border-slate-200 bg-white px-1.5 py-1 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {item.code}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
