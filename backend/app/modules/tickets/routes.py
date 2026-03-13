from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    InternalTicketUserListResponse,
    InternalTicketUserResponse,
    TicketAssignRequest,
    TicketActionCommandRequest,
    TicketCommentCreateRequest,
    TicketCreateRequest,
    TicketDetailResponse,
    TicketEscalateToPoolRequest,
    TicketEscalateToUserRequest,
    TicketEscalationRejectRequest,
    TicketLiveResponse,
    TicketListResponse,
    TicketSummaryResponse,
    TicketUpdateRequest,
)
from .service import (
    TicketOperationError,
    add_ticket_comment,
    accept_ticket_escalation,
    assign_ticket,
    create_ticket,
    escalate_ticket_to_pool,
    escalate_ticket_to_user,
    execute_ticket_action,
    get_report_download,
    get_ticket,
    get_ticket_detail,
    get_ticket_live,
    get_ticket_summary,
    list_internal_ticket_users,
    reject_ticket_escalation,
    list_tickets,
    update_ticket_detail,
)

ticket_router = APIRouter(tags=["tickets"])


def parse_created_range(
    value: str | None, *, end_of_day: bool = False
) -> datetime | None:
    if not value:
        return None
    if len(value) == 10:
        suffix = "23:59:59" if end_of_day else "00:00:00"
        return datetime.fromisoformat(f"{value}T{suffix}")
    return datetime.fromisoformat(value)


@ticket_router.get("/api/v1/tickets", response_model=TicketListResponse)
def ticket_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    ticket_id: str | None = None,
    category_id: str | None = None,
    priority: str | None = None,
    main_status: str | None = None,
    sub_status: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    sort_by: str = "id",
    sort_dir: str = "desc",
) -> TicketListResponse:
    items, total_count = list_tickets(
        db,
        actor,
        ticket_id=ticket_id,
        category_id=category_id,
        priority=priority,
        main_status=main_status,
        sub_status=sub_status,
        created_from=parse_created_range(created_from),
        created_to=parse_created_range(created_to, end_of_day=True),
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return TicketListResponse(
        items=[TicketSummaryResponse.model_validate(item) for item in items],
        total_count=total_count,
    )


@ticket_router.post(
    "/api/v1/tickets",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_create(
    payload: TicketCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = create_ticket(
            db,
            actor,
            title=payload.title,
            description=payload.description,
            category_id=payload.category_id,
            priority=payload.priority,
            risk_score=payload.risk_score,
            assignment_mode=payload.assignment_mode,
            pool_code=payload.pool_code,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.get(
    "/api/v1/tickets/internal-target-users",
    response_model=InternalTicketUserListResponse,
)
def ticket_internal_target_users(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> InternalTicketUserListResponse:
    try:
        items = list_internal_ticket_users(db, actor)
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InternalTicketUserListResponse(
        items=[InternalTicketUserResponse.model_validate(item) for item in items]
    )


@ticket_router.get("/api/v1/tickets/{ticket_id}", response_model=TicketSummaryResponse)
def ticket_detail(
    ticket_id: int,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketSummaryResponse:
    ticket = get_ticket_summary(db, actor, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return TicketSummaryResponse.model_validate(ticket)


@ticket_router.get(
    "/api/v1/tickets/{ticket_id}/detail", response_model=TicketDetailResponse
)
def ticket_detail_rich(
    ticket_id: int,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    detail = get_ticket_detail(db, actor, ticket_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return TicketDetailResponse.model_validate(detail)


@ticket_router.get("/api/v1/tickets/{ticket_id}/live", response_model=TicketLiveResponse)
def ticket_detail_live(
    ticket_id: int,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketLiveResponse:
    detail = get_ticket_live(db, actor, ticket_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return TicketLiveResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/tickets/{ticket_id}/comments",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_add_comment(
    ticket_id: int,
    payload: TicketCommentCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = add_ticket_comment(
            db,
            actor,
            ticket_id,
            payload.content,
            payload.visibility,
            payload.version,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.patch(
    "/api/v1/tickets/{ticket_id}",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_update(
    ticket_id: int,
    payload: TicketUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = update_ticket_detail(
            db,
            actor,
            ticket_id,
            expected_version=payload.version,
            title=payload.title,
            description=payload.description,
            category_id=payload.category_id,
            priority=payload.priority,
            risk_score=payload.risk_score,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/tickets/{ticket_id}/actions/{action}",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_action(
    ticket_id: int,
    action: str,
    payload: TicketActionCommandRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = execute_ticket_action(
            db,
            actor,
            ticket_id,
            action,
            payload.version,
            payload.note,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/tickets/{ticket_id}/assign",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_assign(
    ticket_id: int,
    payload: TicketAssignRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = assign_ticket(
            db,
            actor,
            ticket_id,
            expected_version=payload.version,
            target_user_id=payload.target_user_id,
            note=payload.note,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/tickets/{ticket_id}/escalate-to-pool",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_escalate_to_pool(
    ticket_id: int,
    payload: TicketEscalateToPoolRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = escalate_ticket_to_pool(
            db,
            actor,
            ticket_id,
            expected_version=payload.version,
            note=payload.note,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/tickets/{ticket_id}/escalate-to-user",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_escalate_to_user(
    ticket_id: int,
    payload: TicketEscalateToUserRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = escalate_ticket_to_user(
            db,
            actor,
            ticket_id,
            expected_version=payload.version,
            target_user_id=payload.target_user_id,
            note=payload.note,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/ticket-escalations/{escalation_id}/accept",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_escalation_accept(
    escalation_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = accept_ticket_escalation(db, actor, escalation_id)
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.post(
    "/api/v1/ticket-escalations/{escalation_id}/reject",
    response_model=TicketDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def ticket_escalation_reject(
    escalation_id: str,
    payload: TicketEscalationRejectRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketDetailResponse:
    try:
        detail = reject_ticket_escalation(
            db,
            actor,
            escalation_id,
            reason=payload.reason,
        )
    except TicketOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketDetailResponse.model_validate(detail)


@ticket_router.get("/api/v1/tickets/{ticket_id}/reports/{report_id}/download")
def ticket_report_download(
    ticket_id: int,
    report_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    lang: str = "zh",
) -> Response:
    report = get_report_download(db, actor, ticket_id, report_id, lang)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    filename, content = report
    return Response(
        content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
