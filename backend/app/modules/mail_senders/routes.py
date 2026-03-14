from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...config import Settings
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    MailSenderCreateRequest,
    MailSenderListResponse,
    MailSenderStatusRequest,
    MailSenderSummaryResponse,
    MailSenderTestRequest,
    MailSenderTestResponse,
    MailSenderUpdateRequest,
)
from .service import (
    MailSenderOperationError,
    create_mail_sender,
    get_mail_sender,
    list_mail_senders,
    test_mail_sender,
    update_mail_sender,
    update_mail_sender_status,
)

mail_sender_router = APIRouter(tags=["mail-senders"])


def _raise_as_http(exc: MailSenderOperationError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def get_app_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


@mail_sender_router.get("/api/v1/mail-senders", response_model=MailSenderListResponse)
def mail_sender_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    status: str | None = None,
) -> MailSenderListResponse:
    try:
        payload = list_mail_senders(db, actor, search=search, status=status)
    except MailSenderOperationError as exc:
        _raise_as_http(exc)
    return MailSenderListResponse.model_validate(payload)


@mail_sender_router.post(
    "/api/v1/mail-senders",
    response_model=MailSenderSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def mail_sender_create(
    payload: MailSenderCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> MailSenderSummaryResponse:
    try:
        item = create_mail_sender(
            db,
            actor,
            sender_name=payload.sender_name,
            sender_email=payload.sender_email,
            auth_account=payload.auth_account,
            auth_password=payload.auth_password,
            smtp_host=payload.smtp_host,
            smtp_port=payload.smtp_port,
            security_type=payload.security_type,
            status=payload.status,
        )
    except MailSenderOperationError as exc:
        _raise_as_http(exc)
    return MailSenderSummaryResponse.model_validate(item)


@mail_sender_router.get(
    "/api/v1/mail-senders/{sender_id}", response_model=MailSenderSummaryResponse
)
def mail_sender_detail(
    sender_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> MailSenderSummaryResponse:
    try:
        item = get_mail_sender(db, actor, sender_id)
    except MailSenderOperationError as exc:
        _raise_as_http(exc)
    return MailSenderSummaryResponse.model_validate(item)


@mail_sender_router.patch(
    "/api/v1/mail-senders/{sender_id}",
    response_model=MailSenderSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def mail_sender_update(
    sender_id: str,
    payload: MailSenderUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> MailSenderSummaryResponse:
    try:
        item = update_mail_sender(
            db,
            actor,
            sender_id=sender_id,
            sender_name=payload.sender_name,
            sender_email=payload.sender_email,
            auth_account=payload.auth_account,
            auth_password=payload.auth_password,
            smtp_host=payload.smtp_host,
            smtp_port=payload.smtp_port,
            security_type=payload.security_type,
            status=payload.status,
        )
    except MailSenderOperationError as exc:
        _raise_as_http(exc)
    return MailSenderSummaryResponse.model_validate(item)


@mail_sender_router.post(
    "/api/v1/mail-senders/{sender_id}/status",
    response_model=MailSenderSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def mail_sender_status_update(
    sender_id: str,
    payload: MailSenderStatusRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> MailSenderSummaryResponse:
    try:
        item = update_mail_sender_status(
            db,
            actor,
            sender_id=sender_id,
            status=payload.status,
        )
    except MailSenderOperationError as exc:
        _raise_as_http(exc)
    return MailSenderSummaryResponse.model_validate(item)


@mail_sender_router.post(
    "/api/v1/mail-senders/{sender_id}/test",
    response_model=MailSenderTestResponse,
    dependencies=[Depends(require_csrf)],
)
def mail_sender_test_send(
    sender_id: str,
    payload: MailSenderTestRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> MailSenderTestResponse:
    try:
        result = test_mail_sender(
            db,
            settings,
            actor,
            sender_id=sender_id,
            test_email=payload.test_email,
        )
    except MailSenderOperationError as exc:
        _raise_as_http(exc)
    return MailSenderTestResponse.model_validate(result)
