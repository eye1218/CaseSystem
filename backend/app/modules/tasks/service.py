from __future__ import annotations

import re
import smtplib
from email.message import EmailMessage
from typing import Any, Iterable
from urllib.parse import urlparse

import httpx
from sqlalchemy import String, cast, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...config import Settings
from ...enums import RoleCode
from ...models import User, UserRole
from ...security import utcnow
from ..templates.models import Template
from ..templates.service import TemplateOperationError, render_template
from ..tickets.models import Ticket
from .models import TaskExecutionLog, TaskInstance, TaskTemplate


TASK_TYPE_EMAIL = "EMAIL"
TASK_TYPE_WEBHOOK = "WEBHOOK"
TASK_TYPE_UNKNOWN = "UNKNOWN"
ACTIVE_TASK_TEMPLATE_STATUS = "ACTIVE"
INACTIVE_TASK_TEMPLATE_STATUS = "INACTIVE"
TASK_STATUS_PENDING = "PENDING"
TASK_STATUS_RUNNING = "RUNNING"
TASK_STATUS_SUCCESS = "SUCCESS"
TASK_STATUS_FAILED = "FAILED"
TASK_STATUS_CANCELLED = "CANCELLED"
SUPPORTED_TASK_TYPES = {TASK_TYPE_EMAIL, TASK_TYPE_WEBHOOK}
SUPPORTED_TASK_TEMPLATE_STATUSES = {
    ACTIVE_TASK_TEMPLATE_STATUS,
    INACTIVE_TASK_TEMPLATE_STATUS,
}
SUPPORTED_RECIPIENT_SOURCE_TYPES = {"CUSTOM_EMAIL", "CURRENT_HANDLER", "ROLE_MEMBERS"}
SUPPORTED_ROLE_TARGETS = {
    RoleCode.ADMIN.value,
    RoleCode.T1.value,
    RoleCode.T2.value,
    RoleCode.T3.value,
}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class TaskOperationError(Exception):
    status_code: int
    detail: str | dict[str, object]

    def __init__(self, status_code: int, detail: str | dict[str, object]):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _require_admin(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise TaskOperationError(403, "Admin role required")


def _require_internal(actor: ActorContext) -> None:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise TaskOperationError(403, "Internal role required")


def _validation_error(field_errors: dict[str, str]) -> TaskOperationError:
    return TaskOperationError(
        422,
        {
            "message": "Validation failed",
            "field_errors": field_errors,
        },
    )


def _normalize_task_type(task_type: str) -> str:
    normalized = task_type.strip().upper()
    if normalized not in SUPPORTED_TASK_TYPES:
        raise _validation_error({"task_type": "Unsupported task type"})
    return normalized


def _normalize_status(status: str) -> str:
    normalized = status.strip().upper()
    if normalized not in SUPPORTED_TASK_TEMPLATE_STATUSES:
        raise _validation_error({"status": "Unsupported task template status"})
    return normalized


def _task_group(task_type: str) -> str:
    if task_type == TASK_TYPE_EMAIL:
        return "email"
    if task_type == TASK_TYPE_WEBHOOK:
        return "webhook"
    return "unknown"


def _validate_reference_template(
    db: Session, *, template_id: str, task_type: str
) -> Template:
    template = db.scalar(select(Template).where(Template.id == template_id))
    if template is None:
        raise TaskOperationError(404, "Reference template not found")
    if template.status != "ACTIVE":
        raise TaskOperationError(409, "Reference template is not active")
    if template.template_type != task_type:
        raise _validation_error(
            {"reference_template_id": "Reference template type does not match task type"}
        )
    return template


def _normalize_recipient_rows(
    rows: list[dict[str, Any]],
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for index, row in enumerate(rows):
        source_type = str(row.get("source_type") or "").strip().upper()
        raw_value = row.get("value")
        value = str(raw_value).strip() if isinstance(raw_value, str) else ""
        if source_type not in SUPPORTED_RECIPIENT_SOURCE_TYPES:
            field_errors[f"{field_name}[{index}].source_type"] = "Unsupported recipient source"
            continue
        if source_type == "CUSTOM_EMAIL":
            if not value or EMAIL_PATTERN.match(value) is None:
                field_errors[f"{field_name}[{index}].value"] = "A valid email address is required"
                continue
        elif source_type == "ROLE_MEMBERS":
            if value not in SUPPORTED_ROLE_TARGETS:
                field_errors[f"{field_name}[{index}].value"] = "A valid internal role is required"
                continue
        else:
            value = ""
        payload: dict[str, str] = {"source_type": source_type}
        if value:
            payload["value"] = value
        normalized.append(payload)
    return normalized


def _normalize_recipient_config(
    task_type: str, raw_config: dict[str, Any]
) -> dict[str, object]:
    if task_type == TASK_TYPE_WEBHOOK:
        return {"to": [], "cc": [], "bcc": []}

    field_errors: dict[str, str] = {}
    to_rows = _normalize_recipient_rows(
        [dict(item) for item in raw_config.get("to", [])],
        field_name="recipient_config.to",
        field_errors=field_errors,
    )
    cc_rows = _normalize_recipient_rows(
        [dict(item) for item in raw_config.get("cc", [])],
        field_name="recipient_config.cc",
        field_errors=field_errors,
    )
    bcc_rows = _normalize_recipient_rows(
        [dict(item) for item in raw_config.get("bcc", [])],
        field_name="recipient_config.bcc",
        field_errors=field_errors,
    )
    if not to_rows:
        field_errors["recipient_config.to"] = "At least one recipient is required"
    if field_errors:
        raise _validation_error(field_errors)
    return {"to": to_rows, "cc": cc_rows, "bcc": bcc_rows}


def _normalize_target_config(task_type: str, raw_config: dict[str, Any]) -> dict[str, object]:
    if task_type == TASK_TYPE_EMAIL:
        return {}

    forbidden = {"url", "method", "headers", "body"} & set(raw_config.keys())
    if forbidden:
        raise _validation_error(
            {
                "target_config": "Webhook task templates cannot override url, method, headers, or body"
            }
        )
    normalized = dict(raw_config)
    normalized.setdefault("source", "EVENT_TICKET_CONTEXT")
    return normalized


def _serialize_task_template(task_template: TaskTemplate) -> dict[str, object]:
    return {
        "id": task_template.id,
        "name": task_template.name,
        "task_type": task_template.task_type,
        "reference_template_id": task_template.reference_template_id,
        "status": task_template.status,
        "recipient_config": task_template.recipient_config,
        "target_config": task_template.target_config,
        "description": task_template.description,
        "created_at": task_template.created_at,
        "updated_at": task_template.updated_at,
    }


def _task_template_snapshot(task_template: TaskTemplate | None, *, task_template_id: str) -> dict[str, object]:
    if task_template is None:
        return {
            "id": task_template_id,
            "name": task_template_id,
            "task_type": TASK_TYPE_UNKNOWN,
            "status": "MISSING",
            "reference_template_id": None,
            "recipient_config": {"to": [], "cc": [], "bcc": []},
            "target_config": {},
            "description": "Task template is missing",
        }
    return {
        "id": task_template.id,
        "name": task_template.name,
        "task_type": task_template.task_type,
        "status": task_template.status,
        "reference_template_id": task_template.reference_template_id,
        "recipient_config": task_template.recipient_config,
        "target_config": task_template.target_config,
        "description": task_template.description,
    }


def _get_task_template_or_error(db: Session, task_template_id: str) -> TaskTemplate:
    task_template = db.scalar(
        select(TaskTemplate).where(TaskTemplate.id == task_template_id)
    )
    if task_template is None:
        raise TaskOperationError(404, "Task template not found")
    return task_template


def _system_actor() -> ActorContext:
    return ActorContext(
        user_id="system",
        username="system",
        display_name="System",
        session_id="system",
        active_role=RoleCode.ADMIN.value,
        roles=[RoleCode.ADMIN.value],
        token_version=1,
        role_version=1,
    )


def validate_bindable_task_template_ids(db: Session, task_template_ids: list[str]) -> list[str]:
    unique_ids = list(dict.fromkeys(task_template_ids))
    if not unique_ids:
        return unique_ids
    items = list(
        db.scalars(
            select(TaskTemplate).where(
                TaskTemplate.id.in_(unique_ids),
                TaskTemplate.status == ACTIVE_TASK_TEMPLATE_STATUS,
            )
        ).all()
    )
    found_ids = {item.id for item in items}
    missing = [task_template_id for task_template_id in unique_ids if task_template_id not in found_ids]
    if missing:
        raise _validation_error(
            {"task_template_ids": "One or more task templates do not exist"}
        )
    return unique_ids


def serialize_bound_task_templates(
    db: Session, task_template_ids: list[str]
) -> list[dict[str, str]]:
    if not task_template_ids:
        return []

    items = list(
        db.scalars(select(TaskTemplate).where(TaskTemplate.id.in_(task_template_ids))).all()
    )
    item_map = {item.id: item for item in items}
    serialized: list[dict[str, str]] = []
    for task_template_id in task_template_ids:
        item = item_map.get(task_template_id)
        if item is None:
            serialized.append(
                {
                    "id": task_template_id,
                    "name": task_template_id,
                    "description": "Task template missing",
                    "group": "missing",
                }
            )
            continue
        description = item.description or f"{item.task_type} task template"
        if item.status != ACTIVE_TASK_TEMPLATE_STATUS:
            description = f"{description} (inactive)"
        serialized.append(
            {
                "id": item.id,
                "name": item.name,
                "description": description,
                "group": _task_group(item.task_type),
            }
        )
    return serialized


def list_task_templates(db: Session, actor: ActorContext) -> dict[str, object]:
    _require_admin(actor)
    items = list(
        db.scalars(select(TaskTemplate).order_by(TaskTemplate.updated_at.desc())).all()
    )
    return {
        "items": [_serialize_task_template(item) for item in items],
        "total_count": len(items),
    }


def create_task_template(
    db: Session,
    actor: ActorContext,
    *,
    name: str,
    task_type: str,
    reference_template_id: str,
    status: str,
    recipient_config: dict[str, Any],
    target_config: dict[str, Any],
    description: str | None,
) -> dict[str, object]:
    _require_admin(actor)
    normalized_task_type = _normalize_task_type(task_type)
    _validate_reference_template(
        db, template_id=reference_template_id, task_type=normalized_task_type
    )
    task_template = TaskTemplate(
        name=name.strip(),
        task_type=normalized_task_type,
        reference_template_id=reference_template_id,
        status=_normalize_status(status),
        recipient_config=_normalize_recipient_config(
            normalized_task_type, recipient_config
        ),
        target_config=_normalize_target_config(normalized_task_type, target_config),
        description=description.strip() or None if description else None,
        created_by_user_id=actor.user_id,
        created_by_name=actor.display_name,
        updated_by_user_id=actor.user_id,
        updated_by_name=actor.display_name,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(task_template)
    db.commit()
    db.refresh(task_template)
    return _serialize_task_template(task_template)


def get_task_template(
    db: Session, actor: ActorContext, task_template_id: str
) -> dict[str, object]:
    _require_admin(actor)
    return _serialize_task_template(_get_task_template_or_error(db, task_template_id))


def update_task_template(
    db: Session,
    actor: ActorContext,
    *,
    task_template_id: str,
    name: str | None = None,
    reference_template_id: str | None = None,
    recipient_config: dict[str, Any] | None = None,
    target_config: dict[str, Any] | None = None,
    description: str | None = None,
) -> dict[str, object]:
    _require_admin(actor)
    task_template = _get_task_template_or_error(db, task_template_id)
    if name is not None:
        task_template.name = name.strip()
    if reference_template_id is not None:
        _validate_reference_template(
            db,
            template_id=reference_template_id,
            task_type=task_template.task_type,
        )
        task_template.reference_template_id = reference_template_id
    if recipient_config is not None:
        task_template.recipient_config = _normalize_recipient_config(
            task_template.task_type,
            recipient_config,
        )
    if target_config is not None:
        task_template.target_config = _normalize_target_config(
            task_template.task_type,
            target_config,
        )
    if description is not None:
        task_template.description = description.strip() or None
    task_template.updated_by_user_id = actor.user_id
    task_template.updated_by_name = actor.display_name
    task_template.updated_at = utcnow()
    db.commit()
    db.refresh(task_template)
    return _serialize_task_template(task_template)


def update_task_template_status(
    db: Session, actor: ActorContext, *, task_template_id: str, status: str
) -> dict[str, object]:
    _require_admin(actor)
    task_template = _get_task_template_or_error(db, task_template_id)
    task_template.status = _normalize_status(status)
    task_template.updated_by_user_id = actor.user_id
    task_template.updated_by_name = actor.display_name
    task_template.updated_at = utcnow()
    db.commit()
    db.refresh(task_template)
    return _serialize_task_template(task_template)


def list_bindable_task_templates(db: Session, actor: ActorContext) -> list[dict[str, str]]:
    _require_admin(actor)
    items = list(
        db.scalars(
            select(TaskTemplate)
            .where(TaskTemplate.status == ACTIVE_TASK_TEMPLATE_STATUS)
            .order_by(TaskTemplate.updated_at.desc())
        ).all()
    )
    return [
        {
            "id": item.id,
            "name": item.name,
            "description": item.description or f"{item.task_type} task template",
            "group": _task_group(item.task_type),
        }
        for item in items
    ]


def _build_ticket_context(ticket: Ticket) -> dict[str, object]:
    return {
        "id": ticket.id,
        "title": ticket.title,
        "category_id": ticket.category_id,
        "category_name": ticket.category_name,
        "priority": ticket.priority,
        "risk_score": ticket.risk_score,
        "status": ticket.main_status,
        "sub_status": ticket.sub_status,
        "source": ticket.source,
        "assigned_to": ticket.assigned_to,
        "assigned_to_user_id": ticket.assigned_to_user_id,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }


def _make_task_log(
    db: Session,
    *,
    task_instance_id: str,
    stage: str,
    actor_user_id: str | None = None,
    actor_name: str | None = None,
    input_summary: dict[str, object] | None = None,
    rendered_summary: dict[str, object] | None = None,
    response_summary: dict[str, object] | None = None,
    error_message: str | None = None,
) -> None:
    db.add(
        TaskExecutionLog(
            task_instance_id=task_instance_id,
            stage=stage,
            actor_user_id=actor_user_id,
            actor_name=actor_name,
            input_summary=input_summary or {},
            rendered_summary=rendered_summary or {},
            response_summary=response_summary or {},
            error_message=error_message,
            created_at=utcnow(),
        )
    )


def _get_ticket_or_none(db: Session, ticket_id: int | None) -> Ticket | None:
    if ticket_id is None:
        return None
    return db.scalar(
        select(Ticket).where(Ticket.id == ticket_id, Ticket.is_deleted.is_(False))
    )


def _unique_non_empty(values: Iterable[str]) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        items.append(normalized)
    return items


def _resolve_user_emails_by_role(db: Session, role_code: str) -> list[str]:
    rows = db.execute(
        select(User.email)
        .join(UserRole, UserRole.user_id == User.id)
        .where(
            UserRole.role_code == role_code,
            UserRole.is_active.is_(True),
            User.status == "active",
            User.email.is_not(None),
        )
    ).all()
    return _unique_non_empty(email for (email,) in rows if isinstance(email, str))


def _resolve_recipient_bucket(
    db: Session,
    ticket: Ticket,
    rows: list[dict[str, Any]],
) -> list[str]:
    emails: list[str] = []
    for row in rows:
        source_type = str(row.get("source_type") or "").strip().upper()
        value = str(row.get("value") or "").strip()
        if source_type == "CUSTOM_EMAIL" and value:
            emails.append(value)
        elif source_type == "CURRENT_HANDLER" and ticket.assigned_to_user_id:
            user = db.scalar(
                select(User).where(
                    User.id == ticket.assigned_to_user_id,
                    User.status == "active",
                    User.email.is_not(None),
                )
            )
            if user and user.email:
                emails.append(user.email)
        elif source_type == "ROLE_MEMBERS" and value:
            emails.extend(_resolve_user_emails_by_role(db, value))
    return _unique_non_empty(emails)


def _resolve_recipients(
    db: Session,
    ticket: Ticket,
    recipient_config: dict[str, Any],
) -> dict[str, list[str]]:
    return {
        "to": _resolve_recipient_bucket(db, ticket, list(recipient_config.get("to", []))),
        "cc": _resolve_recipient_bucket(db, ticket, list(recipient_config.get("cc", []))),
        "bcc": _resolve_recipient_bucket(db, ticket, list(recipient_config.get("bcc", []))),
    }


def deliver_email(
    *,
    recipients: dict[str, list[str]],
    rendered: dict[str, Any],
    settings: Settings,
) -> dict[str, object]:
    all_recipients = _unique_non_empty(
        [*recipients.get("to", []), *recipients.get("cc", []), *recipients.get("bcc", [])]
    )
    if not all_recipients:
        raise TaskOperationError(422, "Email recipients resolved to an empty set")

    if not settings.smtp_host:
        return {
            "provider": "stub-smtp",
            "accepted": len(all_recipients),
            "subject": rendered.get("subject"),
        }

    message = EmailMessage()
    message["Subject"] = str(rendered.get("subject") or "")
    message["From"] = settings.smtp_from_email
    if recipients.get("to"):
        message["To"] = ", ".join(recipients["to"])
    if recipients.get("cc"):
        message["Cc"] = ", ".join(recipients["cc"])
    if recipients.get("bcc"):
        message["Bcc"] = ", ".join(recipients["bcc"])
    message.set_content(str(rendered.get("body") or ""))

    if settings.smtp_use_ssl:
        smtp_client = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        )
    else:
        smtp_client = smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        )
    with smtp_client as smtp:
        if not settings.smtp_use_ssl and settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)
    return {
        "provider": "smtp",
        "accepted": len(all_recipients),
        "subject": rendered.get("subject"),
    }


