from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    NotificationCreateRequest,
    NotificationListResponse,
    NotificationMutationResponse,
    NotificationSummaryResponse,
)
from .service import (
    NotificationOperationError,
    create_notification,
    list_notifications,
    mark_notification_read,
)

realtime_router = APIRouter(tags=["realtime"])


@realtime_router.get(
    "/api/v1/notifications", response_model=NotificationListResponse
)
def notification_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    status: str | None = None,
) -> NotificationListResponse:
    try:
        items, total_count, unread_count = list_notifications(
            db, actor, status=status
        )
    except NotificationOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return NotificationListResponse(
        items=[NotificationSummaryResponse.model_validate(item) for item in items],
        total_count=total_count,
        unread_count=unread_count,
    )


@realtime_router.post(
    "/api/v1/notifications",
    response_model=NotificationMutationResponse,
    dependencies=[Depends(require_csrf)],
)
def notification_create(
    payload: NotificationCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> NotificationMutationResponse:
    try:
        notification, unread_count = create_notification(
            db,
            actor,
            user_id=payload.user_id,
            category=payload.category,
            title=payload.title,
            content=payload.content,
            related_resource_type=payload.related_resource_type,
            related_resource_id=payload.related_resource_id,
            expire_at=payload.expire_at,
        )
    except NotificationOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return NotificationMutationResponse(
        notification=NotificationSummaryResponse.model_validate(notification),
        unread_count=unread_count,
    )


@realtime_router.post(
    "/api/v1/notifications/{notification_id}/read",
    response_model=NotificationMutationResponse,
    dependencies=[Depends(require_csrf)],
)
def notification_read(
    notification_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> NotificationMutationResponse:
    try:
        notification, unread_count = mark_notification_read(
            db, actor, notification_id
        )
    except NotificationOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return NotificationMutationResponse(
        notification=NotificationSummaryResponse.model_validate(notification),
        unread_count=unread_count,
    )
