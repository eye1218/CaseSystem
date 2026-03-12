from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import cast as type_cast

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.sql.elements import ColumnElement

from ...auth import ActorContext
from ...enums import RoleCode, TicketMainStatus, TicketPriority, TicketSubStatus
from ...security import utcnow
from ..events.service import (
    cancel_pending_ticket_events,
    create_ticket_event,
    create_ticket_timeout_events,
)
from ..knowledge.service import list_related_articles_for_ticket_detail
from ..realtime.service import publish_ticket_changed
from .cache import get_ticket_cache, get_ticket_cache_ttl_seconds
from .models import Ticket, TicketAction, TicketComment
from .schemas import TicketSummaryResponse
from .seed_data import CATEGORY_NAMES, POOL_CODES
from .support_data import (
    ALERT_LIBRARY,
    CONTEXT_LIBRARY,
    REPORT_LIBRARY,
)


TICKET_EVENT_CREATED = "ticket.created"
TICKET_EVENT_COMMENT_CREATED = "ticket.comment.created"
TICKET_EVENT_UPDATED = "ticket.updated"
TICKET_EVENT_RESPONDED = "ticket.responded"
TICKET_EVENT_RESOLVED = "ticket.resolved"
TICKET_EVENT_CLOSED = "ticket.closed"
TICKET_EVENT_REOPENED = "ticket.reopened"
TICKET_EVENT_ESCALATED_TO_POOL = "ticket.escalated.to_pool"
TICKET_EVENT_RESPONSE_TIMEOUT = "ticket.response.timeout"
TICKET_EVENT_RESOLUTION_TIMEOUT = "ticket.resolution.timeout"


class TicketOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


TICKET_VERSION_CONFLICT_MESSAGE = "数据已变更，请刷新后重试"


def _base_conditions(actor: ActorContext) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    conditions.append(Ticket.is_deleted.is_(False))
    if actor.active_role == RoleCode.CUSTOMER.value:
        conditions.append(Ticket.customer_user_id == actor.user_id)
    return conditions


def list_tickets(
    db: Session,
    actor: ActorContext,
    *,
    ticket_id: str | None = None,
    category_id: str | None = None,
    priority: str | None = None,
    main_status: str | None = None,
    sub_status: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: str = "id",
    sort_dir: str = "desc",
) -> tuple[list[Ticket], int]:
    conditions = _base_conditions(actor)
    total_count = (
        db.scalar(select(func.count()).select_from(Ticket).where(*conditions)) or 0
    )

    if ticket_id:
        conditions.append(cast(Ticket.id, String).like(f"%{ticket_id}%"))
    if category_id:
        conditions.append(Ticket.category_id == category_id)
    if priority:
        conditions.append(Ticket.priority == priority)
    if main_status:
        conditions.append(Ticket.main_status == main_status)
    if sub_status:
        conditions.append(Ticket.sub_status == sub_status)
    if created_from:
        conditions.append(Ticket.created_at >= created_from)
    if created_to:
        conditions.append(Ticket.created_at <= created_to)

    sort_map = {
        "id": Ticket.id,
        "priority": Ticket.priority,
        "risk_score": Ticket.risk_score,
        "created_at": Ticket.created_at,
        "response_deadline_at": Ticket.response_deadline_at,
        "resolution_deadline_at": Ticket.resolution_deadline_at,
    }
    sort_column = sort_map.get(sort_by, Ticket.id)
    order_by = sort_column.asc() if sort_dir == "asc" else sort_column.desc()

    items = list(db.scalars(select(Ticket).where(*conditions).order_by(order_by)).all())
    return items, total_count


def get_ticket(db: Session, actor: ActorContext, ticket_id: int) -> Ticket | None:
    conditions = _base_conditions(actor)
    conditions.append(Ticket.id == ticket_id)
    return db.scalar(select(Ticket).where(*conditions))


def _get_ticket_by_id(db: Session, ticket_id: int) -> Ticket | None:
    return db.scalar(
        select(Ticket).where(Ticket.id == ticket_id, Ticket.is_deleted.is_(False))
    )


