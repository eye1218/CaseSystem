from __future__ import annotations

from collections import defaultdict
from contextlib import closing
import re
import socket
from typing import Any

import pymysql
from pymysql.cursors import DictCursor
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...enums import RoleCode
from ...security import utcnow
from .models import AlertSourceAuditLog, AlertSourceConfig


STATUS_ENABLED = "ENABLED"
STATUS_DISABLED = "DISABLED"
TEST_RESULT_SUCCESS = "SUCCESS"
TEST_RESULT_FAILED = "FAILED"
SUPPORTED_STATUS = {STATUS_ENABLED, STATUS_DISABLED}
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class AlertSourceOperationError(Exception):
    status_code: int
    detail: str | dict[str, object]

    def __init__(self, status_code: int, detail: str | dict[str, object]):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _validation_error(field_errors: dict[str, str]) -> AlertSourceOperationError:
    return AlertSourceOperationError(
        422,
        {"message": "Validation failed", "field_errors": field_errors},
    )


def _require_admin(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise AlertSourceOperationError(403, "Admin role required")


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


def _normalize_port(value: int | None, *, field_name: str, field_errors: dict[str, str]) -> int:
    if value is None:
        field_errors[field_name] = "This field is required"
        return 0
    if value <= 0 or value > 65535:
        field_errors[field_name] = "Port must be in range 1..65535"
    return int(value)


def _normalize_identifier(
    value: str | None,
    *,
    field_name: str,
    field_errors: dict[str, str],
) -> str:
    normalized = (value or "").strip()
    if not normalized:
        field_errors[field_name] = "This field is required"
        return ""
    if IDENTIFIER_PATTERN.match(normalized) is None:
        field_errors[field_name] = "Only letters, digits, and underscores are allowed"
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


def _serialize_source(source: AlertSourceConfig) -> dict[str, object]:
    return {
        "id": source.id,
        "name": source.name,
        "host": source.host,
        "port": source.port,
        "username": source.username,
        "database_name": source.database_name,
        "table_name": source.table_name,
        "ticket_match_field": source.ticket_match_field,
        "status": source.status,
        "latest_test_status": source.latest_test_status,
        "latest_test_at": source.latest_test_at,
        "latest_test_error_summary": source.latest_test_error_summary,
        "password_configured": bool(source.password),
        "created_at": source.created_at,
        "updated_at": source.updated_at,
    }


def _record_audit(
    db: Session,
    *,
    actor: ActorContext,
    action: str,
    source_id: str,
    summary: dict[str, object] | None = None,
) -> None:
    db.add(
        AlertSourceAuditLog(
            source_id=source_id,
            actor_user_id=actor.user_id,
            actor_name=actor.display_name,
            action=action,
            summary=summary or {},
            created_at=utcnow(),
        )
    )


def _get_source_or_error(db: Session, source_id: str) -> AlertSourceConfig:
    source = db.scalar(select(AlertSourceConfig).where(AlertSourceConfig.id == source_id.strip()))
    if source is None:
        raise AlertSourceOperationError(404, "Alert source not found")
    return source


def get_preferred_enabled_alert_source(db: Session) -> AlertSourceConfig | None:
    statement = (
        select(AlertSourceConfig)
        .where(AlertSourceConfig.status == STATUS_ENABLED)
        .order_by(
            case((AlertSourceConfig.latest_test_status == TEST_RESULT_SUCCESS, 0), else_=1),
            AlertSourceConfig.updated_at.desc(),
        )
    )
    return db.scalar(statement)


def _collect_field_errors_for_create(
    *,
    name: str,
    host: str,
    port: int,
    username: str,
    password: str,
    database_name: str,
    table_name: str,
    ticket_match_field: str,
    status: str,
) -> tuple[dict[str, str], dict[str, object]]:
    field_errors: dict[str, str] = {}
    normalized = {
        "name": _normalize_required_text(name, field_name="name", field_errors=field_errors),
        "host": _normalize_required_text(host, field_name="host", field_errors=field_errors),
        "port": _normalize_port(port, field_name="port", field_errors=field_errors),
        "username": _normalize_required_text(username, field_name="username", field_errors=field_errors),
        "password": _normalize_required_text(password, field_name="password", field_errors=field_errors),
        "database_name": _normalize_identifier(database_name, field_name="database_name", field_errors=field_errors),
        "table_name": _normalize_identifier(table_name, field_name="table_name", field_errors=field_errors),
        "ticket_match_field": _normalize_identifier(
            ticket_match_field, field_name="ticket_match_field", field_errors=field_errors
        ),
        "status": _normalize_status(status, field_name="status", field_errors=field_errors),
    }
    return field_errors, normalized


def _collect_field_errors_for_patch(
    *,
    name: str | None = None,
    host: str | None = None,
    port: int | None = None,
    username: str | None = None,
    password: str | None = None,
    database_name: str | None = None,
    table_name: str | None = None,
    ticket_match_field: str | None = None,
    status: str | None = None,
) -> tuple[dict[str, str], dict[str, object]]:
    field_errors: dict[str, str] = {}
    normalized: dict[str, object] = {}
    if name is not None:
        normalized["name"] = _normalize_required_text(name, field_name="name", field_errors=field_errors)
    if host is not None:
        normalized["host"] = _normalize_required_text(host, field_name="host", field_errors=field_errors)
    if port is not None:
        normalized["port"] = _normalize_port(port, field_name="port", field_errors=field_errors)
    if username is not None:
        normalized["username"] = _normalize_required_text(username, field_name="username", field_errors=field_errors)
    if password is not None:
        normalized["password"] = _normalize_required_text(password, field_name="password", field_errors=field_errors)
    if database_name is not None:
        normalized["database_name"] = _normalize_identifier(
            database_name, field_name="database_name", field_errors=field_errors
        )
    if table_name is not None:
        normalized["table_name"] = _normalize_identifier(
            table_name, field_name="table_name", field_errors=field_errors
        )
    if ticket_match_field is not None:
        normalized["ticket_match_field"] = _normalize_identifier(
            ticket_match_field, field_name="ticket_match_field", field_errors=field_errors
        )
    if status is not None:
        normalized["status"] = _normalize_status(status, field_name="status", field_errors=field_errors)
    return field_errors, normalized


def _connect_external_source(source: AlertSourceConfig):
    return pymysql.connect(
        host=source.host,
        port=source.port,
        user=source.username,
        password=source.password,
        database=source.database_name,
        charset="utf8mb4",
        cursorclass=DictCursor,
        connect_timeout=5,
        read_timeout=15,
        write_timeout=15,
        autocommit=True,
    )


def _describe_external_error(exc: Exception) -> str:
    if isinstance(exc, pymysql.err.OperationalError):
        return f"Operational error: {exc.args[-1]}"
    if isinstance(exc, pymysql.MySQLError):
        return f"MySQL error: {exc.args[-1]}"
    if isinstance(exc, socket.timeout):
        return "Connection timeout"
    return str(exc) or exc.__class__.__name__


def _probe_alert_source(source: AlertSourceConfig) -> list[str]:
    with closing(_connect_external_source(source)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 AS ok")
            cursor.fetchone()
            cursor.execute(f"SHOW COLUMNS FROM `{source.table_name}`")
            rows = cursor.fetchall()
    columns = [str(row.get("Field", "")) for row in rows if row.get("Field")]
    if source.ticket_match_field not in columns:
        raise AlertSourceOperationError(
            422,
            f"Configured match field '{source.ticket_match_field}' does not exist in table '{source.table_name}'",
        )
    return columns


def _normalize_ticket_keys(ticket_keys: list[str]) -> list[str]:
    normalized = []
    seen: set[str] = set()
    for value in ticket_keys:
        item = value.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


def _query_alert_rows(source: AlertSourceConfig, ticket_keys: list[str]) -> list[dict[str, Any]]:
    placeholders = ", ".join(["%s"] * len(ticket_keys))
    sql = (
        f"SELECT * FROM `{source.table_name}` "
        f"WHERE `{source.ticket_match_field}` IN ({placeholders}) "
        f"ORDER BY `{source.ticket_match_field}`"
    )
    with closing(_connect_external_source(source)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, ticket_keys)
            rows = cursor.fetchall()
    return [dict(row) for row in rows]


def list_alert_sources(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None = None,
    status: str | None = None,
) -> dict[str, object]:
    _require_admin(actor)
    statement = select(AlertSourceConfig).order_by(AlertSourceConfig.updated_at.desc())
    if status:
        field_errors: dict[str, str] = {}
        normalized_status = _normalize_status(status, field_name="status", field_errors=field_errors)
        if field_errors:
            raise _validation_error(field_errors)
        statement = statement.where(AlertSourceConfig.status == normalized_status)
    if search and search.strip():
        keyword = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                AlertSourceConfig.name.ilike(keyword),
                AlertSourceConfig.host.ilike(keyword),
                AlertSourceConfig.username.ilike(keyword),
                AlertSourceConfig.database_name.ilike(keyword),
                AlertSourceConfig.table_name.ilike(keyword),
            )
        )
    items = list(db.scalars(statement).all())
    return {"items": [_serialize_source(item) for item in items], "total_count": len(items)}


