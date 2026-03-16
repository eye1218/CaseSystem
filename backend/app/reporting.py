from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth import ActorContext
from app.config import Settings
from app.enums import RoleCode
from app.models import ReportTemplate, Ticket, TicketAction, TicketReport
from app.modules.tickets.cache import get_ticket_cache
from app.reporting_storage import delete_file, read_file_bytes, save_bytes, save_upload_file
from app.security import utcnow


ACTIVE_TEMPLATE_STATUS = "ACTIVE"
INACTIVE_TEMPLATE_STATUS = "INACTIVE"
ALLOWED_TEMPLATE_STATUSES = {ACTIVE_TEMPLATE_STATUS, INACTIVE_TEMPLATE_STATUS}
ALLOWED_FILE_SUFFIXES = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".md",
}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
KNOWN_TICKET_CATEGORY_IDS = {"intrusion", "network", "data", "endpoint", "phishing"}


SEED_REPORTS = [
    {
        "id": "seed-report-100181",
        "ticket_id": 100181,
        "title": "钓鱼邮件处置总结",
        "report_type": "客户报告",
        "note": "用于工单详情和客户下载的示例报告。",
        "filename": "phishing-summary.pdf",
        "content": b"seed-phishing-report",
        "content_type": "application/pdf",
        "uploaded_by_user_id": "user-admin",
        "uploaded_by_name": "Admin",
    }
]


class ReportingOperationError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class AccessibleReport:
    report: TicketReport
    ticket: Ticket


def _invalidate_ticket_detail_cache(ticket_id: int) -> None:
    get_ticket_cache().invalidate_ticket(ticket_id)


def seed_reporting(db: Session, settings: Settings) -> None:
    existing_ids = set(db.scalars(select(TicketReport.id)).all())
    now = utcnow()

    for payload in SEED_REPORTS:
        if payload["id"] in existing_ids:
            continue
        stored_file = save_bytes(
            settings,
            area="reports",
            filename=payload["filename"],
            content=payload["content"],
            content_type=payload["content_type"],
        )
        db.add(
            TicketReport(
                id=payload["id"],
                ticket_id=payload["ticket_id"],
                title=payload["title"],
                report_type=payload["report_type"],
                note=payload["note"],
                original_filename=stored_file.original_filename,
                content_type=stored_file.content_type,
                size_bytes=stored_file.size_bytes,
                storage_key=stored_file.storage_key,
                uploaded_by_user_id=payload["uploaded_by_user_id"],
                uploaded_by_name=payload["uploaded_by_name"],
                created_at=now,
                updated_at=now,
            )
        )

    db.commit()


def _assert_internal_actor(actor: ActorContext) -> None:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise ReportingOperationError(403, "Current role cannot perform this action")


