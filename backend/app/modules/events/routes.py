from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    EventRuleCreateRequest,
    EventRuleDetailResponse,
    EventRuleListResponse,
    EventRuleStatusRequest,
    EventRuleSummaryResponse,
    EventRuleUpdateRequest,
    EventTaskTemplateListResponse,
    EventTaskTemplateResponse,
)
from .service import (
    EventOperationError,
    create_event_rule,
    delete_event_rule,
    get_event_rule,
    list_event_rules,
    list_task_templates,
    update_event_rule,
    update_event_rule_status,
)

event_router = APIRouter(tags=["events"])


def _raise_as_http(exc: EventOperationError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@event_router.get("/api/v1/events/task-templates", response_model=EventTaskTemplateListResponse)
def event_task_template_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
) -> EventTaskTemplateListResponse:
    try:
        items = list_task_templates(actor)
    except EventOperationError as exc:
        _raise_as_http(exc)

    return EventTaskTemplateListResponse(
        items=[EventTaskTemplateResponse.model_validate(item) for item in items]
    )


@event_router.get("/api/v1/events", response_model=EventRuleListResponse)
def event_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    trigger_point: str | None = None,
) -> EventRuleListResponse:
    try:
        items, total_count = list_event_rules(
            db,
            actor,
            search=search,
            event_type=event_type,
            status=status,
            trigger_point=trigger_point,
        )
    except EventOperationError as exc:
        _raise_as_http(exc)

    return EventRuleListResponse(
        items=[EventRuleSummaryResponse.model_validate(item) for item in items],
        total_count=total_count,
    )


@event_router.post(
    "/api/v1/events",
    response_model=EventRuleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_create(
    payload: EventRuleCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventRuleDetailResponse:
    try:
        detail = create_event_rule(db, actor, payload=payload.model_dump())
    except EventOperationError as exc:
        _raise_as_http(exc)
    return EventRuleDetailResponse.model_validate(detail)


@event_router.get("/api/v1/events/{event_id}", response_model=EventRuleDetailResponse)
def event_get(
    event_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventRuleDetailResponse:
    try:
        detail = get_event_rule(db, actor, event_id)
    except EventOperationError as exc:
        _raise_as_http(exc)
    return EventRuleDetailResponse.model_validate(detail)


@event_router.patch(
    "/api/v1/events/{event_id}",
    response_model=EventRuleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_update(
    event_id: str,
    payload: EventRuleUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventRuleDetailResponse:
    try:
        detail = update_event_rule(
            db,
            actor,
            event_id=event_id,
            payload=payload.model_dump(exclude_unset=True),
        )
    except EventOperationError as exc:
        _raise_as_http(exc)
    return EventRuleDetailResponse.model_validate(detail)


@event_router.post(
    "/api/v1/events/{event_id}/status",
    response_model=EventRuleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def event_status_update(
    event_id: str,
    payload: EventRuleStatusRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> EventRuleDetailResponse:
    try:
        detail = update_event_rule_status(
            db,
            actor,
            event_id=event_id,
            status=payload.status,
        )
    except EventOperationError as exc:
        _raise_as_http(exc)
    return EventRuleDetailResponse.model_validate(detail)


@event_router.delete(
    "/api/v1/events/{event_id}",
    status_code=204,
    dependencies=[Depends(require_csrf)],
)
def event_delete(
    event_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    try:
        delete_event_rule(db, actor, event_id=event_id)
    except EventOperationError as exc:
        _raise_as_http(exc)
    return Response(status_code=204)
