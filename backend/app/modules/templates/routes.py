from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    TemplateCreateRequest,
    TemplateDetailResponse,
    TemplateListResponse,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateRenderRequest,
    TemplateRenderResponse,
    TemplateStatusUpdateRequest,
    TemplateSummaryResponse,
    TemplateTypeListResponse,
    TemplateUpdateRequest,
)
from .service import (
    TemplateOperationError,
    create_template,
    get_template,
    list_template_types,
    list_templates,
    preview_template,
    render_template,
    update_template,
    update_template_status,
)

template_router = APIRouter(tags=["templates"])


@template_router.get("/api/v1/template-types", response_model=TemplateTypeListResponse)
def template_type_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
) -> TemplateTypeListResponse:
    try:
        return TemplateTypeListResponse.model_validate(list_template_types(actor))
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@template_router.get("/api/v1/templates", response_model=TemplateListResponse)
def template_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    template_type: str | None = None,
    status: str | None = None,
    search: str | None = None,
) -> TemplateListResponse:
    try:
        items, total_count = list_templates(
            db,
            actor,
            template_type=template_type,
            status=status,
            search=search,
        )
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return TemplateListResponse(
        items=[TemplateSummaryResponse.model_validate(item) for item in items],
        total_count=total_count,
    )


@template_router.post(
    "/api/v1/templates",
    response_model=TemplateDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def template_create(
    payload: TemplateCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TemplateDetailResponse:
    try:
        detail = create_template(
            db,
            actor,
            name=payload.name,
            code=payload.code,
            template_type=payload.template_type.value,
            description=payload.description,
            fields=payload.fields,
        )
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TemplateDetailResponse.model_validate(detail)


@template_router.get("/api/v1/templates/{template_id}", response_model=TemplateDetailResponse)
def template_get(
    template_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TemplateDetailResponse:
    try:
        detail = get_template(db, actor, template_id)
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TemplateDetailResponse.model_validate(detail)


@template_router.patch(
    "/api/v1/templates/{template_id}",
    response_model=TemplateDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def template_update(
    template_id: str,
    payload: TemplateUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TemplateDetailResponse:
    try:
        detail = update_template(
            db,
            actor,
            template_id=template_id,
            name=payload.name,
            code=payload.code,
            description=payload.description,
            fields=payload.fields,
        )
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TemplateDetailResponse.model_validate(detail)


@template_router.post(
    "/api/v1/templates/{template_id}/status",
    response_model=TemplateDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def template_status_update(
    template_id: str,
    payload: TemplateStatusUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TemplateDetailResponse:
    try:
        detail = update_template_status(
            db, actor, template_id=template_id, status=payload.status.value
        )
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TemplateDetailResponse.model_validate(detail)


@template_router.post("/api/v1/templates/preview", response_model=TemplatePreviewResponse)
def template_preview(
    payload: TemplatePreviewRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
) -> TemplatePreviewResponse:
    try:
        preview = preview_template(
            actor,
            template_type=payload.template_type.value,
            fields=payload.fields,
            context=payload.context,
        )
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TemplatePreviewResponse.model_validate(preview)


@template_router.post("/api/v1/templates/render", response_model=TemplateRenderResponse)
def template_render(
    payload: TemplateRenderRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TemplateRenderResponse:
    try:
        rendered = render_template(
            db,
            actor,
            template_id=payload.template_id,
            template_code=payload.template_code,
            context=payload.context,
        )
    except TemplateOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TemplateRenderResponse.model_validate(rendered)
