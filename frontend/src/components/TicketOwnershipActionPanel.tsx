import type { InternalTicketUser } from "../types/ticket";

type OwnershipActionMode = "assign" | "escalate_user" | "escalate_pool";

interface TicketOwnershipActionPanelProps {
  mode: OwnershipActionMode;
  language: "zh" | "en";
  targetUsers: InternalTicketUser[];
  targetUserId: string;
  note: string;
  submitting: boolean;
  errorMessage: string;
  targetPoolCode: string | null;
  onTargetUserChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function TicketOwnershipActionPanel({
  mode,
  language,
  targetUsers,
  targetUserId,
  note,
  submitting,
  errorMessage,
  targetPoolCode,
  onTargetUserChange,
  onNoteChange,
  onCancel,
  onSubmit,
}: TicketOwnershipActionPanelProps) {
  const isUserMode = mode === "assign" || mode === "escalate_user";
  const title =
    mode === "assign"
      ? language === "zh"
        ? "管理员直接分配"
        : "Direct Assignment"
      : mode === "escalate_user"
        ? language === "zh"
          ? "升级给指定用户"
          : "Escalate to User"
        : language === "zh"
          ? "升级到上一级池子"
          : "Escalate to Pool";

  const description =
    mode === "assign"
      ? language === "zh"
        ? "该操作会立即生效，工单会脱离池子并直接归属目标用户。"
        : "This takes effect immediately and moves the ticket directly to the selected user."
      : mode === "escalate_user"
        ? language === "zh"
          ? "该操作会向目标用户发送必须处理的通知，等待对方接受或拒绝。"
          : "This sends an action-required notification to the target user and waits for accept/reject."
        : language === "zh"
          ? "该操作不需要确认，会立即把工单切换到上一级池子。"
          : "This requires no confirmation and immediately moves the ticket to the next pool.";

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isUserMode ? (
          <label className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-2 block font-medium">{language === "zh" ? "目标用户" : "Target User"}</span>
            <select
              value={targetUserId}
              onChange={(event) => onTargetUserChange(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">{language === "zh" ? "请选择目标用户" : "Select a target user"}</option>
              {targetUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} ({user.highest_role_code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="block text-sm text-slate-600 dark:text-slate-300">
            <span className="mb-2 block font-medium">{language === "zh" ? "目标池子" : "Target Pool"}</span>
            <div className="flex h-12 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {targetPoolCode ?? (language === "zh" ? "当前层级无可升级池子" : "No higher pool available")}
            </div>
          </div>
        )}

        <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
          <span className="mb-2 block font-medium">{language === "zh" ? "备注" : "Note"}</span>
          <textarea
            rows={4}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={
              language === "zh"
                ? "填写本次分配或升级的补充说明，可留空。"
                : "Add optional context for this assignment or escalation."
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {language === "zh" ? "取消" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || (isUserMode && !targetUserId) || (!isUserMode && !targetPoolCode)}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (language === "zh" ? "提交中" : "Submitting") : language === "zh" ? "确认提交" : "Submit"}
        </button>
      </div>
    </section>
  );
}
