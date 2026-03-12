from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...config import Settings
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    TaskInstanceDetailResponse,
    TaskInstanceListResponse,
    TaskTemplateCreateRequest,
    TaskTemplateListResponse,
    TaskTemplateStatusRequest,
    TaskTemplateSummaryResponse,
    TaskTemplateUpdateRequest,
)
from .service import (
    TaskOperationError,
    create_task_template,
    get_task_detail,
    get_task_template,
    list_task_templates,
    list_tasks,
    retry_task,
    update_task_template,
    update_task_template_status,
)

task_router = APIRouter(tags=["tasks"])


def _raise_as_http(exc: TaskOperationError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def get_app_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


@task_router.get("/api/v1/task-templates", response_model=TaskTemplateListResponse)
def task_template_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskTemplateListResponse:
    try:
        payload = list_task_templates(db, actor)
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskTemplateListResponse.model_validate(payload)


@task_router.post(
    "/api/v1/task-templates",
    response_model=TaskTemplateSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def task_template_create(
    payload: TaskTemplateCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskTemplateSummaryResponse:
    try:
        detail = create_task_template(
            db,
            actor,
            name=payload.name,
            task_type=payload.task_type,
            reference_template_id=payload.reference_template_id,
            status=payload.status,
            recipient_config=payload.recipient_config.model_dump(),
            target_config=payload.target_config,
            description=payload.description,
        )
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskTemplateSummaryResponse.model_validate(detail)


@task_router.get("/api/v1/tasks", response_model=TaskInstanceListResponse)
def task_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    task_type: str | None = None,
    status: str | None = None,
    source_event_id: str | None = None,
    task_template_id: str | None = None,
    ticket_id: int | None = None,
    failed_only: bool = False,
) -> TaskInstanceListResponse:
    try:
        payload = list_tasks(
            db,
            actor,
            search=search,
            task_type=task_type,
            status=status,
            source_event_id=source_event_id,
            task_template_id=task_template_id,
            ticket_id=ticket_id,
            failed_only=failed_only,
        )
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskInstanceListResponse.model_validate(payload)


@task_router.get("/api/v1/tasks/{task_instance_id}", response_model=TaskInstanceDetailResponse)
def task_detail(
    task_instance_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskInstanceDetailResponse:
    try:
        payload = get_task_detail(db, actor, task_instance_id)
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskInstanceDetailResponse.model_validate(payload)


@task_router.post(
    "/api/v1/tasks/{task_instance_id}/retry",
    response_model=TaskInstanceDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def task_retry(
    task_instance_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> TaskInstanceDetailResponse:
    try:
        payload = retry_task(db, settings, actor, task_instance_id=task_instance_id)
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskInstanceDetailResponse.model_validate(payload)


@task_router.get(
    "/api/v1/task-templates/{task_template_id}",
    response_model=TaskTemplateSummaryResponse,
)
def task_template_detail(
    task_template_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskTemplateSummaryResponse:
    try:
        detail = get_task_template(db, actor, task_template_id)
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskTemplateSummaryResponse.model_validate(detail)


@task_router.patch(
    "/api/v1/task-templates/{task_template_id}",
    response_model=TaskTemplateSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def task_template_update(
    task_template_id: str,
    payload: TaskTemplateUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskTemplateSummaryResponse:
    try:
        detail = update_task_template(
            db,
            actor,
            task_template_id=task_template_id,
            name=payload.name,
            reference_template_id=payload.reference_template_id,
            recipient_config=payload.recipient_config.model_dump() if payload.recipient_config else None,
            target_config=payload.target_config,
            description=payload.description,
        )
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskTemplateSummaryResponse.model_validate(detail)


@task_router.post(
    "/api/v1/task-templates/{task_template_id}/status",
    response_model=TaskTemplateSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def task_template_status_update(
    task_template_id: str,
    payload: TaskTemplateStatusRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskTemplateSummaryResponse:
    try:
        detail = update_task_template_status(
            db,
            actor,
            task_template_id=task_template_id,
            status=payload.status,
        )
    except TaskOperationError as exc:
        _raise_as_http(exc)
    return TaskTemplateSummaryResponse.model_validate(detail)