def _actor_can_access_ticket(
    actor: ActorContext, *, customer_user_id: str | None, is_deleted: bool
) -> bool:
    if is_deleted:
        return False
    if actor.active_role != RoleCode.CUSTOMER.value:
        return True
    return bool(customer_user_id) and customer_user_id == actor.user_id


def _serialize_ticket(ticket: Ticket) -> dict[str, object]:
    return {
        "id": ticket.id,
        "version": ticket.version,
        "title": ticket.title,
        "description": ticket.description,
        "category_id": ticket.category_id,
        "category_name": ticket.category_name,
        "source": ticket.source,
        "priority": ticket.priority,
        "risk_score": ticket.risk_score,
        "main_status": ticket.main_status,
        "sub_status": ticket.sub_status,
        "created_by": ticket.created_by,
        "assigned_to": ticket.assigned_to,
        "current_pool_code": ticket.current_pool_code,
        "responsibility_level": ticket.responsibility_level,
        "response_deadline_at": ticket.response_deadline_at.isoformat()
        if ticket.response_deadline_at
        else None,
        "resolution_deadline_at": ticket.resolution_deadline_at.isoformat()
        if ticket.resolution_deadline_at
        else None,
        "responded_at": ticket.responded_at.isoformat() if ticket.responded_at else None,
        "response_timeout_at": ticket.response_timeout_at.isoformat()
        if ticket.response_timeout_at
        else None,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "resolution_timeout_at": ticket.resolution_timeout_at.isoformat()
        if ticket.resolution_timeout_at
        else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }


def _summary_cache_entry(ticket: Ticket) -> dict[str, object]:
    return {
        "ticket": _serialize_ticket(ticket),
        "_access": {
            "customer_user_id": ticket.customer_user_id,
            "is_deleted": ticket.is_deleted,
        },
    }


def _default_responsibility_level(actor: ActorContext) -> str:
    if actor.active_role in {RoleCode.T1.value, RoleCode.T2.value, RoleCode.T3.value}:
        return actor.active_role
    if actor.active_role == RoleCode.ADMIN.value:
        return RoleCode.T2.value
    return RoleCode.T1.value


def _sla_windows(priority: str) -> tuple[timedelta, timedelta]:
    window_map = {
        TicketPriority.P1.value: (timedelta(hours=1), timedelta(hours=4)),
        TicketPriority.P2.value: (timedelta(hours=2), timedelta(hours=8)),
        TicketPriority.P3.value: (timedelta(hours=4), timedelta(hours=24)),
        TicketPriority.P4.value: (timedelta(hours=8), timedelta(hours=48)),
    }
    try:
        return window_map[priority]
    except KeyError as exc:
        raise TicketOperationError(422, "Unsupported ticket priority") from exc


def _resolve_assignment(
    actor: ActorContext, assignment_mode: str, pool_code: str | None
) -> tuple[str | None, str | None, str]:
    responsibility_level = _default_responsibility_level(actor)

    if actor.active_role == RoleCode.CUSTOMER.value:
        return None, None, responsibility_level

    if assignment_mode == "self":
        return actor.display_name, None, responsibility_level

    if assignment_mode == "pool":
        if pool_code not in POOL_CODES:
            raise TicketOperationError(
                422, "A valid pool code is required when assignment_mode is `pool`"
            )
        assert pool_code is not None
        return None, pool_code, pool_code.removesuffix("_POOL")

    if assignment_mode == "unassigned":
        return None, None, responsibility_level

    raise TicketOperationError(422, "Unsupported assignment mode")


def _visibility_condition(actor: ActorContext, visibility: str) -> bool:
    if actor.active_role != RoleCode.CUSTOMER.value:
        return True
    return visibility != "INTERNAL"


