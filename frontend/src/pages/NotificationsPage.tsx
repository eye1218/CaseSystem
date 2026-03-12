import { Bell, CheckCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../contexts/LanguageContext";
import { useRealtime } from "../contexts/RealtimeContext";
import type { NotificationSummary } from "../types/notification";
import { formatApiDateTime } from "../utils/datetime";

function statusTone(status: NotificationSummary["status"]) {
  switch (status) {
    case "read":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "delivered":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
  }
}

export default function NotificationsPage() {
  const { language, t } = useLanguage();
  const { notifications, unreadCount, refreshNotifications, markAsRead, realtimeStatus } = useRealtime();
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        await refreshNotifications();
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
  }, [refreshNotifications]);

  const handleRead = async (notificationId: string) => {
    setSubmittingId(notificationId);
    try {
      await markAsRead(notificationId);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={language === "zh" ? "未读通知" : "Unread Notifications"}
          value={String(unreadCount)}
          subtitle={language === "zh" ? "任意标签页已读后会同步更新" : "Read state syncs across tabs"}
        />
        <MetricCard
          title={language === "zh" ? "总通知数" : "Total Notifications"}
          value={String(notifications.length)}
          subtitle={language === "zh" ? "通知只保留用户级状态" : "Notification state is tracked per user"}
        />
        <MetricCard
          title={language === "zh" ? "实时连接" : "Realtime Status"}
          value={
            realtimeStatus === "connected"
              ? language === "zh"
                ? "已连接"
                : "Connected"
              : realtimeStatus === "connecting"
                ? language === "zh"
                  ? "连接中"
                  : "Connecting"
                : realtimeStatus === "error"
                  ? language === "zh"
                    ? "异常"
                    : "Error"
                  : language === "zh"
                    ? "未连接"
                    : "Disconnected"
          }
          subtitle={language === "zh" ? "Socket.IO 通道状态" : "Socket.IO channel status"}
        />
      </section>

      <section className="min-h-0 rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("nav.notifications")}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === "zh"
                  ? "通知支持离线补推、送达确认和显式已读。"
                  : "Notifications support offline replay, delivery ACK, and explicit read state."}
              </p>
            </div>
          </div>

          <button
            onClick={() => void refreshNotifications()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            {language === "zh" ? "刷新" : "Refresh"}
          </button>
        </div>

        <div className="max-h-[calc(100vh-20rem)] overflow-auto px-5 py-5">
          {loading ? (
            <div className="py-10 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-sm text-slate-500 dark:text-slate-400">{t("common.noData")}</div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => {
                const relatedTicketPath =
                  notification.related_resource_type === "ticket" && notification.related_resource_id
                    ? `/tickets/${notification.related_resource_id}`
                    : null;

                return (
                  <article
                    key={notification.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{notification.title}</span>
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusTone(notification.status)}`}>
                            {notification.status}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.content}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                        <div>{formatApiDateTime(notification.created_at, language)}</div>
                        <div className="mt-1 font-mono text-[11px]">{notification.category}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {notification.read_at
                          ? `${language === "zh" ? "已读于" : "Read at"} ${formatApiDateTime(notification.read_at, language)}`
                          : notification.delivered_at
                            ? `${language === "zh" ? "已送达于" : "Delivered at"} ${formatApiDateTime(notification.delivered_at, language)}`
                            : language === "zh"
                              ? "等待送达确认"
                              : "Waiting for delivery ACK"}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {relatedTicketPath && (
                          <Link
                            to={relatedTicketPath}
                            onClick={() => {
                              if (notification.status !== "read") {
                                void handleRead(notification.id);
                              }
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {language === "zh" ? "打开关联工单" : "Open Ticket"}
                          </Link>
                        )}
                        <button
                          onClick={() => void handleRead(notification.id)}
                          disabled={notification.status === "read" || submittingId === notification.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCheck className="h-4 w-4" />
                          {notification.status === "read"
                            ? language === "zh"
                              ? "已读"
                              : "Read"
                            : submittingId === notification.id
                              ? t("common.loading")
                              : language === "zh"
                                ? "标记已读"
                                : "Mark Read"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle
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
