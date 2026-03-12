from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...enums import RoleCode
from ...security import utcnow
from .enums import NotificationStatus
from .models import UserNotification

logger = logging.getLogger(__name__)


class NotificationOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def build_ticket_changed_message(
    *,
    ticket_id: int,
    change_type: str,
    operator_user_id: str,
    occurred_at: datetime | None = None,
) -> dict[str, object]:
    timestamp = occurred_at or utcnow()
    return {
        "event_type": "ticket.changed",
        "message_id": str(uuid.uuid4()),
        "scope": "broadcast",
        "target": {"ticket_id": ticket_id},
        "payload": {
            "ticket_id": ticket_id,
            "change_type": change_type,
            "operator_user_id": operator_user_id,
            "occurred_at": timestamp.isoformat(),
        },
    }


def publish_ticket_changed(
    *,
    ticket_id: int,
    change_type: str,
    operator_user_id: str,
    customer_user_id: str | None = None,
    occurred_at: datetime | None = None,
) -> None:
    message = build_ticket_changed_message(
        ticket_id=ticket_id,
        change_type=change_type,
        operator_user_id=operator_user_id,
        occurred_at=occurred_at,
    )
    try:
        from .socket_server import emit_ticket_changed_sync

        emit_ticket_changed_sync(message, customer_user_id=customer_user_id)
    except Exception:
        logger.exception("Failed to publish ticket.changed message", extra=message)


def _require_admin_actor(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise NotificationOperationError(403, "Admin role required")


def count_unread_notifications(db: Session, *, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(UserNotification)
            .where(
                UserNotification.user_id == user_id,
                UserNotification.status != NotificationStatus.READ.value,
            )
        )
        or 0
    )


def build_notification_message(notification: UserNotification) -> dict[str, object]:
    return {
        "event_type": "notification.created",
        "message_id": notification.id,
        "scope": "user",
        "target": {"user_id": notification.user_id},
        "payload": {
            "notification_id": notification.id,
            "category": notification.category,
            "title": notification.title,
            "content": notification.content,
            "related_resource": {
                "resource_type": notification.related_resource_type,
                "resource_id": notification.related_resource_id,
            },
            "created_at": notification.created_at.isoformat(),
            "requires_ack": True,
            "requires_read": True,
            "status": notification.status,
        },
    }


def build_notification_update_message(
    notification: UserNotification, *, unread_count: int
) -> dict[str, object]:
    return {
        "event_type": "notification.updated",
        "message_id": str(uuid.uuid4()),
        "scope": "user",
        "target": {"user_id": notification.user_id},
        "payload": {
            "notification_id": notification.id,
            "status": notification.status,
            "delivered_at": notification.delivered_at.isoformat()
            if notification.delivered_at
            else None,
            "read_at": notification.read_at.isoformat() if notification.read_at else None,
            "unread_count": unread_count,
        },
    }


def get_pending_notifications(db: Session, *, user_id: str) -> list[UserNotification]:
    return list(
        db.scalars(
            select(UserNotification)
            .where(
                UserNotification.user_id == user_id,
                UserNotification.status == NotificationStatus.PENDING.value,
            )
            .order_by(UserNotification.created_at.asc())
        ).all()
    )


def list_notifications(
    db: Session,
    actor: ActorContext,
    *,
    status: str | None = None,
) -> tuple[list[UserNotification], int, int]:
    conditions = [UserNotification.user_id == actor.user_id]
    if status:
        conditions.append(UserNotification.status == status)

    items = list(
        db.scalars(
            select(UserNotification)
            .where(*conditions)
            .order_by(UserNotification.created_at.desc())
        ).all()
    )
    unread_count = count_unread_notifications(db, user_id=actor.user_id)
    return items, len(items), unread_count


def create_notification(
    db: Session,
    actor: ActorContext,
    *,
    user_id: str,
    category: str,
    title: str,
    content: str,
    related_resource_type: str | None,
    related_resource_id: str | int | None,
    expire_at: datetime | None,
) -> tuple[UserNotification, int]:
    _require_admin_actor(actor)

    notification = UserNotification(
        user_id=user_id,
        category=category,
        title=title,
        content=content,
        related_resource_type=related_resource_type,
        related_resource_id=str(related_resource_id)
        if related_resource_id is not None
        else None,
        status=NotificationStatus.PENDING.value,
        created_at=utcnow(),
        expire_at=expire_at,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    unread_count = count_unread_notifications(db, user_id=user_id)

    try:
        from .socket_server import emit_notification_created_sync, update_unread_count_cache

        update_unread_count_cache(user_id=user_id, unread_count=unread_count)
        emit_notification_created_sync(notification)
    except Exception:
        logger.exception(
            "Failed to emit notification.created message",
            extra={"notification_id": notification.id, "user_id": user_id},
        )

    return notification, unread_count


def acknowledge_notification(
    db: Session, *, user_id: str, notification_id: str
) -> tuple[UserNotification | None, int, bool]:
    notification = db.scalar(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == user_id,
        )
    )
    if notification is None:
        return None, 0, False

    changed = False
    if notification.status == NotificationStatus.PENDING.value:
        notification.status = NotificationStatus.DELIVERED.value
        notification.delivered_at = utcnow()
        db.commit()
        db.refresh(notification)
        changed = True

    unread_count = count_unread_notifications(db, user_id=user_id)
    if changed:
        try:
            from .socket_server import emit_notification_updated_sync, update_unread_count_cache

            update_unread_count_cache(user_id=user_id, unread_count=unread_count)
            emit_notification_updated_sync(notification, unread_count=unread_count)
        except Exception:
            logger.exception(
                "Failed to emit notification.updated message after ACK",
                extra={"notification_id": notification.id, "user_id": user_id},
            )

    return notification, unread_count, changed


def mark_notification_read(
    db: Session, actor: ActorContext, notification_id: str
) -> tuple[UserNotification, int]:
    notification = db.scalar(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.user_id == actor.user_id,
        )
    )
    if notification is None:
        raise NotificationOperationError(404, "Notification not found")

    if notification.status != NotificationStatus.READ.value:
        now = utcnow()
        notification.status = NotificationStatus.READ.value
        if notification.delivered_at is None:
            notification.delivered_at = now
        notification.read_at = now
        db.commit()
        db.refresh(notification)

    unread_count = count_unread_notifications(db, user_id=actor.user_id)
    try:
        from .socket_server import emit_notification_updated_sync, update_unread_count_cache

        update_unread_count_cache(user_id=actor.user_id, unread_count=unread_count)
        emit_notification_updated_sync(notification, unread_count=unread_count)
    except Exception:
        logger.exception(
            "Failed to emit notification.updated message after read",
            extra={"notification_id": notification.id, "user_id": actor.user_id},
        )

    return notification, unread_count
