import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

import * as authApi from "../api/auth";
import * as notificationApi from "../api/notifications";
import type {
  NotificationCreatedEvent,
  NotificationSummary,
  NotificationUpdatedEvent,
  TicketChangedEvent
} from "../types/notification";
import {
  loadSoundEnabledSetting,
  persistSoundEnabledSetting,
  playNotificationCreatedSound,
} from "../features/notifications/sound";
import {
  collectNewUnplayedNotifications,
  sortNotificationsByCreatedAt,
} from "../features/notifications/realtimePolling";
import { useAuth } from "./AuthContext";

type RealtimeStatus = "disconnected" | "connecting" | "connected" | "error";

interface RealtimeContextValue {
  notifications: NotificationSummary[];
  unreadCount: number;
  realtimeStatus: RealtimeStatus;
  soundEnabled: boolean;
  lastTicketEvent: TicketChangedEvent | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  toggleSoundEnabled: () => void;
  setSoundEnabled: (value: boolean) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);
const NOTIFICATION_POLL_INTERVAL_MS = 15_000;

function mapNotificationEvent(event: NotificationCreatedEvent): NotificationSummary {
  return {
    id: event.payload.notification_id,
    user_id: event.target.user_id,
    category: event.payload.category,
    title: event.payload.title,
    content: event.payload.content,
    related_resource_type: event.payload.related_resource.resource_type,
    related_resource_id: event.payload.related_resource.resource_id,
    status: event.payload.status,
    action_required: event.payload.action_required,
    action_type: event.payload.action_type,
    action_status: event.payload.action_status,
    action_payload: event.payload.action_payload,
    created_at: event.payload.created_at,
    delivered_at: null,
    read_at: null,
    expire_at: null
  };
}

function upsertNotification(
  notifications: NotificationSummary[],
  nextNotification: NotificationSummary
) {
  const remaining = notifications.filter((item) => item.id !== nextNotification.id);
  return sortNotificationsByCreatedAt([nextNotification, ...remaining]);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { authReady, isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => loadSoundEnabledSetting());
  const [lastTicketEvent, setLastTicketEvent] = useState<TicketChangedEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const playedNotificationIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);

  const refreshNotifications = useCallback(async () => {
    const payload = await notificationApi.listNotifications();
    setNotifications(sortNotificationsByCreatedAt(payload.items));
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    const payload = await notificationApi.markNotificationRead(notificationId);
    setNotifications((current) =>
      current.map((item) => (item.id === notificationId ? payload.notification : item))
    );
  }, []);

  const toggleSoundEnabled = useCallback(() => {
    setSoundEnabled((current) => !current);
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    persistSoundEnabledSetting(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (!isAuthenticated || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setNotifications([]);
      setRealtimeStatus("disconnected");
      setLastTicketEvent(null);
      playedNotificationIdsRef.current.clear();
      return;
    }

    let disposed = false;
    let socket: Socket | null = null;
    let pollTimer: number | undefined;
    let pollingInFlight = false;

    async function syncNotificationsWithServer() {
      if (pollingInFlight) {
        return;
      }
      pollingInFlight = true;
      try {
        const payload = await notificationApi.listNotifications();
        if (disposed) {
          return;
        }

        let discovered: NotificationSummary[] = [];
        const sortedItems = sortNotificationsByCreatedAt(payload.items);
        setNotifications((current) => {
          discovered = collectNewUnplayedNotifications(
            current,
            sortedItems,
            playedNotificationIdsRef.current,
          );
          return sortedItems;
        });
        if (discovered.length > 0) {
          for (const item of discovered) {
            playedNotificationIdsRef.current.add(item.id);
          }
          if (soundEnabledRef.current) {
            void playNotificationCreatedSound(discovered[0]);
          }
        }
      } catch {
        // Keep websocket as primary transport; polling is best-effort fallback.
      } finally {
        pollingInFlight = false;
      }
    }

    async function bootstrap() {
      setRealtimeStatus("connecting");
      try {
        const [notificationPayload, tokenPayload] = await Promise.all([
          notificationApi.listNotifications(),
          authApi.issueSocketToken()
        ]);
        if (disposed) {
          return;
        }

        setNotifications(sortNotificationsByCreatedAt(notificationPayload.items));
        socketRef.current?.disconnect();
        socket = io(window.location.origin, {
          path: "/socket.io",
          withCredentials: true,
          transports: ["websocket", "polling"],
          auth: { token: tokenPayload.token }
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          if (!disposed) {
            setRealtimeStatus("connected");
          }
        });

        socket.on("disconnect", () => {
          if (!disposed) {
            setRealtimeStatus("disconnected");
          }
        });

        socket.on("connect_error", () => {
          if (!disposed) {
            setRealtimeStatus("error");
          }
        });

        socket.on("ticket.changed", (event: TicketChangedEvent) => {
          if (!disposed) {
            setLastTicketEvent(event);
          }
        });

        socket.on("notification.created", (event: NotificationCreatedEvent) => {
          if (disposed) {
            return;
          }
          const notification = mapNotificationEvent(event);
          setNotifications((current) => upsertNotification(current, notification));
          if (!playedNotificationIdsRef.current.has(notification.id)) {
            playedNotificationIdsRef.current.add(notification.id);
            if (soundEnabledRef.current) {
              void playNotificationCreatedSound(notification);
            }
          }
          socket?.emit("notification.ack", { notification_id: notification.id });
        });

        socket.on("notification.updated", (event: NotificationUpdatedEvent) => {
          if (disposed) {
            return;
          }
          setNotifications((current) =>
            current.map((item) =>
              item.id === event.payload.notification_id
                ? {
                    ...item,
                    status: event.payload.status,
                    action_status: event.payload.action_status,
                    action_payload: event.payload.action_payload,
                    delivered_at: event.payload.delivered_at,
                    read_at: event.payload.read_at
                  }
                : item
            )
          );
        });

        pollTimer = window.setInterval(() => {
          void syncNotificationsWithServer();
        }, NOTIFICATION_POLL_INTERVAL_MS);
      } catch {
        if (!disposed) {
          setRealtimeStatus("error");
        }
      }
    }

    void bootstrap();

    return () => {
      disposed = true;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
      }
      socket?.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [authReady, isAuthenticated, user?.active_role, user?.id]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((item) => item.status !== "read").length,
      realtimeStatus,
      soundEnabled,
      lastTicketEvent,
      refreshNotifications,
      markAsRead,
      toggleSoundEnabled,
      setSoundEnabled
    }),
    [
      lastTicketEvent,
      markAsRead,
      notifications,
      realtimeStatus,
      refreshNotifications,
      soundEnabled,
      toggleSoundEnabled,
    ]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within RealtimeProvider");
  }
  return context;
}