def get_alert_source(db: Session, actor: ActorContext, source_id: str) -> dict[str, object]:
    _require_admin(actor)
    source = _get_source_or_error(db, source_id)
    return _serialize_source(source)


def create_alert_source(
    db: Session,
    actor: ActorContext,
    *,
    name: str,
    host: str,
    port: int,
    username: str,
    password: str,
    database_name: str,
    table_name: str,
    ticket_match_field: str,
    status: str,
) -> dict[str, object]:
    _require_admin(actor)
    field_errors, normalized = _collect_field_errors_for_create(
        name=name,
        host=host,
        port=port,
        username=username,
        password=password,
        database_name=database_name,
        table_name=table_name,
        ticket_match_field=ticket_match_field,
        status=status,
    )
    if field_errors:
        raise _validation_error(field_errors)

    source = AlertSourceConfig(
        name=str(normalized["name"]),
        host=str(normalized["host"]),
        port=int(normalized["port"]),
        username=str(normalized["username"]),
        password=str(normalized["password"]),
        database_name=str(normalized["database_name"]),
        table_name=str(normalized["table_name"]),
        ticket_match_field=str(normalized["ticket_match_field"]),
        status=str(normalized["status"]),
        created_by_user_id=actor.user_id,
        created_by_name=actor.display_name,
        updated_by_user_id=actor.user_id,
        updated_by_name=actor.display_name,
    )
    db.add(source)
    db.flush()
    _record_audit(
        db,
        actor=actor,
        action="alert_source.created",
        source_id=source.id,
        summary={"name": source.name, "host": source.host, "database_name": source.database_name},
    )
    db.commit()
    db.refresh(source)
    return _serialize_source(source)


