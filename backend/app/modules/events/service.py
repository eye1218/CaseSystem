from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from celery import group
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from ...auth import ActorContext
from ...enums import RoleCode, TicketMainStatus, TicketSubStatus
from ...models import User, UserRole
from ...security import utcnow
from ...worker.celery_app import celery_app
from ..config.service import get_config
from ..realtime.service import deliver_notification
from ..tasks.service import (
    list_bindable_task_templates,
    serialize_bound_task_templates,
    validate_bindable_task_template_ids,
)
from ..tickets.models import Ticket
from ..tickets.seed_data import CATEGORY_NAMES
from .enums import EventQueueStatus, EventQueueType, EventRuleStatus, EventRuleType
from .models import Event, EventBinding, EventRule, EventRuleBinding

IMMEDIATE_EVENT_DISPATCH_SESSION_KEY = "event_immediate_dispatch_ids"

TRIGGER_POINT_LABELS: dict[str, str] = {
    "ticket.created": "工单创建",
    "ticket.updated": "工单更新",
    "ticket.assigned": "工单被领取或分配",
    "ticket.status.changed": "工单状态变更",
    "ticket.response.timeout": "响应超时",
    "ticket.resolution.timeout": "处置超时",
    "ticket.closed": "工单关闭",
    "ticket.reopened": "工单重开",
    "ticket.escalated": "工单升级",
    "ticket.escalation.requested": "升级给指定人员已发起",
    "ticket.escalation.rejected": "升级给指定人员被拒",
    "ticket.escalation.accepted": "升级被接收",
}

SUPPORTED_FILTER_FIELDS = {"priority", "category", "risk_score", "created_at"}
SUPPORTED_RULE_STATUSES = {
    EventRuleStatus.DRAFT.value,
    EventRuleStatus.ENABLED.value,
    EventRuleStatus.DISABLED.value,
}
SUPPORTED_TIME_UNITS = {"minutes", "hours", "days"}
TICKET_TIMEOUT_SIGNAL_KIND = "ticket_timeout_signal"
TICKET_TIMEOUT_REMINDER_SIGNAL_KIND = "ticket_timeout_reminder_signal"
TICKET_TIMEOUT_REMINDER_CATEGORY = "ticket.timeout_reminder"
TICKET_TIMEOUT_REMINDER_KEY = "DEFAULT"
DEFAULT_RESPONSE_REMINDER_MINUTES = 5
DEFAULT_RESOLUTION_REMINDER_MINUTES = 30
TICKET_TIMEOUT_REMINDER_RESPONSE_CATEGORY = "ticket_timeout_response_reminder"
TICKET_TIMEOUT_REMINDER_RESOLUTION_CATEGORY = "ticket_timeout_resolution_reminder"
REMINDER_KIND_RESPONSE = "response"
REMINDER_KIND_RESOLUTION = "resolution"
ACTIVE_TIMEOUT_REMINDER_STATUSES = {
    TicketMainStatus.WAITING_RESPONSE.value,
    TicketMainStatus.IN_PROGRESS.value,
}