def _available_actions(ticket: Ticket, actor: ActorContext) -> list[str]:
    actions: list[str] = ["comment"]

    if actor.active_role == RoleCode.CUSTOMER.value:
        if ticket.main_status == TicketMainStatus.CLOSED.value:
            actions.append("reopen")
        return actions

    actions.append("edit")
    if ticket.current_pool_code:
        actions.append("claim")
    else:
        actions.append("move_to_pool")

    if ticket.main_status in {
        TicketMainStatus.WAITING_RESPONSE.value,
        TicketMainStatus.RESPONSE_TIMEOUT.value,
    }:
        actions.append("respond")

    if ticket.main_status in {
        TicketMainStatus.IN_PROGRESS.value,
        TicketMainStatus.RESPONSE_TIMEOUT.value,
        TicketMainStatus.RESOLUTION_TIMEOUT.value,
    }:
        actions.append("resolve")

    if ticket.main_status == TicketMainStatus.RESOLVED.value:
        actions.append("close")

    if ticket.main_status == TicketMainStatus.CLOSED.value:
        actions.append("reopen")

    return actions


def _responsibility_summary(ticket: Ticket) -> dict[str, str]:
    if ticket.current_pool_code:
        return {
            "zh": f"当前工单位于 {ticket.current_pool_code}，仍未被具体人员领取，责任归属以池子为准。",
            "en": f"The ticket is currently in {ticket.current_pool_code} and has not been claimed by an individual analyst.",
        }

    return {
        "zh": f"当前工单由 {ticket.assigned_to or '未指派'} 负责，已退出池子流转状态。",
        "en": f"The ticket is currently owned by {ticket.assigned_to or 'Unassigned'} and is no longer in a pool.",
    }


def _permission_scope(actor: ActorContext) -> dict[str, object]:
    if actor.active_role == RoleCode.CUSTOMER.value:
        return {
            "current_role": actor.active_role,
            "page_scope": "仅可查看本人授权范围内工单",
            "comment_scope": "仅显示公开评论与公开进展",
            "hidden_fields": ["内部升级细节", "内部审计备注", "内部研判结论"],
        }

    return {
        "current_role": actor.active_role,
        "page_scope": "可查看当前角色可访问的完整工单详情",
        "comment_scope": "可查看公开评论与内部协作评论",
        "hidden_fields": [],
    }


def _reports(ticket: Ticket) -> list[dict[str, object]]:
    reports: list[dict[str, object]] = []
    for item in REPORT_LIBRARY.get(ticket.category_id, []):
        reports.append(
            {
                **item,
                "download_path": f"/api/v1/tickets/{ticket.id}/reports/{item['id']}/download",
            }
        )
    return reports


def _raw_alerts(ticket: Ticket) -> list[dict[str, object]]:
    return type_cast(list[dict[str, object]], ALERT_LIBRARY.get(ticket.source, []))


def _external_context(ticket: Ticket) -> dict[str, object]:
    asset = CONTEXT_LIBRARY.get(ticket.category_id, CONTEXT_LIBRARY["network"])
    return {
        "source": asset["meta"]["source"],
        "rule_name": asset["meta"]["rule_name"],
        "severity": asset["meta"]["severity"],
        "asset": asset["meta"]["asset"],
        "indicator": asset["meta"]["indicator"],
        "summary": asset["summary"],
    }


def _context_markdown(ticket: Ticket) -> dict[str, str]:
    return CONTEXT_LIBRARY.get(ticket.category_id, CONTEXT_LIBRARY["network"])[
        "markdown"
    ]


def _activity_feed_raw(db: Session, ticket_id: int) -> list[dict[str, object]]:
    actions = list(
        db.scalars(
            select(TicketAction)
            .where(TicketAction.ticket_id == ticket_id)
            .order_by(TicketAction.created_at)
        ).all()
    )
    comments = list(
        db.scalars(
            select(TicketComment)
            .where(TicketComment.ticket_id == ticket_id)
            .order_by(TicketComment.created_at)
        ).all()
    )

    items = [
        {
            "id": action.id,
            "item_type": action.action_type,
            "actor_name": action.actor_name,
            "actor_role": action.actor_role,
            "visibility": action.visibility,
            "content": action.content,
            "from_status": action.from_status,
            "to_status": action.to_status,
            "created_at": action.created_at.isoformat(),
            "is_system": action.actor_role is None,
        }
        for action in actions
    ]
    items.extend(
        {
            "id": comment.id,
            "item_type": "comment",
            "actor_name": comment.actor_name,
            "actor_role": comment.actor_role,
            "visibility": comment.visibility,
            "content": comment.content,
            "from_status": None,
            "to_status": None,
            "created_at": comment.created_at.isoformat(),
            "is_system": comment.is_system,
        }
        for comment in comments
    )
    return type_cast(
        list[dict[str, object]], sorted(items, key=lambda item: str(item["created_at"]))
    )


