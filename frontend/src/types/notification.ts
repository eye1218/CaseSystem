export type NotificationStatus = "pending" | "delivered" | "read";

export interface NotificationSummary {
  id: string;
  user_id: string;
  category: string;
  title: string;
  content: string;
  related_resource_type: string | null;
  related_resource_id: string | null;
  status: NotificationStatus;
  action_required: boolean;
  action_type: string | null;
  action_status: string | null;
  action_payload: Record<string, unknown>;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  expire_at: string | null;
}

export interface NotificationListResponse {
  items: NotificationSummary[];
  total_count: number;
  unread_count: number;
}

export interface NotificationMutationResponse {
  notification: NotificationSummary;
  unread_count: number;
}

export interface TicketChangedEvent {
  event_type: "ticket.changed";
  message_id: string;
  scope: string;
  target: {
    ticket_id: number;
  };
  payload: {
    ticket_id: number;
    change_type: string;
    operator_user_id: string;
    occurred_at: string;
  };
}

export interface NotificationCreatedEvent {
  event_type: "notification.created";
  message_id: string;
  scope: string;
  target: {
    user_id: string;
  };
  payload: {
    notification_id: string;
    category: string;
    title: string;
    content: string;
    related_resource: {
      resource_type: string | null;
      resource_id: string | null;
    };
    created_at: string;
    requires_ack: boolean;
    requires_read: boolean;
    status: NotificationStatus;
    action_required: boolean;
    action_type: string | null;
    action_status: string | null;
    action_payload: Record<string, unknown>;
  };
}

export interface NotificationUpdatedEvent {
  event_type: "notification.updated";
  message_id: string;
  scope: string;
  target: {
    user_id: string;
  };
  payload: {
    notification_id: string;
    status: NotificationStatus;
    delivered_at: string | null;
    read_at: string | null;
    unread_count: number;
    action_status: string | null;
    action_payload: Record<string, unknown>;
  };
}
