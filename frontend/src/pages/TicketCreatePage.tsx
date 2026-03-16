import { ArrowLeft, CircleUserRound, ClipboardList, Inbox, ShieldAlert, TicketPlus } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createTicket } from "../api/tickets";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { TicketPriority } from "../types/ticket";

interface FormState {
  title: string;
  description: string;
  category_id: string;
  priority: TicketPriority;
  risk_score: string;
  pool_code: string;
  alarm_ids_text: string;
  context_markdown: string;
}

function parseAlarmIds(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const categories = [
  { value: "intrusion", zh: "入侵检测", en: "Intrusion Detection" },
  { value: "network", zh: "网络攻击", en: "Network Attack" },
  { value: "data", zh: "数据安全", en: "Data Security" },
  { value: "endpoint", zh: "终端安全", en: "Endpoint Security" },
  { value: "phishing", zh: "网络钓鱼", en: "Phishing" }
];

const poolOptions = ["T1_POOL", "T2_POOL", "T3_POOL"];

export default function TicketCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    category_id: "intrusion",
    priority: "P2",
    risk_score: "60",
    pool_code: "T1_POOL",
    alarm_ids_text: "",
    context_markdown: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isCustomer = user?.active_role === "CUSTOMER";
  const sourceValue = isCustomer ? "CUSTOMER" : "INTERNAL";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = await createTicket({
        title: form.title.trim(),
        description: form.description.trim(),
        category_id: form.category_id,
        priority: form.priority,
        risk_score: Number(form.risk_score),
        pool_code: isCustomer ? undefined : form.pool_code,
        alarm_ids: parseAlarmIds(form.alarm_ids_text),
        context_markdown: form.context_markdown.trim() || null
      });
      navigate(`/tickets/${payload.ticket.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/tickets"
            className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("nav.tickets")}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {language === "zh" ? "创建工单" : "Create Ticket"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {language === "zh"
              ? "表单按工单业务字段组织，来源字段按当前角色自动锁定，避免录入歧义。"
              : "The form follows ticket domain fields. Source is locked by the active role to avoid inconsistent data."}
          </p>
        </div>
      </div>

      <div className="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <TicketPlus className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {language === "zh" ? "工单录入" : "Ticket Intake"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {language === "zh"
                  ? "标题、描述、分类、优先级和风险分为本页核心输入。"
                  : "Title, description, category, priority, and risk score are the key inputs."}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={language === "zh" ? "当前角色" : "Active Role"}>
              <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                {user?.active_role ?? "-"}
              </div>
            </Field>

            <Field label={language === "zh" ? "来源" : "Source"}>
              <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                {sourceValue}
              </div>
            </Field>

            <Field label={t("ticket.title")} className="md:col-span-2">
              <input
                required
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={language === "zh" ? "输入工单标题" : "Enter ticket title"}
                className="ticket-input"
              />
            </Field>

            <Field label={language === "zh" ? "描述" : "Description"} className="md:col-span-2">
              <textarea
                required
                rows={6}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder={
                  language === "zh"
                    ? "补充当前问题、上下文和影响范围，便于后续响应与协作。"
                    : "Add the issue summary, context, and impact scope for downstream response."
                }
                className="ticket-input resize-none"
              />
            </Field>

            <Field label={t("ticket.category")}>
              <select
                value={form.category_id}
                onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}
                className="ticket-input"
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category[language]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("ticket.priority")}>
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TicketPriority }))}
                className="ticket-input"
              >
                {["P1", "P2", "P3", "P4"].map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("ticket.risk")}>
              <input
                required
                type="number"
                min={0}
                max={100}
                value={form.risk_score}
                onChange={(event) => setForm((current) => ({ ...current, risk_score: event.target.value }))}
                className="ticket-input"
              />
            </Field>

            {!isCustomer && (
              <Field label={language === "zh" ? "初始池子" : "Initial Pool"} className="md:col-span-2">
                <select
                  value={form.pool_code}
                  onChange={(event) => setForm((current) => ({ ...current, pool_code: event.target.value }))}
                  className="ticket-input"
                >
                  {poolOptions.map((poolCode) => (
                    <option key={poolCode} value={poolCode}>
                      {poolCode}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={language === "zh" ? "关联告警 ID" : "Related Alert IDs"} className="md:col-span-2">
              <textarea
                rows={4}
                value={form.alarm_ids_text}
                onChange={(event) => setForm((current) => ({ ...current, alarm_ids_text: event.target.value }))}
                placeholder={
                  language === "zh"
                    ? "每行一个告警 ID，或使用逗号分隔。"
                    : "One alert ID per line, or separate with commas."
                }
                className="ticket-input resize-none"
              />
            </Field>

            <Field label={language === "zh" ? "工单上下文（Markdown）" : "Ticket Context (Markdown)"} className="md:col-span-2">
              <textarea
                rows={8}
                value={form.context_markdown}
                onChange={(event) => setForm((current) => ({ ...current, context_markdown: event.target.value }))}
                placeholder={
                  language === "zh"
                    ? "输入本工单的扩展上下文，支持 Markdown。"
                    : "Enter ticket context in Markdown."
                }
                className="ticket-input resize-none"
              />
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {language === "zh"
                ? "创建后工单将进入待响应状态，并生成操作留痕。"
                : "The ticket will start in waiting-response status and an audit action will be recorded."}
            </span>
            <div className="flex items-center gap-3">
              <Link
                to="/tickets"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {language === "zh" ? "取消" : "Cancel"}
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t("common.loading") : language === "zh" ? "提交工单" : "Create Ticket"}
              </button>
            </div>
          </div>
        </form>

        <aside className="space-y-6">
          <SummaryCard
            icon={<ClipboardList className="h-4 w-4" />}
            title={language === "zh" ? "创建规则" : "Creation Rules"}
            body={
              language === "zh"
                ? "客户创建时来源固定为 CUSTOMER；内部手工创建时来源固定为 INTERNAL，来源字段不允许前端自由修改。"
                : "Customer-created tickets are always marked CUSTOMER; internal manual tickets are always INTERNAL."
            }
          />
          <SummaryCard
            icon={<CircleUserRound className="h-4 w-4" />}
            title={language === "zh" ? "责任归属" : "Ownership"}
            body={
              isCustomer
                ? language === "zh"
                  ? "客户提交后默认进入待响应，责任层级默认为 T1，由内部团队后续接手。"
                  : "Customer tickets enter waiting-response state and default to T1 ownership for internal follow-up."
                : language === "zh"
                  ? "内部用户创建时只决定初始进入哪个池子，工单创建后不直接归属个人。"
                  : "Internal creation only selects the initial pool. New tickets do not go directly to an individual owner."
            }
          />
          <SummaryCard
            icon={<Inbox className="h-4 w-4" />}
            title={language === "zh" ? "池子模式" : "Pool Mode"}
            body={
              language === "zh"
                ? "工单在池中时当前处理人为空；被领取后会填写当前处理人，但原池子仍保留。"
                : "When a ticket is in a pool, the assignee stays empty. Claiming fills the assignee while keeping the original pool."
            }
          />
          <SummaryCard
            icon={<ShieldAlert className="h-4 w-4" />}
            title={language === "zh" ? "风险与 SLA" : "Risk and SLA"}
            body={
              language === "zh"
                ? "风险分数由创建时输入，系统会按优先级自动计算响应与处置 SLA。"
                : "Risk score is provided at creation time, while the system computes response and resolution SLA from priority."
            }
          />
        </aside>
      </div>

      {error && (
        <div className="fixed right-6 bottom-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm text-slate-600 dark:text-slate-300 ${className}`}>
      <span className="mb-2 block font-medium">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({
  icon,
  title,
  body
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          {icon}
        </span>
        {title}
      </div>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p>
    </div>
  );
}