def _filter_activity_feed(
    raw_items: list[dict[str, object]], actor: ActorContext
) -> list[dict[str, object]]:
    return [
        item
        for item in raw_items
        if _visibility_condition(actor, str(item.get("visibility", "PUBLIC")))
    ]


def _detail_base_entry(db: Session, ticket: Ticket) -> dict[str, object]:
    return {
        "ticket": _serialize_ticket(ticket),
        "_access": {
            "customer_user_id": ticket.customer_user_id,
            "is_deleted": ticket.is_deleted,
        },
        "activity_feed": _activity_feed_raw(db, ticket.id),
        "reports": _reports(ticket),
        "raw_alerts": _raw_alerts(ticket),
        "siem_context_markdown": _context_markdown(ticket),
        "external_context": _external_context(ticket),
        "responsibility_summary": _responsibility_summary(ticket),
    }


def _detail_response_from_base(
    db: Session, base: dict[str, object], actor: ActorContext
) -> dict[str, object]:
    ticket_payload = type_cast(dict[str, object], base["ticket"])
    ticket_model = TicketSummaryResponse.model_validate(ticket_payload)
    raw_items = type_cast(list[dict[str, object]], base["activity_feed"])
    return {
        "ticket": ticket_payload,
        "available_actions": _available_actions(ticket_model, actor),
        "activity_feed": _filter_activity_feed(raw_items, actor),
        "related_knowledge": list_related_articles_for_ticket_detail(
            db, actor, category_id=str(ticket_payload["category_id"])
        ),
        "reports": base["reports"],
        "raw_alerts": base["raw_alerts"],
        "siem_context_markdown": base["siem_context_markdown"],
        "external_context": base["external_context"],
        "responsibility_summary": base["responsibility_summary"],
        "permission_scope": _permission_scope(actor),
    }


def _live_response_from_base(
    base: dict[str, object], actor: ActorContext
) -> dict[str, object]:
    ticket_payload = type_cast(dict[str, object], base["ticket"])
    ticket_model = TicketSummaryResponse.model_validate(ticket_payload)
    raw_items = type_cast(list[dict[str, object]], base["activity_feed"])
    return {
        "ticket": ticket_payload,
        "available_actions": _available_actions(ticket_model, actor),
        "activity_feed": _filter_activity_feed(raw_items, actor),
        "raw_alerts": base["raw_alerts"],
        "responsibility_summary": base["responsibility_summary"],
        "permission_scope": _permission_scope(actor),
    }


def _load_summary_cache_entry(db: Session, ticket_id: int) -> dict[str, object] | None:
    cache = get_ticket_cache()
    cached = cache.get_summary(ticket_id)
    if cached is not None:
        return cached
    ticket = _get_ticket_by_id(db, ticket_id)
    if ticket is None:
        return None
    entry = _summary_cache_entry(ticket)
    cache.set_summary(
        ticket_id,
        entry,
        ttl_seconds=get_ticket_cache_ttl_seconds(),
    )
    return entry


def _load_detail_base(db: Session, ticket_id: int) -> dict[str, object] | None:
    cache = get_ticket_cache()
    cached = cache.get_detail_base(ticket_id)
    if cached is not None:
        return cached
    ticket = _get_ticket_by_id(db, ticket_id)
    if ticket is None:
        return None
    entry = _detail_base_entry(db, ticket)
    cache.set_detail_base(
        ticket_id,
        entry,
        ttl_seconds=get_ticket_cache_ttl_seconds(),
    )
    return entry