def update_alert_source(
    db: Session,
    actor: ActorContext,
    *,
    source_id: str,
    name: str | None = None,
    host: str | None = None,
    port: int | None = None,
    username: str | None = None,
    password: str | None = None,
    database_name: str | None = None,
    table_name: str | None = None,
    ticket_match_field: str | None = None,
    status: str | None = None,
) -> dict[str, object]:
    _require_admin(actor)
    source = _get_source_or_error(db, source_id)
    field_errors, normalized = _collect_field_errors_for_patch(
        name=name,
        host=host,
        port=port,
        username=username,
        password=password,
        database_name=database_name,
        table_name=table_name,
        ticket_match_field=ticket_match_field,
        status=status,
    )
    if field_errors:
        raise _validation_error(field_errors)

    for field_name, value in normalized.items():
        setattr(source, field_name, value)
    source.updated_by_user_id = actor.user_id
    source.updated_by_name = actor.display_name
    source.updated_at = utcnow()
    _record_audit(
        db,
        actor=actor,
        action="alert_source.updated",
        source_id=source.id,
        summary={"updated_fields": sorted(normalized.keys())},
    )
    db.commit()
    db.refresh(source)
    return _serialize_source(source)


def update_alert_source_status(
    db: Session,
    actor: ActorContext,
    *,
    source_id: str,
    status: str,
) -> dict[str, object]:
    _require_admin(actor)
    source = _get_source_or_error(db, source_id)
    field_errors: dict[str, str] = {}
    normalized_status = _normalize_status(status, field_name="status", field_errors=field_errors)
    if field_errors:
        raise _validation_error(field_errors)

    source.status = normalized_status
    source.updated_by_user_id = actor.user_id
    source.updated_by_name = actor.display_name
    source.updated_at = utcnow()
    _record_audit(
        db,
        actor=actor,
        action="alert_source.status_updated",
        source_id=source.id,
        summary={"status": normalized_status},
    )
    db.commit()
    db.refresh(source)
    return _serialize_source(source)


