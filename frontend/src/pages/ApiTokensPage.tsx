import { Copy, KeyRound, Plus, RefreshCw, ShieldOff, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { createApiToken, deleteApiToken, listApiTokens, revokeApiToken } from "../api/auth";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { copyToClipboard } from "../utils/clipboard";
import type { ApiToken, ApiTokenCreatedResponse } from "../types/apiToken";
import { formatApiDateTime } from "../utils/datetime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  return "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RawTokenBanner({
  rawToken,
  onDismiss,
  language,
}: {
  rawToken: string;
  onDismiss: () => void;
  language: "zh" | "en";
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(rawToken);
    if (success) {
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/30">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {language === "zh" ? "⚠️ 请立即复制你的 API Token，此值仅展示一次" : "⚠️ Copy your API token now — it won't be shown again"}
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {language === "zh"
              ? "关闭此提示后将无法再次查看原始 Token 值。"
              : "Once you close this banner the raw token value is gone."}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-amber-700 transition-colors hover:bg-amber-200 dark:text-amber-300 dark:hover:bg-amber-900/40"
          aria-label="dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-200">
        <span className="flex-1 select-all break-all">{rawToken}</span>
        <button
          onClick={() => void handleCopy()}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/60"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? (language === "zh" ? "已复制" : "Copied!") : (language === "zh" ? "复制" : "Copy")}
        </button>
      </div>
    </div>
  );
}

function CreateTokenModal({
  roles,
  onClose,
  onCreate,
  language,
}: {
  roles: string[];
  onClose: () => void;
  onCreate: (name: string, roleCode: string) => Promise<void>;
  language: "zh" | "en";
}) {
  const [name, setName] = useState("");
  const [roleCode, setRoleCode] = useState(roles[0] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !roleCode) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim(), roleCode);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {language === "zh" ? "创建 API Token" : "Create API Token"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {language === "zh" ? "名称" : "Name"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); }}
              placeholder={language === "zh" ? "例如：CI/CD 集成 Token" : "e.g. CI/CD Integration Token"}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950/60"
              required
              maxLength={128}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {language === "zh" ? "生效角色" : "Active Role"}
            </label>
            <select
              value={roleCode}
              onChange={(e) => { setRoleCode(e.target.value); }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950/60"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {language === "zh"
                ? "Token 将以该角色的权限访问 API"
                : "The token will call the API with this role's permissions"}
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {language === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? (language === "zh" ? "创建中..." : "Creating...")
                : (language === "zh" ? "创建" : "Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ApiTokensPage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<ApiTokenCreatedResponse | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await listApiTokens();
      setTokens(resp.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (name: string, activeRoleCode: string) => {
    const created = await createApiToken({ name, active_role_code: activeRoleCode });
    setNewlyCreated(created);
    await load();
  };

  const handleRevoke = async (tokenId: string) => {
    if (!window.confirm(
      language === "zh"
        ? "确认要吊销这个 Token？此操作不可撤销。"
        : "Are you sure you want to revoke this token? This cannot be undone."
    )) return;
    setRevoking(tokenId);
    setError(null);
    try {
      await revokeApiToken(tokenId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevoking(null);
    }
  };

  const handleDelete = async (tokenId: string) => {
    if (!window.confirm(
      language === "zh"
        ? "确认要永久删除这个 Token 记录？此操作不可撤销。"
        : "Are you sure you want to permanently delete this token record? This cannot be undone."
    )) return;
    setDeleting(tokenId);
    setError(null);
    try {
      await deleteApiToken(tokenId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(null);
    }
  };

  const activeCount = tokens.filter((t) => t.status === "active").length;
  const revokedCount = tokens.filter((t) => t.status !== "active").length;

  if (!user) return null;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Metric cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={language === "zh" ? "有效 Token" : "Active Tokens"}
          value={String(activeCount)}
          subtitle={language === "zh" ? "当前可用于 API 认证的 Token 数量" : "Tokens currently valid for API auth"}
        />
        <MetricCard
          title={language === "zh" ? "已吊销 Token" : "Revoked Tokens"}
          value={String(revokedCount)}
          subtitle={language === "zh" ? "已手动吊销，无法再认证" : "Manually revoked, no longer usable"}
        />
        <MetricCard
          title={language === "zh" ? "全部 Token" : "Total Tokens"}
          value={String(tokens.length)}
          subtitle={language === "zh" ? "包含有效与已吊销的所有 Token 记录" : "All token records including revoked"}
        />
      </section>

      {/* One-time raw token banner */}
      {newlyCreated && (
        <RawTokenBanner
          rawToken={newlyCreated.raw_token}
          onDismiss={() => { setNewlyCreated(null); }}
          language={language}
        />
      )}

      {/* Token list card */}
      <section className="min-h-0 rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Card header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {language === "zh" ? "我的 API Token" : "My API Tokens"}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === "zh"
                  ? "Token 以 Bearer 方式认证，前缀为 csk_"
                  : "Tokens use Bearer authentication with the csk_ prefix"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              {language === "zh" ? "刷新" : "Refresh"}
            </button>
            <button
              onClick={() => { setShowModal(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {language === "zh" ? "创建 Token" : "Create Token"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Usage hint */}
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {language === "zh"
              ? "用法：Authorization: Bearer csk_xxxxxxxxxxxxxxxx"
              : "Usage:  Authorization: Bearer csk_xxxxxxxxxxxxxxxx"}
          </p>
        </div>

        {/* Token list */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <div className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
              {t("common.loading")}
            </div>
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <KeyRound className="h-6 w-6" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === "zh" ? "暂无 Token，点击上方按钮创建一个" : "No tokens yet. Click the button above to create one."}
              </p>
            </div>
          ) : (
            tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                isRevoking={revoking === token.id}
                isDeleting={deleting === token.id}
                onRevoke={() => void handleRevoke(token.id)}
                onDelete={() => void handleDelete(token.id)}
                language={language}
              />
            ))
          )}
        </div>
      </section>

      {/* Create token modal */}
      {showModal && (
        <CreateTokenModal
          roles={user.roles}
          onClose={() => { setShowModal(false); }}
          onCreate={handleCreate}
          language={language}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token row
// ---------------------------------------------------------------------------

function TokenRow({
  token,
  isRevoking,
  isDeleting,
  onRevoke,
  onDelete,
  language,
}: {
  token: ApiToken;
  isRevoking: boolean;
  isDeleting: boolean;
  onRevoke: () => void;
  onDelete: () => void;
  language: "zh" | "en";
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-white">{token.name}</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(token.status)}`}
          >
            {token.status}
          </span>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            {token.active_role_code}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {language === "zh" ? "创建于" : "Created"}{" "}
            {formatApiDateTime(token.created_at, language)}
          </span>
          {token.last_used_at && (
            <span>
              {language === "zh" ? "最近使用" : "Last used"}{" "}
              {formatApiDateTime(token.last_used_at, language)}
            </span>
          )}
          {token.created_by && (
            <span>
              {language === "zh" ? "由" : "By"} {token.created_by}
            </span>
          )}
          <span className="font-mono text-[11px]">id: {token.id.slice(0, 8)}…</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {token.status === "active" && (
          <button
            onClick={onRevoke}
            disabled={isRevoking}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <ShieldOff className="h-4 w-4" />
            {isRevoking
              ? (language === "zh" ? "吊销中..." : "Revoking...")
              : (language === "zh" ? "吊销" : "Revoke")}
          </button>
        )}
        {token.status !== "active" && (
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting
              ? (language === "zh" ? "删除中..." : "Deleting...")
              : (language === "zh" ? "删除" : "Delete")}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</div>
    </div>
  );
}