def get_ticket_summary(
    db: Session, actor: ActorContext, ticket_id: int
) -> dict[str, object] | None:
    entry = _load_summary_cache_entry(db, ticket_id)
    if entry is None:
        return None
    access = type_cast(dict[str, object], entry["_access"])
    if not _actor_can_access_ticket(
        actor,
        customer_user_id=type_cast(str | None, access.get("customer_user_id")),
        is_deleted=bool(access.get("is_deleted")),
    ):
        return None
    return type_cast(dict[str, object], entry["ticket"])


def build_ticket_detail(
    db: Session, actor: ActorContext, ticket: Ticket
) -> dict[str, object]:
    return _detail_response_from_base(db, _detail_base_entry(db, ticket), actor)


def get_ticket_detail(
    db: Session, actor: ActorContext, ticket_id: int
) -> dict[str, object] | None:
    base = _load_detail_base(db, ticket_id)
    if base is None:
        return None
    access = type_cast(dict[str, object], base["_access"])
    if not _actor_can_access_ticket(
        actor,
        customer_user_id=type_cast(str | None, access.get("customer_user_id")),
        is_deleted=bool(access.get("is_deleted")),
    ):
        return None
    return _detail_response_from_base(db, base, actor)


def get_ticket_live(
    db: Session, actor: ActorContext, ticket_id: int
) -> dict[str, object] | None:
    base = _load_detail_base(db, ticket_id)
    if base is None:
        return None
    access = type_cast(dict[str, object], base["_access"])
    if not _actor_can_access_ticket(
        actor,
        customer_user_id=type_cast(str | None, access.get("customer_user_id")),
        is_deleted=bool(access.get("is_deleted")),
    ):
        return None
    return _live_response_from_base(base, actor)


def create_ticket(
    db: Session,
    actor: ActorContext,
    *,
    title: str,
    description: str,
    category_id: str,
    priority: str,
    risk_score: int,
    assignment_mode: str = "unassigned",
    pool_code: str | None = None,
) -> dict[str, object]:
    if category_id not in CATEGORY_NAMES:
        raise TicketOperationError(422, "Unsupported ticket category")

    response_window, resolution_window = _sla_windows(priority)
    assigned_to, current_pool_code, responsibility_level = _resolve_assignment(
        actor, assignment_mode, pool_code
    )
    now = utcnow()
    source = "CUSTOMER" if actor.active_role == RoleCode.CUSTOMER.value else "INTERNAL"

    ticket = Ticket(
        title=title,
        description=description,
        category_id=category_id,
        category_name=CATEGORY_NAMES[category_id],
        source=source,
        priority=priority,
        risk_score=risk_score,
        main_status=TicketMainStatus.WAITING_RESPONSE.value,
        sub_status=TicketSubStatus.NONE.value,
        created_by=actor.display_name,
        created_by_user_id=actor.user_id,
        customer_user_id=actor.user_id
        if actor.active_role == RoleCode.CUSTOMER.value
        else None,
        assigned_to=assigned_to,
        assigned_to_user_id=actor.user_id if assigned_to else None,
        current_pool_code=current_pool_code,
        responsibility_level=responsibility_level,
        response_deadline_at=now + response_window,
        resolution_deadline_at=now + resolution_window,
        created_at=now,
        updated_at=now,
    )
    db.add(ticket)
    db.flush()

    _record_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="created",
        content="手工创建工单。",
        to_status=TicketMainStatus.WAITING_RESPONSE.value,
        visibility="PUBLIC",
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_CREATED)
    create_ticket_timeout_events(
        db,
        ticket_id=ticket.id,
        response_deadline_at=ticket.response_deadline_at,
        resolution_deadline_at=ticket.resolution_deadline_at,
    )
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(ticket, actor, change_type="created", occurred_at=now)
    return build_ticket_detail(db, actor, ticket)


