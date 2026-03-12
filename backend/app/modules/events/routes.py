from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    EventBindingCreateRequest,
    EventDetailResponse,
    EventListResponse,
    EventRescheduleRequest,
    EventSummaryResponse,
    EventCreateRequest,
)
from .service import (
    EventOperationError,
    bind_event_task,
    cancel_event,
    create_event,
    early_trigger_event,
    get_event,
    list_events,
    reschedule_event,
)

event_router = APIRouter(tags=["events"])


@event_router.get("/api/v1/events", response_model=EventListResponse)
def event_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    status: str | None = None,
    event_type: str | None = None,
) -> EventListResponse:
    try:
        items, total_count = list_events(
            db, actor, status=status, event_type=event_type
        )
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventListResponse(
        items=[EventSummaryResponse.model_validate(item) for item in items],
        total_count=total_count,
    )


@event_router.post(
    "/api/v1/events",
    response_model=EventDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_create(
    payload: EventCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventDetailResponse:
    try:
        detail = create_event(
            db,
            actor,
            event_type=payload.event_type.value,
            trigger_time=payload.trigger_time,
            title=payload.title,
            description=payload.description,
            payload=payload.payload,
        )
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventDetailResponse.model_validate(detail)


@event_router.get("/api/v1/events/{event_id}", response_model=EventDetailResponse)
def event_get(
    event_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventDetailResponse:
    try:
        detail = get_event(db, actor, event_id)
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventDetailResponse.model_validate(detail)


@event_router.post(
    "/api/v1/events/{event_id}/bindings",
    response_model=EventDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_bind_task(
    event_id: str,
    payload: EventBindingCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventDetailResponse:
    try:
        detail = bind_event_task(
            db,
            actor,
            event_id=event_id,
            task_template_id=payload.task_template_id,
            payload=payload.payload,
        )
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventDetailResponse.model_validate(detail)


@event_router.post(
    "/api/v1/events/{event_id}/cancel",
    response_model=EventDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_cancel(
    event_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventDetailResponse:
    try:
        detail = cancel_event(db, actor, event_id)
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventDetailResponse.model_validate(detail)


@event_router.post(
    "/api/v1/events/{event_id}/reschedule",
    response_model=EventDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_reschedule(
    event_id: str,
    payload: EventRescheduleRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventDetailResponse:
    try:
        detail = reschedule_event(
            db,
            actor,
            event_id=event_id,
            trigger_time=payload.trigger_time,
        )
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventDetailResponse.model_validate(detail)


@event_router.post(
    "/api/v1/events/{event_id}/early-trigger",
    response_model=EventDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_early_trigger(
    event_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventDetailResponse:
    try:
        detail = early_trigger_event(db, actor, event_id)
    except EventOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return EventDetailResponse.model_validate(detail)
