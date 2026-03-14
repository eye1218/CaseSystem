from __future__ import annotations

import re
import smtplib
from email.message import EmailMessage
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...config import Settings
from ...enums import RoleCode
from ...security import utcnow
from .models import MailSenderAuditLog, MailSenderConfig


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SENDER_STATUS_ENABLED = "ENABLED"
SENDER_STATUS_DISABLED = "DISABLED"
TEST_RESULT_SUCCESS = "SUCCESS"
TEST_RESULT_FAILED = "FAILED"
SUPPORTED_STATUS = {SENDER_STATUS_ENABLED, SENDER_STATUS_DISABLED}
SUPPORTED_SECURITY_TYPES = {"SSL", "TLS", "STARTTLS"}


class MailSenderOperationError(Exception):
    status_code: int
    detail: str | dict[str, object]

    def __init__(self, status_code: int, detail: str | dict[str, object]):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _validation_error(field_errors: dict[str, str]) -> MailSenderOperationError:
    return MailSenderOperationError(
        422,
        {"message": "Validation failed", "field_errors": field_errors},
    )


def _require_admin(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise MailSenderOperationError(403, "Admin role required")


def _normalize_required_text(
    value: str | None,
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> str:
    normalized = (value or "").strip()
    if not normalized:
        field_errors[field_name] = "This field is required"
    return normalized


def _normalize_email(
    value: str | None,
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> str:
    normalized = (value or "").strip()
    if not normalized:
        field_errors[field_name] = "This field is required"
        return ""
    if EMAIL_PATTERN.match(normalized) is None:
        field_errors[field_name] = "A valid email address is required"
    return normalized


def _normalize_port(
    value: int | None,
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> int:
    if value is None:
        field_errors[field_name] = "This field is required"
        return 0
    if value <= 0 or value > 65535:
        field_errors[field_name] = "SMTP port must be in range 1..65535"
    return int(value)


def _normalize_security_type(
    value: str | None,
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> str:
    normalized = (value or "").strip().upper()
    if not normalized:
        field_errors[field_name] = "This field is required"
        return ""
    if normalized not in SUPPORTED_SECURITY_TYPES:
        field_errors[field_name] = "Unsupported security type"
    return normalized


def _normalize_status(
    value: str | None,
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> str:
    normalized = (value or "").strip().upper()
    if not normalized:
        field_errors[field_name] = "This field is required"
        return ""
    if normalized not in SUPPORTED_STATUS:
        field_errors[field_name] = "Unsupported status"
    return normalized


def _serialize_sender(sender: MailSenderConfig) -> dict[str, object]:
    return {
        "id": sender.id,
        "sender_name": sender.sender_name,
        "sender_email": sender.sender_email,
        "auth_account": sender.auth_account,
        "smtp_host": sender.smtp_host,
        "smtp_port": sender.smtp_port,
        "security_type": sender.security_type,
        "status": sender.status,
        "latest_test_status": sender.latest_test_status,
        "latest_test_at": sender.latest_test_at,
        "latest_test_error_summary": sender.latest_test_error_summary,
        "password_configured": bool(sender.auth_password),
        "created_at": sender.created_at,
        "updated_at": sender.updated_at,
    }


def _record_audit(
    db: Session,
    *,
    actor: ActorContext,
    action: str,
    sender_id: str,
    summary: dict[str, object] | None = None,
) -> None:
    db.add(
        MailSenderAuditLog(
            sender_id=sender_id,
            actor_user_id=actor.user_id,
            actor_name=actor.display_name,
            action=action,
            summary=summary or {},
            created_at=utcnow(),
        )
    )


def _get_sender_or_error(db: Session, sender_id: str) -> MailSenderConfig:
    sender = db.scalar(
        select(MailSenderConfig).where(MailSenderConfig.id == sender_id.strip())
    )
    if sender is None:
        raise MailSenderOperationError(404, "Mail sender not found")
    return sender


def _collect_field_errors_for_create(
    *,
    sender_name: str,
    sender_email: str,
    auth_account: str,
    auth_password: str,
    smtp_host: str,
    smtp_port: int,
    security_type: str,
    status: str,
) -> tuple[dict[str, str], dict[str, object]]:
    field_errors: dict[str, str] = {}
    normalized = {
        "sender_name": _normalize_required_text(
            sender_name, field_name="sender_name", field_errors=field_errors
        ),
        "sender_email": _normalize_email(
            sender_email, field_name="sender_email", field_errors=field_errors
        ),
        "auth_account": _normalize_required_text(
            auth_account, field_name="auth_account", field_errors=field_errors
        ),
        "auth_password": _normalize_required_text(
            auth_password, field_name="auth_password", field_errors=field_errors
        ),
        "smtp_host": _normalize_required_text(
            smtp_host, field_name="smtp_host", field_errors=field_errors
        ),
        "smtp_port": _normalize_port(
            smtp_port, field_name="smtp_port", field_errors=field_errors
        ),
        "security_type": _normalize_security_type(
            security_type, field_name="security_type", field_errors=field_errors
        ),
        "status": _normalize_status(status, field_name="status", field_errors=field_errors),
    }
    return field_errors, normalized


def _collect_field_errors_for_patch(
    *,
    sender_name: str | None = None,
    sender_email: str | None = None,
    auth_account: str | None = None,
    auth_password: str | None = None,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    security_type: str | None = None,
    status: str | None = None,
) -> tuple[dict[str, str], dict[str, object]]:
    field_errors: dict[str, str] = {}
    normalized: dict[str, object] = {}
    if sender_name is not None:
        normalized["sender_name"] = _normalize_required_text(
            sender_name, field_name="sender_name", field_errors=field_errors
        )
    if sender_email is not None:
        normalized["sender_email"] = _normalize_email(
            sender_email, field_name="sender_email", field_errors=field_errors
        )
    if auth_account is not None:
        normalized["auth_account"] = _normalize_required_text(
            auth_account, field_name="auth_account", field_errors=field_errors
        )
    if auth_password is not None:
        normalized["auth_password"] = _normalize_required_text(
            auth_password, field_name="auth_password", field_errors=field_errors
        )
    if smtp_host is not None:
        normalized["smtp_host"] = _normalize_required_text(
            smtp_host, field_name="smtp_host", field_errors=field_errors
        )
    if smtp_port is not None:
        normalized["smtp_port"] = _normalize_port(
            smtp_port, field_name="smtp_port", field_errors=field_errors
        )
    if security_type is not None:
        normalized["security_type"] = _normalize_security_type(
            security_type, field_name="security_type", field_errors=field_errors
        )
    if status is not None:
        normalized["status"] = _normalize_status(
            status, field_name="status", field_errors=field_errors
        )
    return field_errors, normalized


def list_mail_senders(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None = None,
    status: str | None = None,
) -> dict[str, object]:
    _require_admin(actor)
    statement = select(MailSenderConfig).order_by(MailSenderConfig.updated_at.desc())
    if status:
        field_errors: dict[str, str] = {}
        normalized_status = _normalize_status(
            status, field_name="status", field_errors=field_errors
        )
        if field_errors:
            raise _validation_error(field_errors)
        statement = statement.where(MailSenderConfig.status == normalized_status)
    if search and search.strip():
        keyword = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                MailSenderConfig.sender_name.ilike(keyword),
                MailSenderConfig.sender_email.ilike(keyword),
                MailSenderConfig.auth_account.ilike(keyword),
            )
        )
    items = list(db.scalars(statement).all())
    return {"items": [_serialize_sender(item) for item in items], "total_count": len(items)}


def get_mail_sender(db: Session, actor: ActorContext, sender_id: str) -> dict[str, object]:
    _require_admin(actor)
    sender = _get_sender_or_error(db, sender_id)
    return _serialize_sender(sender)


def create_mail_sender(
    db: Session,
    actor: ActorContext,
    *,
    sender_name: str,
    sender_email: str,
    auth_account: str,
    auth_password: str,
    smtp_host: str,
    smtp_port: int,
    security_type: str,
    status: str,
) -> dict[str, object]:
    _require_admin(actor)
    field_errors, normalized = _collect_field_errors_for_create(
        sender_name=sender_name,
        sender_email=sender_email,
        auth_account=auth_account,
        auth_password=auth_password,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        security_type=security_type,
        status=status,
    )
    if field_errors:
        raise _validation_error(field_errors)

    sender = MailSenderConfig(
        sender_name=str(normalized["sender_name"]),
        sender_email=str(normalized["sender_email"]),
        auth_account=str(normalized["auth_account"]),
        auth_password=str(normalized["auth_password"]),
        smtp_host=str(normalized["smtp_host"]),
        smtp_port=int(normalized["smtp_port"]),
        security_type=str(normalized["security_type"]),
        status=str(normalized["status"]),
        latest_test_status=None,
        latest_test_at=None,
        latest_test_error_summary=None,
        created_by_user_id=actor.user_id,
        created_by_name=actor.display_name,
        updated_by_user_id=actor.user_id,
        updated_by_name=actor.display_name,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(sender)
    db.flush()
    _record_audit(
        db,
        actor=actor,
        action="mail_sender_created",
        sender_id=sender.id,
        summary={"status": sender.status},
    )
    db.commit()
    db.refresh(sender)
    return _serialize_sender(sender)


def update_mail_sender(
    db: Session,
    actor: ActorContext,
    *,
    sender_id: str,
    sender_name: str | None = None,
    sender_email: str | None = None,
    auth_account: str | None = None,
    auth_password: str | None = None,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    security_type: str | None = None,
    status: str | None = None,
) -> dict[str, object]:
    _require_admin(actor)
    sender = _get_sender_or_error(db, sender_id)
    field_errors, normalized = _collect_field_errors_for_patch(
        sender_name=sender_name,
        sender_email=sender_email,
        auth_account=auth_account,
        auth_password=auth_password,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        security_type=security_type,
        status=status,
    )
    if field_errors:
        raise _validation_error(field_errors)

    for key, value in normalized.items():
        setattr(sender, key, value)
    sender.updated_by_user_id = actor.user_id
    sender.updated_by_name = actor.display_name
    sender.updated_at = utcnow()
    _record_audit(
        db,
        actor=actor,
        action="mail_sender_updated",
        sender_id=sender.id,
        summary={"updated_fields": sorted(normalized.keys())},
    )
    db.commit()
    db.refresh(sender)
    return _serialize_sender(sender)


def update_mail_sender_status(
    db: Session,
    actor: ActorContext,
    *,
    sender_id: str,
    status: str,
) -> dict[str, object]:
    _require_admin(actor)
    sender = _get_sender_or_error(db, sender_id)
    field_errors: dict[str, str] = {}
    normalized_status = _normalize_status(
        status, field_name="status", field_errors=field_errors
    )
    if field_errors:
        raise _validation_error(field_errors)
    sender.status = normalized_status
    sender.updated_by_user_id = actor.user_id
    sender.updated_by_name = actor.display_name
    sender.updated_at = utcnow()
    _record_audit(
        db,
        actor=actor,
        action="mail_sender_status_updated",
        sender_id=sender.id,
        summary={"status": sender.status},
    )
    db.commit()
    db.refresh(sender)
    return _serialize_sender(sender)


def _sanitize_exception_message(raw_message: str, *, secrets: list[str]) -> str:
    sanitized = raw_message
    for secret in secrets:
        if secret:
            sanitized = sanitized.replace(secret, "***")
    return sanitized.strip()


def _summarize_test_exception(sender: MailSenderConfig, exc: Exception) -> str:
    raw_message = str(exc) or exc.__class__.__name__
    sanitized = _sanitize_exception_message(
        raw_message, secrets=[sender.auth_password]
    )
    lower_sanitized = sanitized.lower()
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return f"SMTP authentication failed: {sanitized or 'Authentication failed'}"
    if isinstance(
        exc,
        (
            smtplib.SMTPDataError,
            smtplib.SMTPRecipientsRefused,
            smtplib.SMTPSenderRefused,
            smtplib.SMTPResponseException,
        ),
    ) or "recipient" in lower_sanitized or "sender" in lower_sanitized:
        return f"SMTP send failed: {sanitized or 'Send failed'}"
    if isinstance(
        exc,
        (
            OSError,
            TimeoutError,
            ConnectionError,
            smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected,
        ),
    ) or "connection" in lower_sanitized:
        return f"SMTP connection failed: {sanitized or 'Connection failed'}"
    return f"SMTP send failed: {sanitized or 'Send failed'}"


def send_mail_sender_test_email(
    *,
    sender: MailSenderConfig,
    test_email: str,
    settings: Settings,
) -> None:
    message = EmailMessage()
    message["Subject"] = "[CaseSystem] Mail Sender Configuration Test"
    message["From"] = f"{sender.sender_name} <{sender.sender_email}>"
    message["To"] = test_email
    message.set_content(
        "\n".join(
            [
                "This is a fixed test email generated by CaseSystem.",
                f"Sender config: {sender.sender_name} ({sender.sender_email})",
                f"Executed at: {utcnow().isoformat()}",
            ]
        )
    )

    use_ssl = sender.security_type in {"SSL", "TLS"}
    if use_ssl:
        smtp_client = smtplib.SMTP_SSL(
            sender.smtp_host,
            sender.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        )
    else:
        smtp_client = smtplib.SMTP(
            sender.smtp_host,
            sender.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        )

    with smtp_client as smtp:
        if sender.security_type == "STARTTLS":
            smtp.starttls()
        smtp.login(sender.auth_account, sender.auth_password)
        smtp.send_message(message)


def test_mail_sender(
    db: Session,
    settings: Settings,
    actor: ActorContext,
    *,
    sender_id: str,
    test_email: str,
) -> dict[str, object]:
    _require_admin(actor)
    sender = _get_sender_or_error(db, sender_id)

    field_errors: dict[str, str] = {}
    normalized_test_email = _normalize_email(
        test_email, field_name="test_email", field_errors=field_errors
    )
    if field_errors:
        raise _validation_error(field_errors)

    tested_at = utcnow()
    result = TEST_RESULT_SUCCESS
    error_summary: str | None = None
    try:
        send_mail_sender_test_email(
            sender=sender,
            test_email=normalized_test_email,
            settings=settings,
        )
    except Exception as exc:
        result = TEST_RESULT_FAILED
        error_summary = _summarize_test_exception(sender, exc)

    sender.latest_test_status = result
    sender.latest_test_at = tested_at
    sender.latest_test_error_summary = error_summary
    sender.updated_by_user_id = actor.user_id
    sender.updated_by_name = actor.display_name
    sender.updated_at = tested_at
    _record_audit(
        db,
        actor=actor,
        action="mail_sender_tested",
        sender_id=sender.id,
        summary={"result": result},
    )
    db.commit()
    db.refresh(sender)
    return {
        "sender_id": sender.id,
        "result": result,
        "tested_at": tested_at,
        "error_summary": error_summary,
    }


def resolve_enabled_mail_sender(db: Session, sender_id: str) -> MailSenderConfig:
    sender = _get_sender_or_error(db, sender_id)
    if sender.status != SENDER_STATUS_ENABLED:
        raise MailSenderOperationError(409, "Mail sender is disabled")
    return sender