def _assert_admin_actor(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise ReportingOperationError(403, "Current role cannot manage report templates")


def _validate_ticket_category_id(ticket_category_id: str) -> str:
    normalized = ticket_category_id.strip()
    if normalized not in KNOWN_TICKET_CATEGORY_IDS:
        raise ReportingOperationError(422, "Unsupported ticket category")
    return normalized


def _validate_template_status(status: str) -> str:
    normalized = status.strip().upper()
    if normalized not in ALLOWED_TEMPLATE_STATUSES:
        raise ReportingOperationError(422, "Unsupported template status")
    return normalized


def _validate_file_metadata(filename: str, size_bytes: int) -> None:
    suffix = ""
    if "." in filename:
        suffix = f".{filename.rsplit('.', 1)[1].lower()}"

    if suffix not in ALLOWED_FILE_SUFFIXES:
        raise ReportingOperationError(422, "Unsupported file type")
    if size_bytes <= 0:
        raise ReportingOperationError(422, "Uploaded file cannot be empty")
    if size_bytes > MAX_FILE_SIZE_BYTES:
        raise ReportingOperationError(422, "Uploaded file exceeds the 50MB limit")


async def _store_validated_file(settings: Settings, *, area: str, upload_file: UploadFile):
    stored_file = await save_upload_file(settings, area=area, upload_file=upload_file)
    try:
        _validate_file_metadata(stored_file.original_filename, stored_file.size_bytes)
    except ReportingOperationError:
        delete_file(settings, stored_file.storage_key)
        raise
    return stored_file


def _source_template_payload(template: ReportTemplate | None) -> dict | None:
    if template is None:
        return None
    return {"id": template.id, "name": template.name}


def _template_payload(template: ReportTemplate) -> dict:
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "ticket_category_id": template.ticket_category_id,
        "status": template.status,
        "original_filename": template.original_filename,
        "content_type": template.content_type,
        "size_bytes": template.size_bytes,
        "download_path": f"/api/v1/report-templates/{template.id}/download",
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


def _report_payload(report: TicketReport, *, ticket: Ticket) -> dict:
    return {
        "id": report.id,
        "ticket_id": report.ticket_id,
        "ticket_category_id": ticket.category_id,
        "ticket_category_name": ticket.category_name,
        "ticket_created_at": ticket.created_at,
        "title": report.title,
        "report_type": report.report_type,
        "note": report.note,
        "source_template": _source_template_payload(report.source_template),
        "original_filename": report.original_filename,
        "content_type": report.content_type,
        "size_bytes": report.size_bytes,
        "uploaded_by": report.uploaded_by_name,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
        "download_path": f"/api/v1/reports/{report.id}/download",
    }


def _record_ticket_action(
    db: Session,
    *,
    ticket_id: int,
    actor: ActorContext,
    action_type: str,
    content: str,
    context: dict | None = None,
) -> None:
    db.add(
        TicketAction(
            id=str(uuid.uuid4()),
            ticket_id=ticket_id,
            action_type=action_type,
            actor_user_id=actor.user_id,
            actor_name=actor.display_name,
            actor_role=actor.active_role,
            visibility="PUBLIC",
            content=content,
            context=context or {},
            created_at=utcnow(),
        )
    )


def _get_accessible_ticket(db: Session, actor: ActorContext, ticket_id: int) -> Ticket | None:
    conditions = [Ticket.id == ticket_id, Ticket.is_deleted.is_(False)]
    if actor.active_role == RoleCode.CUSTOMER.value:
        conditions.append(Ticket.customer_user_id == actor.user_id)
    return db.scalar(select(Ticket).where(*conditions))


def _get_accessible_report(db: Session, actor: ActorContext, report_id: str) -> AccessibleReport | None:
    statement = (
        select(TicketReport, Ticket)
        .join(Ticket, Ticket.id == TicketReport.ticket_id)
        .options(selectinload(TicketReport.source_template))
        .where(TicketReport.id == report_id, Ticket.is_deleted.is_(False))
    )
    if actor.active_role == RoleCode.CUSTOMER.value:
        statement = statement.where(Ticket.customer_user_id == actor.user_id)

    row = db.execute(statement).first()
    if row is None:
        return None
    report, ticket = row
    return AccessibleReport(report=report, ticket=ticket)


def _get_template_or_error(db: Session, template_id: str) -> ReportTemplate:
    template = db.scalar(select(ReportTemplate).where(ReportTemplate.id == template_id))
    if template is None:
        raise ReportingOperationError(404, "Report template not found")
    return template


def _resolve_source_template(
    db: Session,
    *,
    source_template_id: str | None,
    ticket_category_id: str,
) -> ReportTemplate | None:
    if not source_template_id:
        return None
    template = _get_template_or_error(db, source_template_id)
    if template.ticket_category_id != ticket_category_id:
        raise ReportingOperationError(422, "Source template does not match the ticket category")
    return template


def list_report_templates(
    db: Session,
    actor: ActorContext,
    *,
    ticket_category_id: str | None = None,
    status: str | None = None,
) -> dict:
    _assert_admin_actor(actor)
    conditions = []
    if ticket_category_id:
        conditions.append(ReportTemplate.ticket_category_id == _validate_ticket_category_id(ticket_category_id))
    if status:
        conditions.append(ReportTemplate.status == _validate_template_status(status))

    items = list(
        db.scalars(select(ReportTemplate).where(*conditions).order_by(ReportTemplate.updated_at.desc())).all()
    )
    return {"items": [_template_payload(item) for item in items], "total_count": len(items)}


def get_report_template_detail(db: Session, actor: ActorContext, template_id: str) -> dict:
    _assert_admin_actor(actor)
    return _template_payload(_get_template_or_error(db, template_id))


async def create_report_template(
    db: Session,
    settings: Settings,
    actor: ActorContext,
    *,
    name: str,
    description: str | None,
    ticket_category_id: str,
    status: str,
    upload_file: UploadFile,
) -> dict:
    _assert_admin_actor(actor)
    stored_file = await _store_validated_file(settings, area="templates", upload_file=upload_file)

    try:
        template = ReportTemplate(
            name=name.strip(),
            description=description.strip() or None if description else None,
            ticket_category_id=_validate_ticket_category_id(ticket_category_id),
            status=_validate_template_status(status),
            original_filename=stored_file.original_filename,
            content_type=stored_file.content_type,
            size_bytes=stored_file.size_bytes,
            storage_key=stored_file.storage_key,
            created_by_user_id=actor.user_id,
            updated_by_user_id=actor.user_id,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return _template_payload(template)
    except Exception:
        db.rollback()
        delete_file(settings, stored_file.storage_key)
        raise


def update_report_template(
    db: Session,
    actor: ActorContext,
    *,
    template_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
) -> dict:
    _assert_admin_actor(actor)
    template = _get_template_or_error(db, template_id)

    if name is not None:
        template.name = name.strip()
    if description is not None:
        template.description = description.strip() or None
    if status is not None:
        template.status = _validate_template_status(status)
    template.updated_by_user_id = actor.user_id
    template.updated_at = utcnow()

    db.commit()
    db.refresh(template)
    return _template_payload(template)


async def replace_report_template_file(
    db: Session,
    settings: Settings,
    actor: ActorContext,
    *,
    template_id: str,
    upload_file: UploadFile,
) -> dict:
    _assert_admin_actor(actor)
    template = _get_template_or_error(db, template_id)
    old_storage_key = template.storage_key
    stored_file = await _store_validated_file(settings, area="templates", upload_file=upload_file)

    template.original_filename = stored_file.original_filename
    template.content_type = stored_file.content_type
    template.size_bytes = stored_file.size_bytes
    template.storage_key = stored_file.storage_key
    template.updated_by_user_id = actor.user_id
    template.updated_at = utcnow()

    try:
        db.commit()
        db.refresh(template)
    except Exception:
        db.rollback()
        delete_file(settings, stored_file.storage_key)
        raise

    delete_file(settings, old_storage_key)
    return _template_payload(template)


def download_report_template(
    db: Session, settings: Settings, actor: ActorContext, template_id: str
) -> tuple[str, bytes, str]:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise ReportingOperationError(403, "Current role cannot access report templates")
    template = _get_template_or_error(db, template_id)
    body = read_file_bytes(settings, template.storage_key)
    if body is None:
        raise ReportingOperationError(404, "Report template file not found")
    content_type = template.content_type or "application/octet-stream"
    return template.original_filename, body, content_type


def list_templates_for_ticket_detail(
    db: Session, actor: ActorContext, *, ticket_category_id: str
) -> list[dict]:
    if actor.active_role == RoleCode.CUSTOMER.value:
        return []

    items = list(
        db.scalars(
            select(ReportTemplate)
            .where(
                ReportTemplate.ticket_category_id == ticket_category_id,
                ReportTemplate.status == ACTIVE_TEMPLATE_STATUS,
            )
            .order_by(ReportTemplate.updated_at.desc())
        ).all()
    )
    return [_template_payload(item) for item in items]


def list_reports(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None = None,
    ticket_id: int | None = None,
    report_type: str | None = None,
    uploaded_by_me: bool = False,
) -> dict:
    statement = (
        select(TicketReport, Ticket)
        .join(Ticket, Ticket.id == TicketReport.ticket_id)
        .options(selectinload(TicketReport.source_template))
        .where(Ticket.is_deleted.is_(False))
        .order_by(TicketReport.updated_at.desc(), TicketReport.created_at.desc())
    )

    if actor.active_role == RoleCode.CUSTOMER.value:
        statement = statement.where(Ticket.customer_user_id == actor.user_id)
    if search:
        statement = statement.where(TicketReport.title.ilike(f"%{search.strip()}%"))
    if ticket_id is not None:
        statement = statement.where(TicketReport.ticket_id == ticket_id)
    if report_type:
        statement = statement.where(TicketReport.report_type == report_type.strip())
    if uploaded_by_me:
        statement = statement.where(TicketReport.uploaded_by_user_id == actor.user_id)

    rows = list(db.execute(statement).all())
    return {
        "items": [_report_payload(report, ticket=ticket) for report, ticket in rows],
        "total_count": len(rows),
    }


def get_report_detail(db: Session, actor: ActorContext, report_id: str) -> dict:
    accessible = _get_accessible_report(db, actor, report_id)
    if accessible is None:
        raise ReportingOperationError(404, "Report not found")
    return _report_payload(accessible.report, ticket=accessible.ticket)


async def create_report(
    db: Session,
    settings: Settings,
    actor: ActorContext,
    *,
    ticket_id: int,
    title: str,
    report_type: str,
    note: str | None,
    source_template_id: str | None,
    upload_file: UploadFile,
) -> dict:
    _assert_internal_actor(actor)
    ticket = _get_accessible_ticket(db, actor, ticket_id)
    if ticket is None:
        raise ReportingOperationError(404, "Ticket not found")

    source_template = _resolve_source_template(
        db,
        source_template_id=source_template_id,
        ticket_category_id=ticket.category_id,
    )
    stored_file = await _store_validated_file(settings, area="reports", upload_file=upload_file)
    now = utcnow()

    try:
        report = TicketReport(
            ticket_id=ticket.id,
            title=title.strip(),
            report_type=report_type.strip(),
            note=note.strip() or None if note else None,
            source_template_id=source_template.id if source_template else None,
            original_filename=stored_file.original_filename,
            content_type=stored_file.content_type,
            size_bytes=stored_file.size_bytes,
            storage_key=stored_file.storage_key,
            uploaded_by_user_id=actor.user_id,
            uploaded_by_name=actor.display_name,
            created_at=now,
            updated_at=now,
        )
        db.add(report)
        db.flush()
        _record_ticket_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="report_uploaded",
            content=f"上传了报告《{report.title}》。",
            context={"report_id": report.id},
        )
        db.commit()
        db.refresh(report)
        db.refresh(ticket)
        _invalidate_ticket_detail_cache(ticket.id)
        return _report_payload(report, ticket=ticket)
    except Exception:
        db.rollback()
        delete_file(settings, stored_file.storage_key)
        raise


def update_report(
    db: Session,
    actor: ActorContext,
    *,
    report_id: str,
    title: str | None = None,
    report_type: str | None = None,
    note: str | None = None,
    source_template_id: str | None = None,
) -> dict:
    _assert_internal_actor(actor)
    accessible = _get_accessible_report(db, actor, report_id)
    if accessible is None:
        raise ReportingOperationError(404, "Report not found")

    report = accessible.report
    ticket = accessible.ticket

    source_template = _resolve_source_template(
        db,
        source_template_id=source_template_id,
        ticket_category_id=ticket.category_id,
    )

    if title is not None:
        report.title = title.strip()
    if report_type is not None:
        report.report_type = report_type.strip()
    if note is not None:
        report.note = note.strip() or None
    report.source_template_id = source_template.id if source_template else None
    report.updated_at = utcnow()

    _record_ticket_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="report_updated",
        content=f"更新了报告《{report.title}》的元信息。",
        context={"report_id": report.id},
    )
    db.commit()
    db.refresh(report)
    _invalidate_ticket_detail_cache(ticket.id)
    return _report_payload(report, ticket=ticket)


