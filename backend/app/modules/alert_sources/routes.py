from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    AlertSourceCreateRequest,
    AlertSourceListResponse,
    AlertSourceQueryRequest,
    AlertSourceQueryResponse,
    AlertSourceStatusRequest,
    AlertSourceSummaryResponse,
    AlertSourceTestResponse,
    AlertSourceUpdateRequest,
)
from .service import (
    AlertSourceOperationError,
    create_alert_source,
    get_alert_source,
    list_alert_sources,
    query_alert_source_by_tickets,
    test_alert_source,
    update_alert_source,
    update_alert_source_status,
)


alert_source_router = APIRouter(tags=["alert-sources"])


def _raise_as_http(exc: AlertSourceOperationError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@alert_source_router.get("/api/v1/alert-sources", response_model=AlertSourceListResponse)
def alert_source_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    status: str | None = None,
) -> AlertSourceListResponse:
    try:
        payload = list_alert_sources(db, actor, search=search, status=status)
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceListResponse.model_validate(payload)


@alert_source_router.post(
    "/api/v1/alert-sources",
    response_model=AlertSourceSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def alert_source_create(
    payload: AlertSourceCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> AlertSourceSummaryResponse:
    try:
        item = create_alert_source(
            db,
            actor,
            name=payload.name,
            host=payload.host,
            port=payload.port,
            username=payload.username,
            password=payload.password,
            database_name=payload.database_name,
            table_name=payload.table_name,
            ticket_match_field=payload.ticket_match_field,
            status=payload.status,
        )
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceSummaryResponse.model_validate(item)


@alert_source_router.get(
    "/api/v1/alert-sources/{source_id}",
    response_model=AlertSourceSummaryResponse,
)
def alert_source_detail(
    source_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> AlertSourceSummaryResponse:
    try:
        item = get_alert_source(db, actor, source_id)
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceSummaryResponse.model_validate(item)


@alert_source_router.patch(
    "/api/v1/alert-sources/{source_id}",
    response_model=AlertSourceSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def alert_source_update(
    source_id: str,
    payload: AlertSourceUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> AlertSourceSummaryResponse:
    try:
        item = update_alert_source(
            db,
            actor,
            source_id=source_id,
            name=payload.name,
            host=payload.host,
            port=payload.port,
            username=payload.username,
            password=payload.password,
            database_name=payload.database_name,
            table_name=payload.table_name,
            ticket_match_field=payload.ticket_match_field,
            status=payload.status,
        )
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceSummaryResponse.model_validate(item)


@alert_source_router.post(
    "/api/v1/alert-sources/{source_id}/status",
    response_model=AlertSourceSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def alert_source_status_update(
    source_id: str,
    payload: AlertSourceStatusRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> AlertSourceSummaryResponse:
    try:
        item = update_alert_source_status(db, actor, source_id=source_id, status=payload.status)
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceSummaryResponse.model_validate(item)


@alert_source_router.post(
    "/api/v1/alert-sources/{source_id}/test",
    response_model=AlertSourceTestResponse,
    dependencies=[Depends(require_csrf)],
)
def alert_source_test(
    source_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> AlertSourceTestResponse:
    try:
        payload = test_alert_source(db, actor, source_id=source_id)
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceTestResponse.model_validate(payload)


@alert_source_router.post(
    "/api/v1/alert-sources/{source_id}/query",
    response_model=AlertSourceQueryResponse,
    dependencies=[Depends(require_csrf)],
)
def alert_source_query(
    source_id: str,
    payload: AlertSourceQueryRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> AlertSourceQueryResponse:
    try:
        result = query_alert_source_by_tickets(
            db,
            actor,
            source_id=source_id,
            ticket_keys=payload.ticket_keys,
        )
    except AlertSourceOperationError as exc:
        _raise_as_http(exc)
    return AlertSourceQueryResponse.model_validate(result)

