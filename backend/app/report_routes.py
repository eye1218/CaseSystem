from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session

from .auth import ActorContext
from .config import Settings
from .database import get_db
from .dependencies import require_auth, require_csrf
from .reporting import (
    ReportingOperationError,
    create_report,
    create_report_template,
    delete_report,
    download_report,
    download_report_template,
    get_report_detail,
    get_report_template_detail,
    list_report_templates,
    list_reports,
    replace_report_file,
    replace_report_template_file,
    update_report,
    update_report_template,
)
from .schemas import (
    ReportTemplateListResponse,
    ReportTemplateSummaryResponse,
    ReportTemplateUpdateRequest,
    TicketReportListResponse,
    TicketReportResponse,
    TicketReportUpdateRequest,
)

report_router = APIRouter(tags=["reports"])


def get_app_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


@report_router.get("/api/v1/report-templates", response_model=ReportTemplateListResponse)
def report_template_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    ticket_category_id: str | None = None,
    status: str | None = None,
) -> ReportTemplateListResponse:
    try:
        payload = list_report_templates(
            db,
            actor,
            ticket_category_id=ticket_category_id,
            status=status,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ReportTemplateListResponse.model_validate(payload)


@report_router.post(
    "/api/v1/report-templates",
    response_model=ReportTemplateSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
async def report_template_create(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    name: Annotated[str, Form()],
    ticket_category_id: Annotated[str, Form()],
    file: UploadFile = File(...),
    description: Annotated[str | None, Form()] = None,
    status: Annotated[str, Form()] = "ACTIVE",
) -> ReportTemplateSummaryResponse:
    try:
        payload = await create_report_template(
            db,
            settings,
            actor,
            name=name,
            description=description,
            ticket_category_id=ticket_category_id,
            status=status,
            upload_file=file,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ReportTemplateSummaryResponse.model_validate(payload)


@report_router.get(
    "/api/v1/report-templates/{template_id}",
    response_model=ReportTemplateSummaryResponse,
)
def report_template_detail(
    template_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> ReportTemplateSummaryResponse:
    try:
        payload = get_report_template_detail(db, actor, template_id)
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ReportTemplateSummaryResponse.model_validate(payload)


@report_router.patch(
    "/api/v1/report-templates/{template_id}",
    response_model=ReportTemplateSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
def report_template_update(
    template_id: str,
    payload: ReportTemplateUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> ReportTemplateSummaryResponse:
    try:
        detail = update_report_template(
            db,
            actor,
            template_id=template_id,
            name=payload.name,
            description=payload.description,
            status=payload.status,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ReportTemplateSummaryResponse.model_validate(detail)


@report_router.post(
    "/api/v1/report-templates/{template_id}/replace-file",
    response_model=ReportTemplateSummaryResponse,
    dependencies=[Depends(require_csrf)],
)
async def report_template_replace(
    template_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    file: UploadFile = File(...),
) -> ReportTemplateSummaryResponse:
    try:
        payload = await replace_report_template_file(
            db,
            settings,
            actor,
            template_id=template_id,
            upload_file=file,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ReportTemplateSummaryResponse.model_validate(payload)


@report_router.get("/api/v1/report-templates/{template_id}/download")
def report_template_download(
    template_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Response:
    try:
        filename, content, content_type = download_report_template(
            db, settings, actor, template_id
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(
        content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@report_router.get("/api/v1/reports", response_model=TicketReportListResponse)
def report_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    ticket_id: int | None = None,
    report_type: str | None = None,
    uploaded_by_me: bool = False,
) -> TicketReportListResponse:
    payload = list_reports(
        db,
        actor,
        search=search,
        ticket_id=ticket_id,
        report_type=report_type,
        uploaded_by_me=uploaded_by_me,
    )
    return TicketReportListResponse.model_validate(payload)


@report_router.post(
    "/api/v1/reports",
    response_model=TicketReportResponse,
    dependencies=[Depends(require_csrf)],
)
async def report_create(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    ticket_id: Annotated[int, Form()],
    title: Annotated[str, Form()],
    report_type: Annotated[str, Form()],
    file: UploadFile = File(...),
    note: Annotated[str | None, Form()] = None,
    source_template_id: Annotated[str | None, Form()] = None,
) -> TicketReportResponse:
    try:
        payload = await create_report(
            db,
            settings,
            actor,
            ticket_id=ticket_id,
            title=title,
            report_type=report_type,
            note=note,
            source_template_id=source_template_id,
            upload_file=file,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketReportResponse.model_validate(payload)


@report_router.get("/api/v1/reports/{report_id}", response_model=TicketReportResponse)
def report_detail(
    report_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketReportResponse:
    try:
        payload = get_report_detail(db, actor, report_id)
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketReportResponse.model_validate(payload)


@report_router.patch(
    "/api/v1/reports/{report_id}",
    response_model=TicketReportResponse,
    dependencies=[Depends(require_csrf)],
)
def report_update(
    report_id: str,
    payload: TicketReportUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> TicketReportResponse:
    try:
        detail = update_report(
            db,
            actor,
            report_id=report_id,
            title=payload.title,
            report_type=payload.report_type,
            note=payload.note,
            source_template_id=payload.source_template_id,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketReportResponse.model_validate(detail)


@report_router.post(
    "/api/v1/reports/{report_id}/replace-file",
    response_model=TicketReportResponse,
    dependencies=[Depends(require_csrf)],
)
async def report_replace_file(
    report_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    file: UploadFile = File(...),
) -> TicketReportResponse:
    try:
        payload = await replace_report_file(
            db,
            settings,
            actor,
            report_id=report_id,
            upload_file=file,
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return TicketReportResponse.model_validate(payload)


@report_router.get("/api/v1/reports/{report_id}/download")
def report_download(
    report_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Response:
    try:
        filename, content, content_type = download_report(
            db, settings, actor, report_id
        )
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(
        content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@report_router.delete(
    "/api/v1/reports/{report_id}",
    status_code=204,
    dependencies=[Depends(require_csrf)],
)
def report_delete(
    report_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Response:
    try:
        delete_report(db, settings, actor, report_id)
    except ReportingOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=204)