async def replace_report_file(
    db: Session,
    settings: Settings,
    actor: ActorContext,
    *,
    report_id: str,
    upload_file: UploadFile,
) -> dict:
    _assert_internal_actor(actor)
    accessible = _get_accessible_report(db, actor, report_id)
    if accessible is None:
        raise ReportingOperationError(404, "Report not found")

    report = accessible.report
    ticket = accessible.ticket
    old_storage_key = report.storage_key
    stored_file = await _store_validated_file(settings, area="reports", upload_file=upload_file)

    report.original_filename = stored_file.original_filename
    report.content_type = stored_file.content_type
    report.size_bytes = stored_file.size_bytes
    report.storage_key = stored_file.storage_key
    report.updated_at = utcnow()

    try:
        _record_ticket_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="report_replaced",
            content=f"替换了报告《{report.title}》的文件。",
            context={"report_id": report.id},
        )
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        delete_file(settings, stored_file.storage_key)
        raise

    delete_file(settings, old_storage_key)
    _invalidate_ticket_detail_cache(ticket.id)
    return _report_payload(report, ticket=ticket)


def delete_report(db: Session, settings: Settings, actor: ActorContext, report_id: str) -> None:
    _assert_internal_actor(actor)
    accessible = _get_accessible_report(db, actor, report_id)
    if accessible is None:
        raise ReportingOperationError(404, "Report not found")

    report = accessible.report
    ticket = accessible.ticket
    storage_key = report.storage_key
    title = report.title

    _record_ticket_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="report_deleted",
        content=f"删除了报告《{title}》。",
        context={"report_id": report.id},
    )
    db.delete(report)
    db.commit()
    delete_file(settings, storage_key)
    _invalidate_ticket_detail_cache(ticket.id)


def download_report(
    db: Session, settings: Settings, actor: ActorContext, report_id: str
) -> tuple[str, bytes, str]:
    accessible = _get_accessible_report(db, actor, report_id)
    if accessible is None:
        raise ReportingOperationError(404, "Report not found")
    report = accessible.report
    body = read_file_bytes(settings, report.storage_key)
    if body is None:
        raise ReportingOperationError(404, "Report file not found")
    content_type = report.content_type or "application/octet-stream"
    return report.original_filename, body, content_type


def list_reports_for_ticket_detail(db: Session, actor: ActorContext, *, ticket_id: int) -> list[dict]:
    ticket = _get_accessible_ticket(db, actor, ticket_id)
    if ticket is None:
        return []

    items = list(
        db.scalars(
            select(TicketReport)
            .options(selectinload(TicketReport.source_template))
            .where(TicketReport.ticket_id == ticket.id)
            .order_by(TicketReport.updated_at.desc(), TicketReport.created_at.desc())
        ).all()
    )
    return [_report_payload(item, ticket=ticket) for item in items]