def _assert_internal_actor(actor: ActorContext) -> None:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise TicketOperationError(403, "Current role cannot perform this action")


def _assert_ticket_version(ticket: Ticket, expected_version: int) -> None:
    if ticket.version != expected_version:
        raise TicketOperationError(409, TICKET_VERSION_CONFLICT_MESSAGE)


def _commit_ticket_changes(db: Session) -> None:
    try:
        db.commit()
    except StaleDataError as exc:
        db.rollback()
        raise TicketOperationError(409, TICKET_VERSION_CONFLICT_MESSAGE) from exc


def _invalidate_ticket_cache(ticket_id: int) -> None:
    get_ticket_cache().invalidate_ticket(ticket_id)


def _publish_ticket_change(
    ticket: Ticket,
    actor: ActorContext,
    *,
    change_type: str,
    occurred_at: datetime,
) -> None:
    publish_ticket_changed(
        ticket_id=ticket.id,
        change_type=change_type,
        operator_user_id=actor.user_id,
        customer_user_id=ticket.customer_user_id,
        occurred_at=occurred_at,
    )


def _record_action(
    db: Session,
    *,
    ticket_id: int,
    actor: ActorContext,
    action_type: str,
    content: str,
    from_status: str | None = None,
    to_status: str | None = None,
    visibility: str = "PUBLIC",
    context: dict[str, object] | None = None,
) -> None:
    db.add(
        TicketAction(
            id=str(uuid.uuid4()),
            ticket_id=ticket_id,
            action_type=action_type,
            actor_user_id=actor.user_id,
            actor_name=actor.display_name,
            actor_role=actor.active_role,
            visibility=visibility,
            content=content,
            from_status=from_status,
            to_status=to_status,
            context=context or {},
            created_at=utcnow(),
        )
    )


def add_ticket_comment(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    content: str,
    visibility: str,
    expected_version: int,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_ticket_version(ticket, expected_version)

    normalized_visibility = (
        "PUBLIC" if actor.active_role == RoleCode.CUSTOMER.value else visibility
    )
    now = utcnow()
    ticket.updated_at = now
    db.add(
        TicketComment(
            ticket_id=ticket.id,
            actor_user_id=actor.user_id,
            actor_name=actor.display_name,
            actor_role=actor.active_role,
            visibility=normalized_visibility,
            content=content,
            is_system=False,
            created_at=now,
            updated_at=now,
        )
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_COMMENT_CREATED)
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(
        ticket,
        actor,
        change_type="comment_created",
        occurred_at=now,
    )
    return build_ticket_detail(db, actor, ticket)


def update_ticket_detail(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    *,
    expected_version: int,
    title: str | None = None,
    description: str | None = None,
    category_id: str | None = None,
    priority: str | None = None,
    risk_score: int | None = None,
) -> dict[str, object]:
    _assert_internal_actor(actor)
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_ticket_version(ticket, expected_version)

    changed = False
    changed_at = utcnow()
    if title is not None:
        ticket.title = title
        changed = True
    if description is not None:
        ticket.description = description
        changed = True
    if category_id is not None:
        ticket.category_id = category_id
        ticket.category_name = CATEGORY_NAMES.get(category_id, category_id)
        changed = True
    if priority is not None:
        ticket.priority = priority
        changed = True
    if risk_score is not None:
        ticket.risk_score = risk_score
        changed = True

    if changed:
        ticket.updated_at = changed_at
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="updated",
            content="更新了工单基础信息。",
        )
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_UPDATED)
        _commit_ticket_changes(db)
        _invalidate_ticket_cache(ticket.id)
        db.refresh(ticket)
        _publish_ticket_change(
            ticket,
            actor,
            change_type="updated",
            occurred_at=changed_at,
        )

    return build_ticket_detail(db, actor, ticket)