class EventOperationError(Exception):
    status_code: int
    detail: Any

    def __init__(self, status_code: int, detail: Any):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _require_admin_actor(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise EventOperationError(403, "Admin role required")


def _ensure_rule_exists(db: Session, event_id: str) -> EventRule:
    rule = db.scalar(select(EventRule).where(EventRule.id == event_id))
    if rule is None:
        raise EventOperationError(404, "Event not found")
    return rule


def _ticket_related_object(ticket_id: int) -> str:
    return f"ticket:{ticket_id}"


def _coerce_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_iso_datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return _coerce_datetime(parsed) or parsed


def _timedelta_for(amount: int, unit: str) -> timedelta:
    if unit == "minutes":
        return timedelta(minutes=amount)
    if unit == "hours":
        return timedelta(hours=amount)
    if unit == "days":
        return timedelta(days=amount)
    raise EventOperationError(422, f"Unsupported time unit `{unit}`")


def _normalize_reminder_minutes(value: object, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if parsed <= 0:
        return default
    return parsed


def resolve_ticket_timeout_reminder_minutes(db: Session) -> tuple[int, int]:
    config = get_config(db, TICKET_TIMEOUT_REMINDER_CATEGORY, TICKET_TIMEOUT_REMINDER_KEY)
    if config is None or not config.is_active or not isinstance(config.value, dict):
        return DEFAULT_RESPONSE_REMINDER_MINUTES, DEFAULT_RESOLUTION_REMINDER_MINUTES

    value = config.value
    response_minutes = _normalize_reminder_minutes(
        value.get("response_reminder_minutes"), DEFAULT_RESPONSE_REMINDER_MINUTES
    )
    resolution_minutes = _normalize_reminder_minutes(
        value.get("resolution_reminder_minutes"), DEFAULT_RESOLUTION_REMINDER_MINUTES
    )
    return response_minutes, resolution_minutes


def _validation_error(field_errors: dict[str, str]) -> EventOperationError:
    return EventOperationError(
        422,
        {
            "message": "Validation failed",
            "field_errors": field_errors,
        },
    )


def _normalize_code(value: str | None, fallback_name: str | None) -> str:
    if value and value.strip():
        return value.strip()
    base = (fallback_name or "event").strip().lower().replace(" ", "_")
    base = "".join(char if char.isalnum() or char == "_" else "_" for char in base)
    base = "_".join(filter(None, base.split("_")))[:48] or "event"
    return f"evt_{base}_{uuid.uuid4().hex[:6]}"


def _normalize_tags(raw_tags: Any) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for value in raw_tags or []:
        tag = str(value).strip()
        if not tag:
            continue
        if tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return tags


def _normalize_filters(raw_filters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    field_errors: dict[str, str] = {}
    normalized: list[dict[str, Any]] = []

    for index, item in enumerate(raw_filters):
        field = str(item.get("field") or "").strip()
        operator = str(item.get("operator") or "").strip()
        if field not in SUPPORTED_FILTER_FIELDS:
            field_errors[f"filters[{index}].field"] = "Unsupported filter field"
            continue

        if field in {"priority", "category"}:
            if operator != "in":
                field_errors[f"filters[{index}].operator"] = "Only `in` is supported"
                continue
            values = [str(value).strip() for value in item.get("values", []) if str(value).strip()]
            if not values:
                field_errors[f"filters[{index}].values"] = "At least one value is required"
                continue
            normalized.append({"field": field, "operator": "in", "values": values})
            continue

        if field == "risk_score":
            if operator != "between":
                field_errors[f"filters[{index}].operator"] = "Only `between` is supported"
                continue
            min_value = item.get("min_value")
            max_value = item.get("max_value")
            if not isinstance(min_value, int) or not isinstance(max_value, int):
                field_errors[f"filters[{index}].range"] = "Risk score range is required"
                continue
            if min_value < 0 or max_value > 100 or min_value > max_value:
                field_errors[f"filters[{index}].range"] = "Risk score must be within 0-100"
                continue
            normalized.append(
                {
                    "field": "risk_score",
                    "operator": "between",
                    "min_value": min_value,
                    "max_value": max_value,
                }
            )
            continue

        if field == "created_at":
            if operator != "between" or item.get("relative_time") is not None:
                field_errors[f"filters[{index}].operator"] = "Created time only supports absolute ranges"
                continue
            start_at = _coerce_datetime(item.get("start_at"))
            end_at = _coerce_datetime(item.get("end_at"))
            if start_at is None or end_at is None:
                field_errors[f"filters[{index}].range"] = "Absolute date range is required"
                continue
            if start_at > end_at:
                field_errors[f"filters[{index}].range"] = "Start time must be before end time"
                continue
            normalized.append(
                {
                    "field": "created_at",
                    "operator": "between",
                    "start_at": start_at.isoformat(),
                    "end_at": end_at.isoformat(),
                }
            )

    if field_errors:
        raise _validation_error(field_errors)
    return normalized


def _normalize_time_rule(event_type: str, raw_rule: dict[str, Any]) -> dict[str, Any]:
    errors: dict[str, str] = {}

    if event_type == EventRuleType.NORMAL.value:
        mode = str(raw_rule.get("mode") or "").strip()
        if mode not in {"immediate", "delayed"}:
            errors["time_rule.mode"] = "Normal event only supports immediate or delayed"
        elif mode == "immediate":
            return {"mode": "immediate"}
        else:
            delay_amount = raw_rule.get("delay_amount")
            delay_unit = str(raw_rule.get("delay_unit") or "").strip()
            if not isinstance(delay_amount, int) or delay_amount <= 0:
                errors["time_rule.delay_amount"] = "Delay amount must be a positive integer"
            if delay_unit not in SUPPORTED_TIME_UNITS:
                errors["time_rule.delay_unit"] = "Unsupported delay unit"
            if errors:
                raise _validation_error(errors)
            return {
                "mode": "delayed",
                "delay_amount": delay_amount,
                "delay_unit": delay_unit,
            }

    if event_type == EventRuleType.TIMER.value:
        target_offset_amount = raw_rule.get("target_offset_amount")
        target_offset_unit = str(raw_rule.get("target_offset_unit") or "").strip()
        adjustment_direction = str(raw_rule.get("adjustment_direction") or "after").strip()
        adjustment_amount = raw_rule.get("adjustment_amount", 0)
        adjustment_unit = str(raw_rule.get("adjustment_unit") or target_offset_unit).strip()
        if not isinstance(target_offset_amount, int) or target_offset_amount <= 0:
            errors["time_rule.target_offset_amount"] = "Target offset must be a positive integer"
        if target_offset_unit not in SUPPORTED_TIME_UNITS:
            errors["time_rule.target_offset_unit"] = "Unsupported target offset unit"
        if adjustment_direction not in {"before", "after"}:
            errors["time_rule.adjustment_direction"] = "Adjustment direction must be before or after"
        if not isinstance(adjustment_amount, int) or adjustment_amount < 0:
            errors["time_rule.adjustment_amount"] = "Adjustment amount must be a non-negative integer"
        if adjustment_unit not in SUPPORTED_TIME_UNITS:
            errors["time_rule.adjustment_unit"] = "Unsupported adjustment unit"
        if errors:
            raise _validation_error(errors)
        return {
            "mode": "timer",
            "target_offset_amount": target_offset_amount,
            "target_offset_unit": target_offset_unit,
            "adjustment_direction": adjustment_direction,
            "adjustment_amount": adjustment_amount,
            "adjustment_unit": adjustment_unit,
        }

    errors["event_type"] = "Unsupported event type"
    raise _validation_error(errors)


def _normalize_rule_payload(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    field_errors: dict[str, str] = {}

    name = str(data.get("name") or "").strip()
    if not name:
        field_errors["name"] = "Event name is required"

    event_type = str(data.get("event_type") or "").strip()
    if event_type not in {EventRuleType.NORMAL.value, EventRuleType.TIMER.value}:
        field_errors["event_type"] = "Unsupported event type"

    status = str(data.get("status") or "").strip()
    if status not in SUPPORTED_RULE_STATUSES:
        field_errors["status"] = "Unsupported rule status"

    trigger_point = str(data.get("trigger_point") or "").strip()
    if trigger_point not in TRIGGER_POINT_LABELS:
        field_errors["trigger_point"] = "Unsupported trigger point"

    task_template_ids = [
        str(item).strip() for item in data.get("task_template_ids", []) if str(item).strip()
    ]
    task_template_ids = list(dict.fromkeys(task_template_ids))
    if not task_template_ids:
        field_errors["task_template_ids"] = "At least one task template is required"
    else:
        try:
            task_template_ids = validate_bindable_task_template_ids(db, task_template_ids)
        except Exception as exc:
            detail = getattr(exc, "detail", None)
            if isinstance(detail, dict):
                field_errors.update(dict(detail.get("field_errors", {})))
            else:
                raise

    normalized_filters: list[dict[str, Any]] = []
    try:
        normalized_filters = _normalize_filters([dict(item) for item in data.get("filters", [])])
    except EventOperationError as exc:
        if isinstance(exc.detail, dict):
            field_errors.update(dict(exc.detail.get("field_errors", {})))
        else:
            raise

    normalized_time_rule: dict[str, Any] = {}
    if event_type in {EventRuleType.NORMAL.value, EventRuleType.TIMER.value}:
        try:
            normalized_time_rule = _normalize_time_rule(
                event_type,
                dict(data.get("time_rule", {})),
            )
        except EventOperationError as exc:
            if isinstance(exc.detail, dict):
                field_errors.update(dict(exc.detail.get("field_errors", {})))
            else:
                raise

    if field_errors:
        raise _validation_error(field_errors)

    return {
        "name": name,
        "code": _normalize_code(data.get("code"), name),
        "event_type": event_type,
        "status": status,
        "trigger_point": trigger_point,
        "object_type": "ticket",
        "description": str(data.get("description") or "").strip() or None,
        "tags": _normalize_tags(data.get("tags")),
        "filters": normalized_filters,
        "time_rule": normalized_time_rule,
        "task_template_ids": task_template_ids,
    }


def _ensure_unique_code(db: Session, code: str, *, exclude_rule_id: str | None = None) -> None:
    existing = db.scalar(select(EventRule).where(EventRule.code == code))
    if existing is None:
        return
    if exclude_rule_id is not None and existing.id == exclude_rule_id:
        return
    raise EventOperationError(409, "Event code already exists")


def _trigger_summary(trigger_point: str, event_type: str, time_rule: dict[str, Any]) -> str:
    trigger_label = TRIGGER_POINT_LABELS.get(trigger_point, trigger_point)
    if event_type == EventRuleType.NORMAL.value:
        if time_rule.get("mode") == "immediate":
            return f"在{trigger_label}时立即触发"
        return (
            f"在{trigger_label}后延迟 {time_rule['delay_amount']} "
            f"{time_rule['delay_unit']} 触发"
        )

    return (
        "基于工单创建时间 + "
        f"{time_rule['target_offset_amount']} {time_rule['target_offset_unit']}，"
        f"并{('提前' if time_rule['adjustment_direction'] == 'before' else '延后')}"
        f" {time_rule['adjustment_amount']} {time_rule['adjustment_unit']} 触发"
    )


def _filter_summary(filters: list[dict[str, Any]]) -> str:
    if not filters:
        return "不限制工单条件"

    parts: list[str] = []
    for item in filters:
        if item["field"] == "priority":
            parts.append(f"优先级 in {', '.join(item['values'])}")
        elif item["field"] == "category":
            values = [CATEGORY_NAMES.get(value, value) for value in item["values"]]
            parts.append(f"工单分类 in {', '.join(values)}")
        elif item["field"] == "risk_score":
            parts.append(f"风险分数 {item['min_value']} - {item['max_value']}")
        elif item["field"] == "created_at":
            parts.append(f"创建时间 {item['start_at']} 至 {item['end_at']}")
    return " 且 ".join(parts)


def _task_template_ids_for_rule(db: Session, rule_id: str) -> list[str]:
    return list(
        db.scalars(
            select(EventRuleBinding.task_template_id)
            .where(EventRuleBinding.event_rule_id == rule_id)
            .order_by(EventRuleBinding.created_at.asc())
        ).all()
    )


def _rule_detail(db: Session, rule: EventRule) -> dict[str, Any]:
    task_template_ids = _task_template_ids_for_rule(db, rule.id)
    return {
        "id": rule.id,
        "name": rule.name,
        "code": rule.code,
        "event_type": rule.event_type,
        "status": rule.status,
        "trigger_point": rule.trigger_point,
        "object_type": rule.object_type,
        "description": rule.description,
        "tags": list(rule.tags or []),
        "filters": list(rule.filter_config or []),
        "time_rule": dict(rule.time_rule_config or {}),
        "bound_tasks": serialize_bound_task_templates(db, task_template_ids),
        "filter_summary": _filter_summary(list(rule.filter_config or [])),
        "trigger_summary": _trigger_summary(
            rule.trigger_point,
            rule.event_type,
            dict(rule.time_rule_config or {}),
        ),
        "created_at": rule.created_at,
        "created_by": rule.created_by_name,
        "updated_at": rule.updated_at,
        "updated_by": rule.updated_by_name,
    }


def _rule_summary(db: Session, rule: EventRule) -> dict[str, Any]:
    detail = _rule_detail(db, rule)
    return {
        "id": detail["id"],
        "name": detail["name"],
        "code": detail["code"],
        "event_type": detail["event_type"],
        "status": detail["status"],
        "trigger_point": detail["trigger_point"],
        "description": detail["description"],
        "tags": detail["tags"],
        "task_template_count": len(detail["bound_tasks"]),
        "filter_summary": detail["filter_summary"],
        "trigger_summary": detail["trigger_summary"],
        "updated_at": detail["updated_at"],
        "updated_by": detail["updated_by"],
    }


def list_task_templates(db: Session, actor: ActorContext) -> list[dict[str, str]]:
    _require_admin_actor(actor)
    return list_bindable_task_templates(db, actor)


def create_event_rule(
    db: Session,
    actor: ActorContext,
    *,
    payload: dict[str, Any],
) -> dict[str, Any]:
    _require_admin_actor(actor)
    normalized = _normalize_rule_payload(db, payload)
    _ensure_unique_code(db, normalized["code"])

    now = utcnow()
    rule = EventRule(
        name=normalized["name"],
        code=normalized["code"],
        event_type=normalized["event_type"],
        status=normalized["status"],
        trigger_point=normalized["trigger_point"],
        object_type=normalized["object_type"],
        description=normalized["description"],
        tags=normalized["tags"],
        filter_config=normalized["filters"],
        time_rule_config=normalized["time_rule"],
        created_by_user_id=actor.user_id,
        created_by_name=actor.display_name,
        updated_by_user_id=actor.user_id,
        updated_by_name=actor.display_name,
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    db.flush()

    for task_template_id in normalized["task_template_ids"]:
        db.add(
            EventRuleBinding(
                event_rule_id=rule.id,
                task_template_id=task_template_id,
            )
        )

    db.commit()
    db.refresh(rule)
    return _rule_detail(db, rule)


def list_event_rules(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    trigger_point: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    _require_admin_actor(actor)

    conditions: list[ColumnElement[bool]] = []
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(or_(EventRule.name.like(pattern), EventRule.code.like(pattern)))
    if event_type:
        conditions.append(EventRule.event_type == event_type)
    if status:
        conditions.append(EventRule.status == status)
    if trigger_point:
        conditions.append(EventRule.trigger_point == trigger_point)

    total_count = (
        db.scalar(select(func.count()).select_from(EventRule).where(*conditions)) or 0
    )
    rules = list(
        db.scalars(
            select(EventRule).where(*conditions).order_by(EventRule.updated_at.desc())
        ).all()
    )
    return ([_rule_summary(db, rule) for rule in rules], total_count)


def get_event_rule(db: Session, actor: ActorContext, event_id: str) -> dict[str, Any]:
    _require_admin_actor(actor)
    rule = _ensure_rule_exists(db, event_id)
    return _rule_detail(db, rule)


def update_event_rule(
    db: Session,
    actor: ActorContext,
    *,
    event_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    _require_admin_actor(actor)
    rule = _ensure_rule_exists(db, event_id)

    merged_payload = {
        "name": rule.name,
        "code": rule.code,
        "event_type": rule.event_type,
        "status": rule.status,
        "trigger_point": rule.trigger_point,
        "description": rule.description,
        "tags": list(rule.tags or []),
        "filters": list(rule.filter_config or []),
        "time_rule": dict(rule.time_rule_config or {}),
        "task_template_ids": _task_template_ids_for_rule(db, rule.id),
    }
    merged_payload.update(payload)

    normalized = _normalize_rule_payload(db, merged_payload)
    _ensure_unique_code(db, normalized["code"], exclude_rule_id=rule.id)

    rule.name = normalized["name"]
    rule.code = normalized["code"]
    rule.event_type = normalized["event_type"]
    rule.status = normalized["status"]
    rule.trigger_point = normalized["trigger_point"]
    rule.object_type = normalized["object_type"]
    rule.description = normalized["description"]
    rule.tags = normalized["tags"]
    rule.filter_config = normalized["filters"]
    rule.time_rule_config = normalized["time_rule"]
    rule.updated_by_user_id = actor.user_id
    rule.updated_by_name = actor.display_name
    rule.updated_at = utcnow()

    db.query(EventRuleBinding).filter(EventRuleBinding.event_rule_id == rule.id).delete()
    for task_template_id in normalized["task_template_ids"]:
        db.add(
            EventRuleBinding(
                event_rule_id=rule.id,
                task_template_id=task_template_id,
            )
        )

    db.commit()
    db.refresh(rule)
    return _rule_detail(db, rule)


def update_event_rule_status(
    db: Session,
    actor: ActorContext,
    *,
    event_id: str,
    status: str,
) -> dict[str, Any]:
    _require_admin_actor(actor)
    rule = _ensure_rule_exists(db, event_id)
    if status not in {EventRuleStatus.ENABLED.value, EventRuleStatus.DISABLED.value}:
        raise EventOperationError(422, "Unsupported target status")
    if rule.status == status:
        return _rule_detail(db, rule)

    rule.status = status
    rule.updated_by_user_id = actor.user_id
    rule.updated_by_name = actor.display_name
    rule.updated_at = utcnow()
    db.commit()
    db.refresh(rule)
    return _rule_detail(db, rule)


def delete_event_rule(db: Session, actor: ActorContext, *, event_id: str) -> None:
    _require_admin_actor(actor)
    rule = _ensure_rule_exists(db, event_id)
    db.query(EventRuleBinding).filter(EventRuleBinding.event_rule_id == rule.id).delete()
    db.delete(rule)
    db.commit()


def list_due_pending_event_ids(
    db: Session, *, due_at: datetime, limit: int = 100
) -> list[str]:
    return list(
        db.scalars(
            select(Event.id)
            .where(
                Event.status == EventQueueStatus.PENDING.value,
                Event.trigger_time.is_not(None),
                Event.trigger_time <= due_at,
            )
            .order_by(Event.trigger_time.asc(), Event.created_at.asc())
            .limit(limit)
        ).all()
    )


def claim_due_pending_event_with_bindings(
    db: Session,
    *,
    event_id: str,
    due_at: datetime,
    triggered_at: datetime,
    commit: bool = True,
) -> tuple[Event, list[EventBinding]] | None:
    result = db.execute(
        update(Event)
        .where(
            Event.id == event_id,
            Event.status == EventQueueStatus.PENDING.value,
            Event.trigger_time.is_not(None),
            Event.trigger_time <= due_at,
        )
        .values(
            status=EventQueueStatus.TRIGGERED.value,
            triggered_at=triggered_at,
            updated_at=triggered_at,
        )
    )
    if result.rowcount != 1:
        db.rollback()
        return None

    event = db.scalar(select(Event).where(Event.id == event_id))
    if event is None:
        db.rollback()
        return None

    bindings = list(
        db.scalars(
            select(EventBinding)
            .where(EventBinding.event_id == event.id)
            .order_by(EventBinding.created_at.asc())
        ).all()
    )
    if commit:
        db.commit()
    return event, bindings


def _build_event_binding_signatures(
    event: Event, bindings: list[EventBinding]
) -> list[object]:
    return [
        celery_app.signature(
            "app.modules.events.tasks.dispatch_event_binding",
            kwargs={
                "event_id": event.id,
                "binding_id": binding.id,
                "task_template_id": binding.task_template_id,
                "payload": binding.payload,
            },
        )
        for binding in bindings
    ]


def _register_immediate_dispatches(
    db: Session, dispatches: list[tuple[Event, list[EventBinding]]]
) -> None:
    if not dispatches:
        return

    registered = db.info.setdefault(IMMEDIATE_EVENT_DISPATCH_SESSION_KEY, [])
    if not isinstance(registered, list):
        registered = []
        db.info[IMMEDIATE_EVENT_DISPATCH_SESSION_KEY] = registered

    existing = {item for item in registered if isinstance(item, str)}
    for event, bindings in dispatches:
        if event.status != EventQueueStatus.TRIGGERED.value or not bindings:
            continue
        if event.id in existing:
            continue
        registered.append(event.id)
        existing.add(event.id)


def clear_registered_immediate_dispatches(db: Session) -> None:
    db.info.pop(IMMEDIATE_EVENT_DISPATCH_SESSION_KEY, None)


def _pop_registered_immediate_dispatch_ids(db: Session) -> list[str]:
    registered = db.info.pop(IMMEDIATE_EVENT_DISPATCH_SESSION_KEY, [])
    if not isinstance(registered, list):
        return []

    event_ids: list[str] = []
    seen: set[str] = set()
    for item in registered:
        if not isinstance(item, str) or item in seen:
            continue
        seen.add(item)
        event_ids.append(item)
    return event_ids


def _load_triggered_dispatches(
    db: Session, event_ids: list[str]
) -> list[tuple[Event, list[EventBinding]]]:
    if not event_ids:
        return []

    events = list(
        db.scalars(
            select(Event).where(
                Event.id.in_(event_ids),
                Event.status == EventQueueStatus.TRIGGERED.value,
            )
        ).all()
    )
    event_map = {event.id: event for event in events}

    dispatches: list[tuple[Event, list[EventBinding]]] = []
    for event_id in event_ids:
        event = event_map.get(event_id)
        if event is None:
            continue
        bindings = list(
            db.scalars(
                select(EventBinding)
                .where(EventBinding.event_id == event.id)
                .order_by(EventBinding.created_at.asc())
            ).all()
        )
        dispatches.append((event, bindings))
    return dispatches


def _restore_triggered_events_to_pending(db: Session, event_ids: list[str]) -> None:
    if not event_ids:
        return
    now = utcnow()
    db.execute(
        update(Event)
        .where(
            Event.id.in_(event_ids),
            Event.status == EventQueueStatus.TRIGGERED.value,
        )
        .values(
            status=EventQueueStatus.PENDING.value,
            triggered_at=None,
            updated_at=now,
        )
    )
    db.commit()


def dispatch_registered_immediate_events(db: Session) -> int:
    event_ids = _pop_registered_immediate_dispatch_ids(db)
    if not event_ids:
        return 0

    dispatches = _load_triggered_dispatches(db, event_ids)
    signatures = [
        signature
        for event, bindings in dispatches
        for signature in _build_event_binding_signatures(event, bindings)
    ]
    if not signatures:
        return 0

    try:
        group(signatures).apply_async()
    except Exception:
        _restore_triggered_events_to_pending(db, event_ids)
        raise
    return len(signatures)


def trigger_due_pending_event_with_bindings(
    db: Session, *, event_id: str, due_at: datetime, triggered_at: datetime
) -> tuple[Event, list[EventBinding]] | None:
    claimed_event = claim_due_pending_event_with_bindings(
        db,
        event_id=event_id,
        due_at=due_at,
        triggered_at=triggered_at,
        commit=False,
    )
    if claimed_event is None:
        return None

    event, bindings = claimed_event
    try:
        signatures = _build_event_binding_signatures(event, bindings)
        if signatures:
            group(signatures).apply_async()
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(event)
    return event, bindings


def _event_rule_task_template_ids(db: Session, rule_id: str) -> list[str]:
    return _task_template_ids_for_rule(db, rule_id)


def _compute_dispatch_time(
    *,
    rule: EventRule,
    ticket: Ticket,
    occurred_at: datetime,
) -> datetime:
    normalized_occurred_at = _coerce_datetime(occurred_at)
    if normalized_occurred_at is None:
        raise EventOperationError(422, "Missing occurred_at for event dispatch")

    time_rule = dict(rule.time_rule_config or {})
    if rule.event_type == EventRuleType.NORMAL.value:
        if time_rule.get("mode") == "immediate":
            return normalized_occurred_at
        return normalized_occurred_at + _timedelta_for(
            int(time_rule["delay_amount"]),
            str(time_rule["delay_unit"]),
        )

    created_at = _coerce_datetime(ticket.created_at)
    if created_at is None:
        raise EventOperationError(422, "Ticket created_at is required for timed events")

    target_time = created_at + _timedelta_for(
        int(time_rule["target_offset_amount"]),
        str(time_rule["target_offset_unit"]),
    )
    adjustment = _timedelta_for(
        int(time_rule.get("adjustment_amount") or 0),
        str(time_rule["adjustment_unit"]),
    )
    if time_rule["adjustment_direction"] == "before":
        target_time = target_time - adjustment
    else:
        target_time = target_time + adjustment
    return target_time


def _matches_filter(ticket: Ticket, item: dict[str, Any]) -> bool:
    field = item["field"]
    if field == "priority":
        return ticket.priority in item["values"]
    if field == "category":
        return ticket.category_id in item["values"]
    if field == "risk_score":
        return item["min_value"] <= ticket.risk_score <= item["max_value"]
    if field == "created_at":
        start_at = _coerce_datetime(datetime.fromisoformat(item["start_at"]))
        end_at = _coerce_datetime(datetime.fromisoformat(item["end_at"]))
        created_at = _coerce_datetime(ticket.created_at)
        assert start_at is not None and end_at is not None and created_at is not None
        return start_at <= created_at <= end_at
    return False


def _matches_rule(ticket: Ticket, rule: EventRule) -> bool:
    filters = list(rule.filter_config or [])
    return all(_matches_filter(ticket, item) for item in filters)


def _queue_dispatch_event(
    db: Session,
    *,
    rule: EventRule,
    ticket: Ticket,
    trigger_point: str,
    trigger_time: datetime,
    queue_status: str = EventQueueStatus.PENDING.value,
    triggered_at: datetime | None = None,
) -> tuple[Event, list[EventBinding]]:
    now = utcnow()
    normalized_trigger_time = _coerce_datetime(trigger_time)
    normalized_triggered_at = _coerce_datetime(triggered_at)
    if normalized_trigger_time is None:
        raise EventOperationError(422, "Missing trigger_time for event dispatch")
    event = Event(
        event_type=(
            EventQueueType.INSTANT.value
            if normalized_trigger_time <= now
            else EventQueueType.TIMED.value
        ),
        status=queue_status,
        trigger_time=normalized_trigger_time,
        title=rule.name,
        description=rule.description,
        payload={
            "kind": "event_rule_dispatch",
            "rule_id": rule.id,
            "rule_code": rule.code,
            "rule_name": rule.name,
            "ticket_id": ticket.id,
            "related_object": _ticket_related_object(ticket.id),
            "trigger_point": trigger_point,
        },
        created_by_user_id=rule.updated_by_user_id,
        triggered_at=normalized_triggered_at,
        created_at=now,
        updated_at=normalized_triggered_at or now,
    )
    db.add(event)
    db.flush()

    bindings: list[EventBinding] = []
    for task_template_id in _event_rule_task_template_ids(db, rule.id):
        binding = EventBinding(
            event_id=event.id,
            task_template_id=task_template_id,
            payload={
                "kind": "event_rule_dispatch",
                "rule_id": rule.id,
                "rule_code": rule.code,
                "ticket_id": ticket.id,
                "trigger_point": trigger_point,
                "task_template_id": task_template_id,
            },
            created_at=now,
        )
        db.add(binding)
        bindings.append(binding)

    return event, bindings


def _load_ticket(db: Session, ticket_id: int) -> Ticket | None:
    return db.scalar(select(Ticket).where(Ticket.id == ticket_id, Ticket.is_deleted.is_(False)))


def queue_matching_ticket_rules(
    db: Session,
    *,
    ticket: Ticket,
    trigger_point: str,
    occurred_at: datetime | None = None,
    dispatch_immediate: bool = False,
) -> list[tuple[Event, list[EventBinding]]]:
    effective_occurred_at = _coerce_datetime(occurred_at) or utcnow()
    rules = list(
        db.scalars(
            select(EventRule).where(
                EventRule.status == EventRuleStatus.ENABLED.value,
                EventRule.trigger_point == trigger_point,
            )
        ).all()
    )

    created: list[tuple[Event, list[EventBinding]]] = []
    for rule in rules:
        if not _matches_rule(ticket, rule):
            continue
        trigger_time = _compute_dispatch_time(
            rule=rule,
            ticket=ticket,
            occurred_at=effective_occurred_at,
        )
        if dispatch_immediate and trigger_time <= effective_occurred_at:
            created.append(
                _queue_dispatch_event(
                    db,
                    rule=rule,
                    ticket=ticket,
                    trigger_point=trigger_point,
                    trigger_time=effective_occurred_at,
                    queue_status=EventQueueStatus.TRIGGERED.value,
                    triggered_at=effective_occurred_at,
                )
            )
        else:
            created.append(
                _queue_dispatch_event(
                    db,
                    rule=rule,
                    ticket=ticket,
                    trigger_point=trigger_point,
                    trigger_time=trigger_time,
                )
            )
    return created


def create_ticket_event(
    db: Session,
    *,
    ticket_id: int,
    name: str,
    occurred_at: datetime | None = None,
) -> None:
    ticket = _load_ticket(db, ticket_id)
    if ticket is None:
        return
    created = queue_matching_ticket_rules(
        db,
        ticket=ticket,
        trigger_point=name,
        occurred_at=occurred_at or utcnow(),
        dispatch_immediate=True,
    )
    _register_immediate_dispatches(db, created)


def _create_ticket_timeout_signal(
    db: Session,
    *,
    ticket_id: int,
    trigger_point: str,
    trigger_time: datetime,
) -> None:
    now = utcnow()
    db.add(
        Event(
            event_type=EventQueueType.TIMED.value,
            status=EventQueueStatus.PENDING.value,
            trigger_time=trigger_time,
            title=trigger_point,
            description=None,
            payload={
                "kind": TICKET_TIMEOUT_SIGNAL_KIND,
                "ticket_id": ticket_id,
                "related_object": _ticket_related_object(ticket_id),
                "trigger_point": trigger_point,
            },
            created_by_user_id=None,
            created_at=now,
            updated_at=now,
        )
    )


def _create_ticket_timeout_reminder_signal(
    db: Session,
    *,
    ticket_id: int,
    reminder_kind: str,
    deadline_at: datetime,
    trigger_time: datetime,
) -> None:
    now = utcnow()
    db.add(
        Event(
            event_type=EventQueueType.TIMED.value,
            status=EventQueueStatus.PENDING.value,
            trigger_time=trigger_time,
            title=f"ticket.{reminder_kind}.reminder",
            description=None,
            payload={
                "kind": TICKET_TIMEOUT_REMINDER_SIGNAL_KIND,
                "ticket_id": ticket_id,
                "related_object": _ticket_related_object(ticket_id),
                "reminder_kind": reminder_kind,
                "deadline_at": deadline_at.isoformat(),
            },
            created_by_user_id=None,
            created_at=now,
            updated_at=now,
        )
    )


def _cancel_pending_ticket_events_with_matcher(
    db: Session,
    *,
    ticket_id: int,
    matcher,
) -> None:
    now = utcnow()
    for event in db.scalars(
        select(Event).where(Event.status == EventQueueStatus.PENDING.value)
    ).all():
        payload = event.payload if isinstance(event.payload, dict) else {}
        if payload.get("ticket_id") != ticket_id:
            continue
        if not matcher(payload):
            continue
        event.status = EventQueueStatus.CANCELLED.value
        event.cancelled_at = now
        event.updated_at = now


def _create_ticket_timeout_reminder_events(
    db: Session,
    *,
    ticket_id: int,
    response_deadline_at: datetime | None,
    resolution_deadline_at: datetime | None,
    response_reminder_minutes: int | None,
    resolution_reminder_minutes: int | None,
) -> None:
    kinds_to_refresh: set[str] = set()
    if response_deadline_at is not None and isinstance(response_reminder_minutes, int):
        if response_reminder_minutes > 0:
            kinds_to_refresh.add(REMINDER_KIND_RESPONSE)
    if resolution_deadline_at is not None and isinstance(resolution_reminder_minutes, int):
        if resolution_reminder_minutes > 0:
            kinds_to_refresh.add(REMINDER_KIND_RESOLUTION)

    if kinds_to_refresh:
        cancel_pending_ticket_reminder_events(
            db, ticket_id=ticket_id, kinds=sorted(kinds_to_refresh)
        )

    if response_deadline_at is not None and isinstance(response_reminder_minutes, int):
        if response_reminder_minutes > 0:
            normalized_deadline = _coerce_datetime(response_deadline_at) or response_deadline_at
            _create_ticket_timeout_reminder_signal(
                db,
                ticket_id=ticket_id,
                reminder_kind=REMINDER_KIND_RESPONSE,
                deadline_at=normalized_deadline,
                trigger_time=normalized_deadline
                - timedelta(minutes=response_reminder_minutes),
            )

    if resolution_deadline_at is not None and isinstance(resolution_reminder_minutes, int):
        if resolution_reminder_minutes > 0:
            normalized_deadline = _coerce_datetime(resolution_deadline_at) or resolution_deadline_at
            _create_ticket_timeout_reminder_signal(
                db,
                ticket_id=ticket_id,
                reminder_kind=REMINDER_KIND_RESOLUTION,
                deadline_at=normalized_deadline,
                trigger_time=normalized_deadline
                - timedelta(minutes=resolution_reminder_minutes),
            )


def create_ticket_timeout_events(
    db: Session,
    *,
    ticket_id: int,
    response_deadline_at: datetime | None,
    resolution_deadline_at: datetime | None,
    response_reminder_minutes: int | None = None,
    resolution_reminder_minutes: int | None = None,
) -> None:
    if response_deadline_at is not None:
        _create_ticket_timeout_signal(
            db,
            ticket_id=ticket_id,
            trigger_point="ticket.response.timeout",
            trigger_time=_coerce_datetime(response_deadline_at) or response_deadline_at,
        )

    if resolution_deadline_at is not None:
        _create_ticket_timeout_signal(
            db,
            ticket_id=ticket_id,
            trigger_point="ticket.resolution.timeout",
            trigger_time=_coerce_datetime(resolution_deadline_at) or resolution_deadline_at,
        )

    _create_ticket_timeout_reminder_events(
        db,
        ticket_id=ticket_id,
        response_deadline_at=response_deadline_at,
        resolution_deadline_at=resolution_deadline_at,
        response_reminder_minutes=response_reminder_minutes,
        resolution_reminder_minutes=resolution_reminder_minutes,
    )


def cancel_pending_ticket_events(
    db: Session, *, ticket_id: int, names: list[str]
) -> None:
    if not names:
        return

    allowed_names = set(names)
    _cancel_pending_ticket_events_with_matcher(
        db,
        ticket_id=ticket_id,
        matcher=lambda payload: payload.get("kind") == TICKET_TIMEOUT_SIGNAL_KIND
        and payload.get("trigger_point") in allowed_names,
    )


def cancel_pending_ticket_reminder_events(
    db: Session, *, ticket_id: int, kinds: list[str] | None = None
) -> None:
    normalized_kinds = {value for value in (kinds or []) if value}
    _cancel_pending_ticket_events_with_matcher(
        db,
        ticket_id=ticket_id,
        matcher=lambda payload: payload.get("kind") == TICKET_TIMEOUT_REMINDER_SIGNAL_KIND
        and (
            not normalized_kinds
            or payload.get("reminder_kind") in normalized_kinds
        ),
    )


def rebuild_ticket_timeout_reminder_events(
    db: Session,
    *,
    ticket_id: int,
    response_deadline_at: datetime | None,
    resolution_deadline_at: datetime | None,
    response_reminder_minutes: int,
    resolution_reminder_minutes: int,
) -> None:
    _create_ticket_timeout_reminder_events(
        db,
        ticket_id=ticket_id,
        response_deadline_at=response_deadline_at,
        resolution_deadline_at=resolution_deadline_at,
        response_reminder_minutes=response_reminder_minutes,
        resolution_reminder_minutes=resolution_reminder_minutes,
    )


def rebuild_timeout_reminder_events_for_active_tickets(
    db: Session,
    *,
    response_reminder_minutes: int,
    resolution_reminder_minutes: int,
) -> int:
    tickets = list(
        db.scalars(
            select(Ticket).where(
                Ticket.is_deleted.is_(False),
                Ticket.main_status.in_(tuple(ACTIVE_TIMEOUT_REMINDER_STATUSES)),
            )
        ).all()
    )
    for ticket in tickets:
        rebuild_ticket_timeout_reminder_events(
            db,
            ticket_id=ticket.id,
            response_deadline_at=ticket.response_deadline_at,
            resolution_deadline_at=ticket.resolution_deadline_at,
            response_reminder_minutes=response_reminder_minutes,
            resolution_reminder_minutes=resolution_reminder_minutes,
        )
    return len(tickets)


def dispatch_timeout_signal(
    db: Session,
    *,
    signal_event: Event,
    occurred_at: datetime,
) -> list[tuple[Event, list[EventBinding]]]:
    ticket_id = signal_event.payload.get("ticket_id")
    trigger_point = signal_event.payload.get("trigger_point")
    if not isinstance(ticket_id, int) or not isinstance(trigger_point, str):
        return []

    ticket = _load_ticket(db, ticket_id)
    if ticket is None:
        return []

    # Set sub_status based on timeout type
    if trigger_point == "ticket.response.timeout":
        if ticket.main_status == TicketMainStatus.WAITING_RESPONSE.value:
            ticket.sub_status = TicketSubStatus.RESPONSE_TIMEOUT.value
            ticket.updated_at = utcnow()
            db.add(ticket)
            db.flush()
    elif trigger_point == "ticket.resolution.timeout":
        if ticket.main_status == TicketMainStatus.IN_PROGRESS.value:
            ticket.sub_status = TicketSubStatus.RESOLUTION_TIMEOUT.value
            ticket.updated_at = utcnow()
            db.add(ticket)
            db.flush()

    created = queue_matching_ticket_rules(
        db,
        ticket=ticket,
        trigger_point=trigger_point,
        occurred_at=occurred_at,
        dispatch_immediate=True,
    )
    return created


def _reminder_ticket_deadline(ticket: Ticket, reminder_kind: str) -> datetime | None:
    if reminder_kind == REMINDER_KIND_RESPONSE:
        return ticket.response_deadline_at
    if reminder_kind == REMINDER_KIND_RESOLUTION:
        return ticket.resolution_deadline_at
    return None


def _should_dispatch_timeout_reminder(ticket: Ticket, reminder_kind: str) -> bool:
    if reminder_kind == REMINDER_KIND_RESPONSE:
        return (
            ticket.main_status == TicketMainStatus.WAITING_RESPONSE.value
            and ticket.responded_at is None
            and ticket.resolved_at is None
            and ticket.closed_at is None
        )
    if reminder_kind == REMINDER_KIND_RESOLUTION:
        return (
            ticket.main_status in ACTIVE_TIMEOUT_REMINDER_STATUSES
            and ticket.resolved_at is None
            and ticket.closed_at is None
        )
    return False


def _pool_role_code(pool_code: str | None) -> str | None:
    if not pool_code:
        return None
    if pool_code in {"T1_POOL", "T2_POOL", "T3_POOL"}:
        return pool_code.removesuffix("_POOL")
    return None


def _list_active_user_ids_for_role(db: Session, *, role_code: str) -> list[str]:
    return list(
        db.scalars(
            select(UserRole.user_id)
            .join(User, User.id == UserRole.user_id)
            .where(
                UserRole.role_code == role_code,
                UserRole.is_active.is_(True),
                User.status == "active",
            )
            .distinct()
        ).all()
    )


def _timeout_reminder_recipients(db: Session, *, ticket: Ticket) -> list[str]:
    if ticket.assigned_to_user_id:
        return [ticket.assigned_to_user_id]
    role_code = _pool_role_code(ticket.current_pool_code)
    if role_code is None:
        return []
    return _list_active_user_ids_for_role(db, role_code=role_code)


def _timeout_reminder_category(reminder_kind: str) -> str | None:
    if reminder_kind == REMINDER_KIND_RESPONSE:
        return TICKET_TIMEOUT_REMINDER_RESPONSE_CATEGORY
    if reminder_kind == REMINDER_KIND_RESOLUTION:
        return TICKET_TIMEOUT_REMINDER_RESOLUTION_CATEGORY
    return None


def dispatch_timeout_reminder_signal(
    db: Session,
    *,
    signal_event: Event,
    occurred_at: datetime,
) -> int:
    payload = signal_event.payload if isinstance(signal_event.payload, dict) else {}
    ticket_id = payload.get("ticket_id")
    reminder_kind = payload.get("reminder_kind")
    if not isinstance(ticket_id, int) or not isinstance(reminder_kind, str):
        return 0

    ticket = _load_ticket(db, ticket_id)
    if ticket is None:
        return 0

    if not _should_dispatch_timeout_reminder(ticket, reminder_kind):
        return 0

    deadline_at = _reminder_ticket_deadline(ticket, reminder_kind)
    normalized_deadline = _coerce_datetime(deadline_at) if deadline_at else None
    if normalized_deadline is None:
        return 0

    payload_deadline = _parse_iso_datetime(payload.get("deadline_at"))
    if payload_deadline is not None and payload_deadline != normalized_deadline:
        return 0

    normalized_occurred_at = _coerce_datetime(occurred_at) or occurred_at
    remaining_seconds = int((normalized_deadline - normalized_occurred_at).total_seconds())
    if remaining_seconds <= 0:
        return 0

    category = _timeout_reminder_category(reminder_kind)
    if category is None:
        return 0

    recipients = _timeout_reminder_recipients(db, ticket=ticket)
    delivered = 0
    for user_id in recipients:
        title = (
            f"工单 #{ticket.id} 即将响应超时"
            if reminder_kind == REMINDER_KIND_RESPONSE
            else f"工单 #{ticket.id} 即将处置超时"
        )
        content = (
            f"工单「{ticket.title}」将在 {max(1, (remaining_seconds + 59) // 60)} 分钟后达到"
            f"{'响应' if reminder_kind == REMINDER_KIND_RESPONSE else '处置'}超时。"
        )
        deliver_notification(
            db,
            user_id=user_id,
            category=category,
            title=title,
            content=content,
            related_resource_type="ticket",
            related_resource_id=ticket.id,
            action_payload={
                "ticket_id": ticket.id,
                "ticket_title": ticket.title,
                "reminder_kind": reminder_kind,
                "deadline_at": normalized_deadline.isoformat(),
                "remaining_seconds": remaining_seconds,
                "pool_code": ticket.current_pool_code,
            },
            expire_at=normalized_deadline,
        )
        delivered += 1
    return delivered