def deliver_webhook(
    *,
    request_payload: dict[str, Any],
    settings: Settings,
) -> dict[str, object]:
    response = httpx.request(
        method=str(request_payload["method"]),
        url=str(request_payload["url"]),
        headers=dict(request_payload.get("headers") or {}),
        content=request_payload.get("body"),
        timeout=settings.webhook_timeout_seconds,
    )
    return {
        "provider": "httpx",
        "status_code": response.status_code,
        "reason_phrase": response.reason_phrase,
        "body_excerpt": response.text[:500],
    }


def create_task_instance_for_binding(
    db: Session,
    *,
    event_id: str,
    binding_id: str,
    task_template_id: str,
    payload: dict[str, object],
) -> dict[str, object]:
    task_template = db.scalar(select(TaskTemplate).where(TaskTemplate.id == task_template_id))
    ticket_id = payload.get("ticket_id")
    instance = TaskInstance(
        task_template_id=task_template.id if task_template else None,
        source_event_id=event_id,
        source_binding_id=binding_id,
        ticket_id=ticket_id if isinstance(ticket_id, int) else None,
        task_type=task_template.task_type if task_template else TASK_TYPE_UNKNOWN,
        status=TASK_STATUS_PENDING,
        template_snapshot=_task_template_snapshot(
            task_template, task_template_id=task_template_id
        ),
        latest_result={},
        error_message=None,
        retry_of_task_id=None,
        operator_user_id=None,
        operator_name="System",
        started_at=None,
        finished_at=None,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(instance)
    db.flush()
    _make_task_log(
        db,
        task_instance_id=instance.id,
        stage="created",
        actor_name="System",
        input_summary={"event_payload": payload, "task_template_id": task_template_id},
    )
    db.commit()
    db.refresh(instance)
    return {"task_instance_id": instance.id}


def _coerce_rendered_payload(raw_rendered: object) -> dict[str, Any]:
    if hasattr(raw_rendered, "model_dump"):
        return getattr(raw_rendered, "model_dump")()
    if isinstance(raw_rendered, dict):
        return dict(raw_rendered)
    return {}


def _fail_task_instance(
    db: Session,
    instance: TaskInstance,
    *,
    message: str,
    rendered_summary: dict[str, object] | None = None,
    response_summary: dict[str, object] | None = None,
) -> dict[str, object]:
    instance.status = TASK_STATUS_FAILED
    instance.error_message = message
    instance.finished_at = utcnow()
    instance.updated_at = instance.finished_at
    _make_task_log(
        db,
        task_instance_id=instance.id,
        stage="failed",
        actor_name=instance.operator_name or "System",
        rendered_summary=rendered_summary,
        response_summary=response_summary,
        error_message=message,
    )
    db.commit()
    db.refresh(instance)
    return _serialize_task_instance_detail(db, instance)


def execute_task_instance(
    db: Session,
    settings: Settings,
    *,
    task_instance_id: str,
) -> dict[str, object]:
    instance = db.scalar(select(TaskInstance).where(TaskInstance.id == task_instance_id))
    if instance is None:
        raise TaskOperationError(404, "Task instance not found")

    instance.status = TASK_STATUS_RUNNING
    instance.started_at = utcnow()
    instance.updated_at = instance.started_at
    _make_task_log(
        db,
        task_instance_id=instance.id,
        stage="running",
        actor_name=instance.operator_name or "System",
        input_summary={"task_type": instance.task_type, "ticket_id": instance.ticket_id},
    )
    db.commit()
    db.refresh(instance)

    task_template = (
        db.scalar(select(TaskTemplate).where(TaskTemplate.id == instance.task_template_id))
        if instance.task_template_id
        else None
    )
    if task_template is None:
        return _fail_task_instance(db, instance, message="Task template not found")
    if task_template.status != ACTIVE_TASK_TEMPLATE_STATUS:
        return _fail_task_instance(db, instance, message="Task template is not active")

    ticket = _get_ticket_or_none(db, instance.ticket_id)
    if ticket is None:
        return _fail_task_instance(db, instance, message="Related ticket not found")

    try:
        rendered_payload = render_template(
            db,
            _system_actor(),
            template_id=task_template.reference_template_id,
            template_code=None,
            context={"ticket": _build_ticket_context(ticket)},
        )
        rendered = _coerce_rendered_payload(rendered_payload.get("rendered"))
    except TemplateOperationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            message = str(detail.get("message") or "Template render failed")
            rendered_summary = {"field_errors": detail.get("field_errors", [])}
        else:
            message = str(detail)
            rendered_summary = {}
        return _fail_task_instance(
            db,
            instance,
            message=message,
            rendered_summary=rendered_summary,
        )

    try:
        if task_template.task_type == TASK_TYPE_EMAIL:
            recipients = _resolve_recipients(db, ticket, task_template.recipient_config)
            if not recipients["to"]:
                return _fail_task_instance(
                    db,
                    instance,
                    message="Email recipients resolved to an empty set",
                    rendered_summary=rendered,
                )
            delivery_result = deliver_email(
                recipients=recipients,
                rendered=rendered,
                settings=settings,
            )
            latest_result = {
                "recipients": recipients,
                "rendered": rendered,
                "response": delivery_result,
            }
            target_summary = ", ".join(recipients["to"])
        elif task_template.task_type == TASK_TYPE_WEBHOOK:
            url = str(rendered.get("url") or "").strip()
            parsed = urlparse(url)
            if not url or not parsed.scheme or not parsed.netloc:
                return _fail_task_instance(
                    db,
                    instance,
                    message="Rendered webhook URL is invalid",
                    rendered_summary=rendered,
                )
            method = str(rendered.get("method") or "POST").upper()
            request_payload = {
                "url": url,
                "method": method,
                "headers": dict(rendered.get("headers") or {}),
                "body": None if method == "GET" else rendered.get("body"),
            }
            delivery_result = deliver_webhook(
                request_payload=request_payload,
                settings=settings,
            )
            latest_result = {
                "request": request_payload,
                "rendered": rendered,
                "response": delivery_result,
            }
            target_summary = url
        else:
            return _fail_task_instance(
                db,
                instance,
                message="Unsupported task type",
                rendered_summary=rendered,
            )
    except TaskOperationError as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return _fail_task_instance(
            db,
            instance,
            message=detail,
            rendered_summary=rendered,
        )
    except Exception as exc:
        return _fail_task_instance(
            db,
            instance,
            message=str(exc),
            rendered_summary=rendered,
        )

    instance.status = TASK_STATUS_SUCCESS
    instance.latest_result = latest_result
    instance.error_message = None
    instance.finished_at = utcnow()
    instance.updated_at = instance.finished_at
    _make_task_log(
        db,
        task_instance_id=instance.id,
        stage="success",
        actor_name=instance.operator_name or "System",
        rendered_summary=rendered,
        response_summary=latest_result.get("response", {}),
    )
    db.commit()
    db.refresh(instance)
    return _serialize_task_instance_detail(db, instance, target_summary_override=target_summary)


def _task_name(instance: TaskInstance) -> str:
    return str(instance.template_snapshot.get("name") or instance.id)


def _task_target_summary(instance: TaskInstance) -> str:
    latest_result = dict(instance.latest_result or {})
    if instance.task_type == TASK_TYPE_EMAIL:
        recipients = latest_result.get("recipients")
        if isinstance(recipients, dict):
            to_values = [str(item) for item in recipients.get("to", [])]
            if to_values:
                return ", ".join(to_values)
        recipient_config = instance.template_snapshot.get("recipient_config")
        if isinstance(recipient_config, dict):
            return f"to {len(list(recipient_config.get('to', [])))} recipients"
        return "Email"
    if instance.task_type == TASK_TYPE_WEBHOOK:
        request_payload = latest_result.get("request")
        if isinstance(request_payload, dict) and request_payload.get("url"):
            return str(request_payload["url"])
        rendered = latest_result.get("rendered")
        if isinstance(rendered, dict) and rendered.get("url"):
            return str(rendered["url"])
        return "Event ticket context"
    return "Unknown target"


def _serialize_task_instance_summary(
    instance: TaskInstance, *, target_summary_override: str | None = None
) -> dict[str, object]:
    return {
        "id": instance.id,
        "task_template_id": instance.task_template_id,
        "source_event_id": instance.source_event_id,
        "source_binding_id": instance.source_binding_id,
        "ticket_id": instance.ticket_id,
        "task_type": instance.task_type,
        "task_name": _task_name(instance),
        "status": instance.status,
        "target_summary": target_summary_override or _task_target_summary(instance),
        "latest_result": dict(instance.latest_result or {}),
        "error_message": instance.error_message,
        "retry_of_task_id": instance.retry_of_task_id,
        "operator_user_id": instance.operator_user_id,
        "operator_name": instance.operator_name,
        "started_at": instance.started_at,
        "finished_at": instance.finished_at,
        "created_at": instance.created_at,
        "updated_at": instance.updated_at,
    }


def _serialize_task_instance_detail(
    db: Session,
    instance: TaskInstance,
    *,
    target_summary_override: str | None = None,
) -> dict[str, object]:
    logs = list(
        db.scalars(
            select(TaskExecutionLog)
            .where(TaskExecutionLog.task_instance_id == instance.id)
            .order_by(TaskExecutionLog.created_at.asc())
        ).all()
    )
    detail = _serialize_task_instance_summary(
        instance, target_summary_override=target_summary_override
    )
    detail["template_snapshot"] = dict(instance.template_snapshot or {})
    detail["logs"] = [
        {
            "id": log.id,
            "stage": log.stage,
            "actor_user_id": log.actor_user_id,
            "actor_name": log.actor_name,
            "input_summary": dict(log.input_summary or {}),
            "rendered_summary": dict(log.rendered_summary or {}),
            "response_summary": dict(log.response_summary or {}),
            "error_message": log.error_message,
            "created_at": log.created_at,
        }
        for log in logs
    ]
    return detail


def list_tasks(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None = None,
    task_type: str | None = None,
    status: str | None = None,
    source_event_id: str | None = None,
    task_template_id: str | None = None,
    ticket_id: int | None = None,
    failed_only: bool = False,
    started_from: Any | None = None,
    started_to: Any | None = None,
) -> dict[str, object]:
    _require_internal(actor)
    statement = select(TaskInstance).order_by(TaskInstance.created_at.desc())
    if task_type:
        statement = statement.where(TaskInstance.task_type == task_type.strip().upper())
    if status:
        statement = statement.where(TaskInstance.status == status.strip().upper())
    if source_event_id:
        statement = statement.where(TaskInstance.source_event_id == source_event_id)
    if task_template_id:
        statement = statement.where(TaskInstance.task_template_id == task_template_id)
    if ticket_id is not None:
        statement = statement.where(TaskInstance.ticket_id == ticket_id)
    if failed_only:
        statement = statement.where(TaskInstance.status == TASK_STATUS_FAILED)
    if started_from is not None:
        statement = statement.where(TaskInstance.started_at >= started_from)
    if started_to is not None:
        statement = statement.where(TaskInstance.started_at <= started_to)
    items = list(db.scalars(statement).all())

    if search:
        keyword = search.strip().lower()
        items = [
            item
            for item in items
            if keyword in item.id.lower()
            or keyword in _task_name(item).lower()
            or (
                isinstance(item.ticket_id, int)
                and keyword in str(item.ticket_id)
            )
        ]

    return {
        "items": [_serialize_task_instance_summary(item) for item in items],
        "total_count": len(items),
    }


def get_task_detail(db: Session, actor: ActorContext, task_instance_id: str) -> dict[str, object]:
    _require_internal(actor)
    instance = db.scalar(select(TaskInstance).where(TaskInstance.id == task_instance_id))
    if instance is None:
        raise TaskOperationError(404, "Task instance not found")
    return _serialize_task_instance_detail(db, instance)


def enqueue_task_instance_execution(task_instance_id: str) -> None:
    from .tasks import execute_task_instance as execute_task_instance_task

    execute_task_instance_task.delay(task_instance_id=task_instance_id)


def retry_task(
    db: Session,
    settings: Settings,
    actor: ActorContext,
    *,
    task_instance_id: str,
) -> dict[str, object]:
    _require_internal(actor)
    source = db.scalar(select(TaskInstance).where(TaskInstance.id == task_instance_id))
    if source is None:
        raise TaskOperationError(404, "Task instance not found")
    if source.status != TASK_STATUS_FAILED:
        raise TaskOperationError(409, "Only failed tasks can be retried")

    active_retry = db.scalar(
        select(TaskInstance).where(
            TaskInstance.retry_of_task_id == source.id,
            TaskInstance.status.in_([TASK_STATUS_PENDING, TASK_STATUS_RUNNING]),
        )
    )
    if active_retry is not None:
        raise TaskOperationError(409, "A retry task is already pending")

    retry_instance = TaskInstance(
        task_template_id=source.task_template_id,
        source_event_id=source.source_event_id,
        source_binding_id=source.source_binding_id,
        ticket_id=source.ticket_id,
        task_type=source.task_type,
        status=TASK_STATUS_PENDING,
        template_snapshot=dict(source.template_snapshot or {}),
        latest_result={},
        error_message=None,
        retry_of_task_id=source.id,
        operator_user_id=actor.user_id,
        operator_name=actor.display_name,
        started_at=None,
        finished_at=None,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(retry_instance)
    db.flush()
    _make_task_log(
        db,
        task_instance_id=retry_instance.id,
        stage="retry_requested",
        actor_user_id=actor.user_id,
        actor_name=actor.display_name,
        input_summary={"retry_of_task_id": source.id},
    )
    db.commit()
    db.refresh(retry_instance)

    enqueue_task_instance_execution(retry_instance.id)
    db.refresh(retry_instance)
    return _serialize_task_instance_detail(db, retry_instance)
