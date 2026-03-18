from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import cmp_to_key
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...enums import RoleCode, TicketMainStatus
from ..tickets.models import Ticket, TicketAction, TicketComment

ALLOWED_VISIBILITY = {"PUBLIC", "INTERNAL"}
ALLOWED_MAIN_STATUS = {status.value for status in TicketMainStatus}
ALLOWED_SORT_FIELDS = {
    "ticket_id",
    "last_event_at",
    "log_count",
    "risk_score",
    "updated_at",
}


class AuditOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class _AuditEvent:
    event_id: str
    ticket_id: int
    event_type: str
    action_type: str
    actor_user_id: str | None
    actor_name: str
    actor_role: str | None
    visibility: str
    content: str
    from_status: str | None
    to_status: str | None
    context: dict[str, Any]
    created_at: datetime
    is_system: bool


@dataclass
class _TicketAuditSummary:
    log_count: int = 0
    last_event_at: datetime | None = None
    last_actor_name: str | None = None
    last_actor_role: str | None = None
    last_action_type: str | None = None


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_datetime(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    if len(normalized) == 10:
        suffix = "23:59:59" if end_of_day else "00:00:00"
        normalized = f"{normalized}T{suffix}"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise AuditOperationError(422, "Invalid datetime format for created_from/created_to") from exc

    return _normalize_datetime(parsed)


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_visibility(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if normalized not in ALLOWED_VISIBILITY:
        raise AuditOperationError(422, "visibility must be one of PUBLIC, INTERNAL")
    return normalized


def _normalize_main_status(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if normalized not in ALLOWED_MAIN_STATUS:
        raise AuditOperationError(422, "main_status is invalid")
    return normalized


def _normalize_sort(sort_by: str, sort_dir: str) -> tuple[str, str]:
    normalized_sort_by = sort_by.strip()
    normalized_sort_dir = sort_dir.strip().lower()

    if normalized_sort_by not in ALLOWED_SORT_FIELDS:
        raise AuditOperationError(422, "sort_by must be one of ticket_id, last_event_at, log_count, risk_score, updated_at")
    if normalized_sort_dir not in {"asc", "desc"}:
        raise AuditOperationError(422, "sort_dir must be `asc` or `desc`")
    return normalized_sort_by, normalized_sort_dir


def _normalize_log_sort_dir(sort_dir: str) -> str:
    normalized_sort_dir = sort_dir.strip().lower()
    if normalized_sort_dir not in {"asc", "desc"}:
        raise AuditOperationError(422, "sort_dir must be `asc` or `desc`")
    return normalized_sort_dir


def _require_admin(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise AuditOperationError(403, "Admin role required")


def _load_events(
    db: Session,
    *,
    ticket_id: int | None,
) -> list[_AuditEvent]:
    action_query = select(TicketAction)
    if ticket_id is not None:
        action_query = action_query.where(TicketAction.ticket_id == ticket_id)
    actions = list(db.scalars(action_query.order_by(TicketAction.created_at)).all())

    comment_query = select(TicketComment)
    if ticket_id is not None:
        comment_query = comment_query.where(TicketComment.ticket_id == ticket_id)
    comments = list(db.scalars(comment_query.order_by(TicketComment.created_at)).all())

    items: list[_AuditEvent] = []
    for action in actions:
        context = action.context if isinstance(action.context, dict) else {}
        items.append(
            _AuditEvent(
                event_id=action.id,
                ticket_id=action.ticket_id,
                event_type="action",
                action_type=action.action_type,
                actor_user_id=action.actor_user_id,
                actor_name=action.actor_name,
                actor_role=action.actor_role,
                visibility=action.visibility,
                content=action.content,
                from_status=action.from_status,
                to_status=action.to_status,
                context=context,
                created_at=_normalize_datetime(action.created_at),
                is_system=action.actor_role is None,
            )
        )

    for comment in comments:
        items.append(
            _AuditEvent(
                event_id=comment.id,
                ticket_id=comment.ticket_id,
                event_type="comment",
                action_type="comment",
                actor_user_id=comment.actor_user_id,
                actor_name=comment.actor_name,
                actor_role=comment.actor_role,
                visibility=comment.visibility,
                content=comment.content,
                from_status=None,
                to_status=None,
                context={},
                created_at=_normalize_datetime(comment.created_at),
                is_system=comment.is_system,
            )
        )

    return sorted(items, key=lambda item: item.created_at)


def _event_in_datetime_range(
    event: _AuditEvent,
    *,
    created_from: datetime | None,
    created_to: datetime | None,
) -> bool:
    created_at = _normalize_datetime(event.created_at)
    if created_from is not None and created_at < created_from:
        return False
    if created_to is not None and created_at > created_to:
        return False
    return True


def _event_matches(
    event: _AuditEvent,
    *,
    action_type: str | None,
    actor_keyword: str | None,
    visibility: str | None,
    search_keyword: str | None,
    created_from: datetime | None,
    created_to: datetime | None,
) -> bool:
    if not _event_in_datetime_range(event, created_from=created_from, created_to=created_to):
        return False

    if action_type is not None and event.action_type.lower() != action_type.lower():
        return False

    if actor_keyword is not None and actor_keyword.lower() not in event.actor_name.lower():
        return False

    if visibility is not None and event.visibility.upper() != visibility:
        return False

    if search_keyword is not None:
        lowered = search_keyword.lower()
        if (
            lowered not in event.content.lower()
            and lowered not in event.actor_name.lower()
            and lowered not in event.action_type.lower()
        ):
            return False

    return True


def _build_ticket_audit_summary(events: list[_AuditEvent]) -> dict[int, _TicketAuditSummary]:
    grouped: dict[int, _TicketAuditSummary] = {}

    for event in events:
        summary = grouped.setdefault(event.ticket_id, _TicketAuditSummary())
        summary.log_count += 1

        if summary.last_event_at is None or event.created_at >= summary.last_event_at:
            summary.last_event_at = event.created_at
            summary.last_actor_name = event.actor_name
            summary.last_actor_role = event.actor_role
            summary.last_action_type = event.action_type

    return grouped


def _sort_ticket_items(
    items: list[dict[str, object]],
    *,
    sort_by: str,
    sort_dir: str,
) -> list[dict[str, object]]:
    descending = sort_dir == "desc"

    def _cmp(left_item: dict[str, object], right_item: dict[str, object]) -> int:
        left = left_item.get(sort_by)
        right = right_item.get(sort_by)

        if left is None and right is None:
            return 0
        if left is None:
            return 1
        if right is None:
            return -1

        if isinstance(left, str) and isinstance(right, str):
            left_value = left.lower()
            right_value = right.lower()
        else:
            left_value = left
            right_value = right

        result = (left_value > right_value) - (left_value < right_value)
        return -result if descending else result

    return sorted(items, key=cmp_to_key(_cmp))


def _serialize_event(event: _AuditEvent) -> dict[str, object]:
    return {
        "event_id": event.event_id,
        "ticket_id": event.ticket_id,
        "event_type": event.event_type,
        "action_type": event.action_type,
        "actor_user_id": event.actor_user_id,
        "actor_name": event.actor_name,
        "actor_role": event.actor_role,
        "visibility": event.visibility,
        "content": event.content,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "context": event.context,
        "created_at": event.created_at,
        "is_system": event.is_system,
    }


def list_audit_tickets(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None,
    action_type: str | None,
    actor_name: str | None,
    visibility: str | None,
    main_status: str | None,
    created_from: str | None,
    created_to: str | None,
    sort_by: str,
    sort_dir: str,
    limit: int,
    offset: int,
) -> dict[str, object]:
    _require_admin(actor)

    normalized_search = _normalize_optional_text(search)
    normalized_action_type = _normalize_optional_text(action_type)
    normalized_actor = _normalize_optional_text(actor_name)
    normalized_visibility = _normalize_visibility(visibility)
    normalized_main_status = _normalize_main_status(main_status)
    normalized_created_from = _parse_datetime(created_from)
    normalized_created_to = _parse_datetime(created_to, end_of_day=True)
    normalized_sort_by, normalized_sort_dir = _normalize_sort(sort_by, sort_dir)

    if (
        normalized_created_from is not None
        and normalized_created_to is not None
        and normalized_created_from > normalized_created_to
    ):
        raise AuditOperationError(422, "created_from cannot be later than created_to")

    tickets = list(
        db.scalars(
            select(Ticket)
            .where(Ticket.is_deleted.is_(False))
            .order_by(Ticket.id)
        ).all()
    )
    total_count = len(tickets)

    filtered_events = [
        event
        for event in _load_events(db, ticket_id=None)
        if _event_matches(
            event,
            action_type=normalized_action_type,
            actor_keyword=normalized_actor,
            visibility=normalized_visibility,
            search_keyword=None,
            created_from=normalized_created_from,
            created_to=normalized_created_to,
        )
    ]
    event_summary_by_ticket = _build_ticket_audit_summary(filtered_events)

    requires_event_match = any(
        value is not None
        for value in [
            normalized_action_type,
            normalized_actor,
            normalized_visibility,
            normalized_created_from,
            normalized_created_to,
        ]
    )

    ticket_items: list[dict[str, object]] = []
    lowered_search = normalized_search.lower() if normalized_search is not None else None

    for ticket in tickets:
        if normalized_main_status is not None and ticket.main_status != normalized_main_status:
            continue

        if lowered_search is not None:
            if (
                lowered_search not in str(ticket.id).lower()
                and lowered_search not in ticket.title.lower()
                and lowered_search not in (ticket.assigned_to or "").lower()
            ):
                continue

        summary = event_summary_by_ticket.get(ticket.id)
        if requires_event_match and summary is None:
            continue

        ticket_items.append(
            {
                "ticket_id": ticket.id,
                "title": ticket.title,
                "main_status": ticket.main_status,
                "sub_status": ticket.sub_status,
                "priority": ticket.priority,
                "risk_score": ticket.risk_score,
                "assigned_to": ticket.assigned_to,
                "assigned_to_user_id": ticket.assigned_to_user_id,
                "created_at": ticket.created_at,
                "updated_at": ticket.updated_at,
                "log_count": summary.log_count if summary else 0,
                "last_event_at": summary.last_event_at if summary else None,
                "last_actor_name": summary.last_actor_name if summary else None,
                "last_actor_role": summary.last_actor_role if summary else None,
                "last_action_type": summary.last_action_type if summary else None,
            }
        )

    sorted_items = _sort_ticket_items(
        ticket_items,
        sort_by=normalized_sort_by,
        sort_dir=normalized_sort_dir,
    )
    filtered_count = len(sorted_items)

    paged_items = sorted_items[offset : offset + limit]
    next_offset = offset + len(paged_items)
    has_more = next_offset < filtered_count

    return {
        "items": paged_items,
        "total_count": total_count,
        "filtered_count": filtered_count,
        "has_more": has_more,
        "next_offset": next_offset if has_more else None,
    }


def list_ticket_audit_logs(
    db: Session,
    actor: ActorContext,
    *,
    ticket_id: int,
    search: str | None,
    action_type: str | None,
    actor_name: str | None,
    visibility: str | None,
    created_from: str | None,
    created_to: str | None,
    sort_dir: str,
    limit: int,
    offset: int,
) -> dict[str, object]:
    _require_admin(actor)

    ticket = db.get(Ticket, ticket_id)
    if ticket is None or ticket.is_deleted:
        raise AuditOperationError(404, "Ticket not found")

    normalized_search = _normalize_optional_text(search)
    normalized_action_type = _normalize_optional_text(action_type)
    normalized_actor = _normalize_optional_text(actor_name)
    normalized_visibility = _normalize_visibility(visibility)
    normalized_created_from = _parse_datetime(created_from)
    normalized_created_to = _parse_datetime(created_to, end_of_day=True)
    normalized_sort_dir = _normalize_log_sort_dir(sort_dir)

    if (
        normalized_created_from is not None
        and normalized_created_to is not None
        and normalized_created_from > normalized_created_to
    ):
        raise AuditOperationError(422, "created_from cannot be later than created_to")

    all_events = _load_events(db, ticket_id=ticket_id)
    filtered_events = [
        event
        for event in all_events
        if _event_matches(
            event,
            action_type=normalized_action_type,
            actor_keyword=normalized_actor,
            visibility=normalized_visibility,
            search_keyword=normalized_search,
            created_from=normalized_created_from,
            created_to=normalized_created_to,
        )
    ]

    reverse = normalized_sort_dir == "desc"
    filtered_events.sort(key=lambda event: event.created_at, reverse=reverse)

    filtered_count = len(filtered_events)
    paged_events = filtered_events[offset : offset + limit]
    next_offset = offset + len(paged_events)
    has_more = next_offset < filtered_count

    return {
        "ticket": {
            "id": ticket.id,
            "title": ticket.title,
            "main_status": ticket.main_status,
            "sub_status": ticket.sub_status,
            "priority": ticket.priority,
            "risk_score": ticket.risk_score,
            "assigned_to": ticket.assigned_to,
            "assigned_to_user_id": ticket.assigned_to_user_id,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
        },
        "items": [_serialize_event(item) for item in paged_events],
        "total_count": len(all_events),
        "filtered_count": filtered_count,
        "has_more": has_more,
        "next_offset": next_offset if has_more else None,
    }
