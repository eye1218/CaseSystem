from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth
from .schemas import AuditLogListResponse, AuditTicketListResponse
from .service import AuditOperationError, list_audit_tickets, list_ticket_audit_logs


audit_router = APIRouter(tags=["audit"])


@audit_router.get("/api/v1/audit/tickets", response_model=AuditTicketListResponse)
def audit_ticket_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    action_type: str | None = None,
    actor_name: str | None = Query(default=None, alias="actor"),
    visibility: str | None = None,
    main_status: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    sort_by: str = "last_event_at",
    sort_dir: str = "desc",
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AuditTicketListResponse:
    try:
        payload = list_audit_tickets(
            db,
            actor,
            search=search,
            action_type=action_type,
            actor_name=actor_name,
            visibility=visibility,
            main_status=main_status,
            created_from=created_from,
            created_to=created_to,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except AuditOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return AuditTicketListResponse.model_validate(payload)


@audit_router.get("/api/v1/audit/tickets/{ticket_id}/logs", response_model=AuditLogListResponse)
def audit_ticket_logs(
    ticket_id: int,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    action_type: str | None = None,
    actor_name: str | None = Query(default=None, alias="actor"),
    visibility: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    sort_dir: str = "desc",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AuditLogListResponse:
    try:
        payload = list_ticket_audit_logs(
            db,
            actor,
            ticket_id=ticket_id,
            search=search,
            action_type=action_type,
            actor_name=actor_name,
            visibility=visibility,
            created_from=created_from,
            created_to=created_to,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except AuditOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return AuditLogListResponse.model_validate(payload)
