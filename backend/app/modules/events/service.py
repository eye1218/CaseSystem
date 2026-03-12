from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from ...auth import ActorContext
from ...enums import RoleCode
from ...security import utcnow
from .enums import EventStatus, EventType
from .models import Event, EventBinding


class EventOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _require_admin_actor(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise EventOperationError(403, "Admin role required")


def _get_event_or_error(db: Session, event_id: str) -> Event:
    event = db.scalar(select(Event).where(Event.id == event_id))
    if event is None:
        raise EventOperationError(404, "Event not found")
    return event


def _assert_pending_mutable(event: Event) -> None:
    if event.status != EventStatus.PENDING.value:
        raise EventOperationError(409, "Only pending events are mutable")


def _build_detail(db: Session, event: Event) -> dict[str, object]:
    bindings = list(
        db.scalars(
            select(EventBinding)
            .where(EventBinding.event_id == event.id)
            .order_by(EventBinding.created_at)
        ).all()
    )
    return {"event": event, "bindings": bindings}


def list_due_pending_event_ids(
    db: Session, *, due_at: datetime, limit: int = 100
) -> list[str]:
    return list(
        db.scalars(
            select(Event.id)
            .where(
                Event.status == EventStatus.PENDING.value,
                Event.trigger_time.is_not(None),
                Event.trigger_time <= due_at,
            )
            .order_by(Event.trigger_time.asc(), Event.created_at.asc())
            .limit(limit)
        ).all()
    )


def get_due_pending_event_with_bindings(
    db: Session, *, event_id: str, due_at: datetime
) -> tuple[Event, list[EventBinding]] | None:
    event = db.scalar(
        select(Event).where(
            Event.id == event_id,
            Event.status == EventStatus.PENDING.value,
            Event.trigger_time.is_not(None),
            Event.trigger_time <= due_at,
        )
    )
    if event is None:
        return None

    bindings = list(
        db.scalars(
            select(EventBinding)
            .where(EventBinding.event_id == event.id)
            .order_by(EventBinding.created_at)
        ).all()
    )
    return event, bindings


def claim_due_pending_event_with_bindings(
    db: Session, *, event_id: str, due_at: datetime, triggered_at: datetime
) -> tuple[Event, list[EventBinding]] | None:
    result = db.execute(
        update(Event)
        .where(
            Event.id == event_id,
            Event.status == EventStatus.PENDING.value,
            Event.trigger_time.is_not(None),
            Event.trigger_time <= due_at,
        )
        .values(
            status=EventStatus.TRIGGERED.value,
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
            .order_by(EventBinding.created_at)
        ).all()
    )
    db.commit()
    return event, bindings


def mark_event_triggered(event: Event, *, triggered_at: datetime) -> None:
    event.status = EventStatus.TRIGGERED.value
    event.triggered_at = triggered_at
    event.updated_at = triggered_at


def _ticket_related_object(ticket_id: int) -> str:
    return f"ticket:{ticket_id}"


def _ticket_event_payload(
    *, name: str, related_object: str, tags: list[str] | None = None
) -> dict[str, object]:
    return {
        "name": name,
        "related_object": related_object,
        "tags": list(tags or []),
    }


def _ticket_event_name(event: Event) -> str | None:
    event_name = getattr(event, "name", None)
    if isinstance(event_name, str):
        return event_name
    if isinstance(event.title, str):
        return event.title
    payload_name = event.payload.get("name")
    if isinstance(payload_name, str):
        return payload_name
    return None


def _ticket_event_related_object(event: Event) -> str | None:
    event_related_object = getattr(event, "related_object", None)
    if isinstance(event_related_object, str):
        return event_related_object
    payload_related_object = event.payload.get("related_object")
    if isinstance(payload_related_object, str):
        return payload_related_object
    return None


def create_ticket_event(
    db: Session, *, ticket_id: int, name: str, tags: list[str] | None = None
) -> None:
    now = utcnow()
    related_object = _ticket_related_object(ticket_id)
    normalized_tags = list(tags or [])
    payload = _ticket_event_payload(
        name=name,
        related_object=related_object,
        tags=normalized_tags,
    )
    event_kwargs: dict[str, object] = {
        "event_type": EventType.INSTANT.value,
        "status": EventStatus.PENDING.value,
        "trigger_time": now,
        "title": name,
        "description": None,
        "payload": payload,
        "created_by_user_id": None,
        "created_at": now,
        "updated_at": now,
    }
    if hasattr(Event, "name"):
        event_kwargs["name"] = name
    if hasattr(Event, "related_object"):
        event_kwargs["related_object"] = related_object
    if hasattr(Event, "tags"):
        event_kwargs["tags"] = normalized_tags
    db.add(Event(**event_kwargs))


def _create_ticket_timeout_event(
    db: Session,
    *,
    ticket_id: int,
    name: str,
    trigger_time: datetime,
    tags: list[str],
) -> None:
    now = utcnow()
    related_object = _ticket_related_object(ticket_id)
    payload = _ticket_event_payload(name=name, related_object=related_object, tags=tags)
    event_kwargs: dict[str, object] = {
        "event_type": EventType.TIMED.value,
        "status": EventStatus.PENDING.value,
        "trigger_time": trigger_time,
        "title": name,
        "description": None,
        "payload": payload,
        "created_by_user_id": None,
        "created_at": now,
        "updated_at": now,
    }
    if hasattr(Event, "name"):
        event_kwargs["name"] = name
    if hasattr(Event, "related_object"):
        event_kwargs["related_object"] = related_object
    if hasattr(Event, "tags"):
        event_kwargs["tags"] = tags
    db.add(Event(**event_kwargs))


def create_ticket_timeout_events(
    db: Session,
    *,
    ticket_id: int,
    response_deadline_at: datetime | None,
    resolution_deadline_at: datetime | None,
) -> None:
    if response_deadline_at is not None:
        _create_ticket_timeout_event(
            db,
            ticket_id=ticket_id,
            name="ticket.response.timeout",
            trigger_time=response_deadline_at,
            tags=["ticket", "sla", "timeout", "response"],
        )

    if resolution_deadline_at is not None:
        _create_ticket_timeout_event(
            db,
            ticket_id=ticket_id,
            name="ticket.resolution.timeout",
            trigger_time=resolution_deadline_at,
            tags=["ticket", "sla", "timeout", "resolution"],
        )


def cancel_pending_ticket_events(
    db: Session, *, ticket_id: int, names: list[str]
) -> None:
    if not names:
        return

    now = utcnow()
    related_object = _ticket_related_object(ticket_id)
    target_names = set(names)
    events = list(
        db.scalars(
            select(Event).where(
                Event.status == EventStatus.PENDING.value,
            )
        ).all()
    )
    for event in events:
        if _ticket_event_related_object(event) != related_object:
            continue
        event_name = _ticket_event_name(event)
        if event_name not in target_names:
            continue
        event.status = EventStatus.CANCELLED.value
        event.cancelled_at = now
        event.updated_at = now


def create_event(
    db: Session,
    actor: ActorContext,
    *,
    event_type: str,
    trigger_time: datetime | None,
    title: str | None,
    description: str | None,
    payload: dict[str, object] | None,
) -> dict[str, object]:
    _require_admin_actor(actor)

    if event_type not in {EventType.INSTANT.value, EventType.TIMED.value}:
        raise EventOperationError(422, "Unsupported event type")

    now = utcnow()
    if event_type == EventType.TIMED.value and trigger_time is None:
        raise EventOperationError(422, "trigger_time is required for timed events")

    normalized_trigger_time = trigger_time
    if event_type == EventType.INSTANT.value:
        normalized_trigger_time = now

    event = Event(
        event_type=event_type,
        status=EventStatus.PENDING.value,
        trigger_time=normalized_trigger_time,
        title=title,
        description=description,
        payload=payload or {},
        created_by_user_id=actor.user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _build_detail(db, event)


def list_events(
    db: Session,
    actor: ActorContext,
    *,
    status: str | None = None,
    event_type: str | None = None,
) -> tuple[list[Event], int]:
    _require_admin_actor(actor)

    conditions: list[ColumnElement[bool]] = []
    if status:
        conditions.append(Event.status == status)
    if event_type:
        conditions.append(Event.event_type == event_type)

    total_count = (
        db.scalar(select(func.count()).select_from(Event).where(*conditions)) or 0
    )
    items = list(
        db.scalars(
            select(Event).where(*conditions).order_by(Event.created_at.desc())
        ).all()
    )
    return items, total_count


def get_event(db: Session, actor: ActorContext, event_id: str) -> dict[str, object]:
    _require_admin_actor(actor)
    event = _get_event_or_error(db, event_id)
    return _build_detail(db, event)


def bind_event_task(
    db: Session,
    actor: ActorContext,
    *,
    event_id: str,
    task_template_id: str,
    payload: dict[str, object] | None,
) -> dict[str, object]:
    _require_admin_actor(actor)
    event = _get_event_or_error(db, event_id)
    _assert_pending_mutable(event)

    binding = EventBinding(
        event_id=event.id,
        task_template_id=task_template_id,
        payload=payload or {},
    )
    db.add(binding)
    event.updated_at = utcnow()
    db.commit()
    db.refresh(event)
    return _build_detail(db, event)


def cancel_event(db: Session, actor: ActorContext, event_id: str) -> dict[str, object]:
    _require_admin_actor(actor)
    event = _get_event_or_error(db, event_id)
    _assert_pending_mutable(event)

    now = utcnow()
    event.status = EventStatus.CANCELLED.value
    event.cancelled_at = now
    event.updated_at = now
    db.commit()
    db.refresh(event)
    return _build_detail(db, event)


def reschedule_event(
    db: Session,
    actor: ActorContext,
    *,
    event_id: str,
    trigger_time: datetime,
) -> dict[str, object]:
    _require_admin_actor(actor)
    event = _get_event_or_error(db, event_id)
    _assert_pending_mutable(event)

    if event.event_type != EventType.TIMED.value:
        raise EventOperationError(409, "Only timed pending events can be rescheduled")

    event.trigger_time = trigger_time
    event.updated_at = utcnow()
    db.commit()
    db.refresh(event)
    return _build_detail(db, event)


def early_trigger_event(
    db: Session, actor: ActorContext, event_id: str
) -> dict[str, object]:
    _require_admin_actor(actor)
    event = _get_event_or_error(db, event_id)
    _assert_pending_mutable(event)

    if event.event_type != EventType.TIMED.value:
        raise EventOperationError(
            409, "Only timed pending events can be early-triggered"
        )

    now = utcnow()
    event.trigger_time = now
    event.updated_at = now
    db.commit()
    db.refresh(event)
    return _build_detail(db, event)