def execute_ticket_action(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    action: str,
    expected_version: int,
    note: str | None = None,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_ticket_version(ticket, expected_version)

    if action not in _available_actions(ticket, actor):
        raise TicketOperationError(
            403, f"Action `{action}` is not available for the current role or status"
        )

    now = utcnow()
    previous_status = ticket.main_status

    if action == "respond":
        if ticket.responded_at is None:
            ticket.responded_at = now
        if ticket.main_status in {
            TicketMainStatus.WAITING_RESPONSE.value,
            TicketMainStatus.REOPENED.value,
        }:
            ticket.main_status = TicketMainStatus.IN_PROGRESS.value
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="status_change",
            content=note or "已完成响应，进入处理阶段。",
            from_status=previous_status,
            to_status=ticket.main_status,
        )
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_RESPONDED)
        cancel_pending_ticket_events(
            db, ticket_id=ticket.id, names=[TICKET_EVENT_RESPONSE_TIMEOUT]
        )
    elif action == "resolve":
        _assert_internal_actor(actor)
        ticket.resolved_at = now
        ticket.main_status = TicketMainStatus.RESOLVED.value
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="resolved",
            content=note or "工单已完成处置。",
            from_status=previous_status,
            to_status=ticket.main_status,
        )
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_RESOLVED)
        cancel_pending_ticket_events(
            db, ticket_id=ticket.id, names=[TICKET_EVENT_RESOLUTION_TIMEOUT]
        )
    elif action == "close":
        _assert_internal_actor(actor)
        ticket.closed_at = now
        ticket.main_status = TicketMainStatus.CLOSED.value
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="closed",
            content=note or "工单已关闭并进入归档状态。",
            from_status=previous_status,
            to_status=ticket.main_status,
        )
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_CLOSED)
        cancel_pending_ticket_events(
            db,
            ticket_id=ticket.id,
            names=[TICKET_EVENT_RESPONSE_TIMEOUT, TICKET_EVENT_RESOLUTION_TIMEOUT],
        )
    elif action == "reopen":
        ticket.closed_at = None
        ticket.main_status = TicketMainStatus.WAITING_RESPONSE.value
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="reopened",
            content=note or "工单已重开，重新回到待响应状态。",
            from_status=previous_status,
            to_status=ticket.main_status,
        )
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_REOPENED)
        create_ticket_timeout_events(
            db,
            ticket_id=ticket.id,
            response_deadline_at=ticket.response_deadline_at,
            resolution_deadline_at=ticket.resolution_deadline_at,
        )
    elif action == "claim":
        _assert_internal_actor(actor)
        ticket.assigned_to = actor.display_name
        ticket.assigned_to_user_id = actor.user_id
        ticket.current_pool_code = None
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="claimed",
            content=note or f"{actor.display_name} 已领取当前工单。",
            visibility="PUBLIC",
        )
    elif action == "move_to_pool":
        _assert_internal_actor(actor)
        ticket.assigned_to = None
        ticket.assigned_to_user_id = None
        ticket.current_pool_code = f"{ticket.responsibility_level}_POOL"
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="moved_to_pool",
            content=note or f"工单已重新投入 {ticket.current_pool_code}。",
            visibility="PUBLIC",
            context={"pool": ticket.current_pool_code},
        )
        create_ticket_event(
            db, ticket_id=ticket.id, name=TICKET_EVENT_ESCALATED_TO_POOL
        )
    else:
        raise TicketOperationError(400, f"Unsupported action `{action}`")

    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(
        ticket,
        actor,
        change_type="assigned"
        if action in {"claim", "move_to_pool"}
        else "status_changed",
        occurred_at=now,
    )
    return build_ticket_detail(db, actor, ticket)


def get_report_download(
    db: Session, actor: ActorContext, ticket_id: int, report_id: str, language: str
) -> tuple[str, str] | None:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        return None

    lang = "en" if language == "en" else "zh"
    for report in REPORT_LIBRARY.get(ticket.category_id, []):
        if report.get("id") != report_id:
            continue
        report_no = report.get("report_no")
        content = report.get("content")
        if not isinstance(report_no, str) or not isinstance(content, dict):
            continue
        body = content.get(lang)
        if not isinstance(body, str):
            continue
        filename = f"{report_no}-{lang}.md"
        return filename, body
    return None