def test_alert_source(
    db: Session,
    actor: ActorContext,
    *,
    source_id: str,
) -> dict[str, object]:
    _require_admin(actor)
    source = _get_source_or_error(db, source_id)
    tested_at = utcnow()
    try:
        sample_columns = _probe_alert_source(source)
        source.latest_test_status = TEST_RESULT_SUCCESS
        source.latest_test_at = tested_at
        source.latest_test_error_summary = None
        source.updated_by_user_id = actor.user_id
        source.updated_by_name = actor.display_name
        source.updated_at = tested_at
        _record_audit(
            db,
            actor=actor,
            action="alert_source.tested",
            source_id=source.id,
            summary={"result": TEST_RESULT_SUCCESS, "sample_columns": sample_columns[:20]},
        )
        db.commit()
        db.refresh(source)
        return {
            "source_id": source.id,
            "result": TEST_RESULT_SUCCESS,
            "tested_at": tested_at,
            "message": "Connection succeeded",
            "sample_columns": sample_columns,
            "error_summary": None,
        }
    except AlertSourceOperationError as exc:
        summary = (
            exc.detail
            if isinstance(exc.detail, str)
            else str(exc.detail.get("message") or exc.detail)
        )
        source.latest_test_status = TEST_RESULT_FAILED
        source.latest_test_at = tested_at
        source.latest_test_error_summary = summary
        source.updated_by_user_id = actor.user_id
        source.updated_by_name = actor.display_name
        source.updated_at = tested_at
        _record_audit(
            db,
            actor=actor,
            action="alert_source.tested",
            source_id=source.id,
            summary={"result": TEST_RESULT_FAILED, "error_summary": summary},
        )
        db.commit()
        db.refresh(source)
        return {
            "source_id": source.id,
            "result": TEST_RESULT_FAILED,
            "tested_at": tested_at,
            "message": "Connection failed",
            "sample_columns": [],
            "error_summary": summary,
        }
    except Exception as exc:
        summary = _describe_external_error(exc)
        source.latest_test_status = TEST_RESULT_FAILED
        source.latest_test_at = tested_at
        source.latest_test_error_summary = summary
        source.updated_by_user_id = actor.user_id
        source.updated_by_name = actor.display_name
        source.updated_at = tested_at
        _record_audit(
            db,
            actor=actor,
            action="alert_source.tested",
            source_id=source.id,
            summary={"result": TEST_RESULT_FAILED, "error_summary": summary},
        )
        db.commit()
        db.refresh(source)
        return {
            "source_id": source.id,
            "result": TEST_RESULT_FAILED,
            "tested_at": tested_at,
            "message": "Connection failed",
            "sample_columns": [],
            "error_summary": summary,
        }


def query_alert_source_by_tickets(
    db: Session,
    actor: ActorContext,
    *,
    source_id: str,
    ticket_keys: list[str],
) -> dict[str, object]:
    _require_admin(actor)
    source = _get_source_or_error(db, source_id)
    if source.status != STATUS_ENABLED:
        raise AlertSourceOperationError(422, "Alert source must be enabled before querying")

    normalized_keys = _normalize_ticket_keys(ticket_keys)
    if not normalized_keys:
        raise _validation_error({"ticket_keys": "At least one ticket key is required"})
    if len(normalized_keys) > 500:
        raise _validation_error({"ticket_keys": "At most 500 ticket keys are allowed"})

    try:
        rows = _query_alert_rows(source, normalized_keys)
    except Exception as exc:
        raise AlertSourceOperationError(502, _describe_external_error(exc)) from exc

    grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = row.get(source.ticket_match_field)
        grouped_rows[str(key)].append(row)

    items = [
        {
            "ticket_key": ticket_key,
            "row_count": len(grouped_rows.get(ticket_key, [])),
            "rows": grouped_rows.get(ticket_key, []),
        }
        for ticket_key in normalized_keys
    ]
    matched_ticket_keys = [item["ticket_key"] for item in items if item["row_count"] > 0]
    unmatched_ticket_keys = [item["ticket_key"] for item in items if item["row_count"] == 0]
    return {
        "source_id": source.id,
        "table_name": source.table_name,
        "ticket_match_field": source.ticket_match_field,
        "queried_ticket_keys": normalized_keys,
        "matched_ticket_keys": matched_ticket_keys,
        "unmatched_ticket_keys": unmatched_ticket_keys,
        "total_rows": len(rows),
        "items": items,
    }
