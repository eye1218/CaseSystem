from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional, cast as type_cast

from sqlalchemy import String, and_, cast, delete, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.sql.elements import ColumnElement

from ...auth import ActorContext
from ...enums import (
    RoleCode,
    TicketEscalationMode,
    TicketEscalationStatus,
    TicketMainStatus,
    TicketSubStatus,
)
from ...models import User, UserRole
from ...reporting import list_reports_for_ticket_detail, list_templates_for_ticket_detail
from ...security import utcnow
from ..alert_sources.service import (
    AlertSourceOperationError,
    _describe_external_error,
    _get_source_or_error,
    _query_alert_rows,
    get_preferred_enabled_alert_source,
)
from ..config.service import SLA_POLICY_CATEGORY, get_config
from ..events.service import (
    cancel_pending_ticket_events,
    clear_registered_immediate_dispatches,
    create_ticket_event,
    create_ticket_timeout_events,
    dispatch_registered_immediate_events,
)
from ..knowledge.service import list_related_articles_for_ticket_detail
from ..realtime.service import (
    deliver_notification,
    publish_ticket_changed,
    resolve_notification_action,
)
from .cache import get_ticket_cache, get_ticket_cache_ttl_seconds
from .models import (
    Ticket,
    TicketAction,
    TicketAlarmRelation,
    TicketComment,
    TicketContext,
    TicketEscalation,
)
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
TICKET_EVENT_ASSIGNED = "ticket.assigned"
TICKET_EVENT_STATUS_CHANGED = "ticket.status.changed"
TICKET_EVENT_CLOSED = "ticket.closed"
TICKET_EVENT_REOPENED = "ticket.reopened"
TICKET_EVENT_ESCALATED = "ticket.escalated"
TICKET_EVENT_ESCALATION_REQUESTED = "ticket.escalation.requested"
TICKET_EVENT_ESCALATION_ACCEPTED = "ticket.escalation.accepted"
TICKET_EVENT_ESCALATION_REJECTED = "ticket.escalation.rejected"
TICKET_EVENT_RESPONSE_TIMEOUT = "ticket.response.timeout"
TICKET_EVENT_RESOLUTION_TIMEOUT = "ticket.resolution.timeout"

POOL_TIER_ORDER = {
    "T1_POOL": 1,
    "T2_POOL": 2,
    "T3_POOL": 3,
}
ROLE_TIER_ORDER = {
    RoleCode.T1.value: 1,
    RoleCode.T2.value: 2,
    RoleCode.T3.value: 3,
    RoleCode.ADMIN.value: 4,
}
PUBLIC_TICKET_SOURCES = {
    "API",
    "INTERNAL",
    "CUSTOMER",
}


class TicketOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


TICKET_VERSION_CONFLICT_MESSAGE = "数据已变更，请刷新后重试"
logger = logging.getLogger(__name__)


def _normalize_alarm_ids(alarm_ids: list[str] | None) -> list[str]:
    if alarm_ids is None:
        return []
    normalized: list[str] = []
    if len(alarm_ids) > 500:
        raise TicketOperationError(422, "At most 500 alarm IDs are allowed")
    for index, value in enumerate(alarm_ids):
        item = value.strip()
        if not item:
            raise TicketOperationError(422, f"Alarm ID at position {index + 1} is required")
        if len(item) > 128:
            raise TicketOperationError(422, f"Alarm ID at position {index + 1} exceeds 128 characters")
        normalized.append(item)
    return normalized


def _normalize_context_markdown(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _base_conditions(actor: ActorContext) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    conditions.append(Ticket.is_deleted.is_(False))
    return conditions


def _ticket_has_assignee_expression() -> ColumnElement[bool]:
    return or_(Ticket.assigned_to_user_id.is_not(None), Ticket.assigned_to.is_not(None))


def _ticket_has_no_assignee_expression() -> ColumnElement[bool]:
    return and_(Ticket.assigned_to_user_id.is_(None), Ticket.assigned_to.is_(None))


def list_tickets(
    db: Session,
    actor: ActorContext,
    *,
    ticket_id: str | None = None,
    category_ids: list[str] | None = None,
    priorities: list[str] | None = None,
    main_statuses: list[str] | None = None,
    sub_statuses: list[str] | None = None,
    claim_statuses: list[str] | None = None,
    pool_codes: list[str] | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort_by: str = "id",
    sort_dir: str = "desc",
    assigned_to_me: bool = False,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[Ticket], int, int]:
    conditions = _base_conditions(actor)
    total_count = (
        db.scalar(select(func.count()).select_from(Ticket).where(*conditions)) or 0
    )

    if ticket_id:
        conditions.append(cast(Ticket.id, String).like(f"%{ticket_id}%"))
    if category_ids:
        conditions.append(Ticket.category_id.in_(category_ids))
    if priorities:
        conditions.append(Ticket.priority.in_(priorities))
    if main_statuses:
        conditions.append(Ticket.main_status.in_(main_statuses))
    if sub_statuses:
        conditions.append(Ticket.sub_status.in_(sub_statuses))
    if pool_codes:
        conditions.append(Ticket.current_pool_code.in_(pool_codes))
    if claim_statuses:
        normalized_claim_statuses = {value for value in claim_statuses if value in {"claimed", "unclaimed"}}
        if not normalized_claim_statuses:
            raise TicketOperationError(422, "Unsupported claim status filter")
        if normalized_claim_statuses == {"claimed"}:
            conditions.append(_ticket_has_assignee_expression())
        elif normalized_claim_statuses == {"unclaimed"}:
            conditions.append(_ticket_has_no_assignee_expression())
    if created_from:
        conditions.append(Ticket.created_at >= created_from)
    if created_to:
        conditions.append(Ticket.created_at <= created_to)
    if assigned_to_me:
        conditions.append(Ticket.assigned_to_user_id == actor.user_id)

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

    filtered_count = (
        db.scalar(select(func.count()).select_from(Ticket).where(*conditions)) or 0
    )

    statement = select(Ticket).where(*conditions).order_by(order_by)
    if offset > 0:
        statement = statement.offset(offset)
    if limit is not None:
        statement = statement.limit(limit)

    items = list(db.scalars(statement).all())
    return items, total_count, filtered_count


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
    return True


def _serialize_ticket(ticket: Ticket) -> dict[str, object]:
    return {
        "id": ticket.id,
        "version": ticket.version,
        "title": ticket.title,
        "description": ticket.description,
        "category_id": ticket.category_id,
        "category_name": ticket.category_name,
        "source": _public_ticket_source(ticket.source),
        "priority": ticket.priority,
        "risk_score": ticket.risk_score,
        "main_status": ticket.main_status,
        "sub_status": ticket.sub_status,
        "created_by": ticket.created_by,
        "assigned_to": ticket.assigned_to,
        "assigned_to_user_id": ticket.assigned_to_user_id,
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


def _list_ticket_alarm_ids(db: Session, ticket_id: int) -> list[str]:
    rows = list(
        db.scalars(
            select(TicketAlarmRelation)
            .where(TicketAlarmRelation.ticket_id == ticket_id)
            .order_by(TicketAlarmRelation.sort_order.asc(), TicketAlarmRelation.created_at.asc())
        ).all()
    )
    return [row.alarm_id for row in rows]


def _get_ticket_context_row(db: Session, ticket_id: int) -> TicketContext | None:
    return db.get(TicketContext, ticket_id)


def _get_ticket_context_markdown(db: Session, ticket_id: int) -> str | None:
    context_row = _get_ticket_context_row(db, ticket_id)
    return context_row.content_markdown if context_row is not None else None


def _replace_ticket_alarm_relations(
    db: Session,
    *,
    ticket_id: int,
    actor: ActorContext,
    alarm_ids: list[str],
) -> None:
    db.execute(
        delete(TicketAlarmRelation).where(TicketAlarmRelation.ticket_id == ticket_id)
    )
    now = utcnow()
    for index, alarm_id in enumerate(alarm_ids):
        db.add(
            TicketAlarmRelation(
                ticket_id=ticket_id,
                sort_order=index,
                alarm_id=alarm_id,
                created_at=now,
                created_by_user_id=actor.user_id,
            )
        )


def _upsert_ticket_context(
    db: Session,
    *,
    ticket_id: int,
    actor: ActorContext,
    context_markdown: str | None,
) -> None:
    existing = _get_ticket_context_row(db, ticket_id)
    if context_markdown is None:
        if existing is not None:
            db.delete(existing)
        return

    now = utcnow()
    if existing is None:
        db.add(
            TicketContext(
                ticket_id=ticket_id,
                content_markdown=context_markdown,
                created_at=now,
                updated_at=now,
                created_by_user_id=actor.user_id,
                updated_by_user_id=actor.user_id,
            )
        )
        return

    existing.content_markdown = context_markdown
    existing.updated_at = now
    existing.updated_by_user_id = actor.user_id


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


def _public_ticket_source(source: str) -> str:
    return source if source in PUBLIC_TICKET_SOURCES else "API"


def _normalize_priority_code(priority: str) -> str:
    return priority.strip().upper()


def _sla_windows(db: Session, priority: str) -> tuple[timedelta, timedelta]:
    normalized_priority = _normalize_priority_code(priority)
    policy = get_config(db, SLA_POLICY_CATEGORY, normalized_priority)
    if policy is None or not policy.is_active:
        raise TicketOperationError(422, "Unsupported ticket priority")
    value = policy.value if isinstance(policy.value, dict) else {}
    try:
        response_minutes = int(value.get("response_minutes"))
        resolution_minutes = int(value.get("resolution_minutes"))
    except (TypeError, ValueError) as exc:
        raise TicketOperationError(422, "Unsupported ticket priority") from exc
    if response_minutes <= 0 or resolution_minutes <= 0 or resolution_minutes < response_minutes:
        raise TicketOperationError(422, "Unsupported ticket priority")
    return timedelta(minutes=response_minutes), timedelta(minutes=resolution_minutes)


def _resolve_assignment(
    actor: ActorContext, assignment_mode: str, pool_code: str | None
) -> tuple[str | None, str | None, str]:
    if assignment_mode not in {"unassigned", "pool"}:
        raise TicketOperationError(422, "Unsupported assignment mode")

    if assignment_mode == "pool" and not pool_code:
        raise TicketOperationError(
            422, "A valid pool code is required when assignment_mode is `pool`"
        )

    if pool_code and pool_code not in POOL_CODES:
        raise TicketOperationError(
            422, "A valid pool code is required when assignment_mode is `pool`"
        )

    resolved_pool = pool_code or "T1_POOL"
    return None, resolved_pool, resolved_pool.removesuffix("_POOL")


def _pool_code_to_level(pool_code: str | None) -> str | None:
    if not pool_code:
        return None
    return pool_code.removesuffix("_POOL")


def _level_to_pool_code(level: str | None) -> str | None:
    if level in {RoleCode.T1.value, RoleCode.T2.value, RoleCode.T3.value}:
        return f"{level}_POOL"
    return None


def _tier_rank_for_role(role_code: str) -> int:
    return ROLE_TIER_ORDER.get(role_code, 0)


def _tier_rank_for_pool(pool_code: str | None) -> int:
    if pool_code is None:
        return 0
    return POOL_TIER_ORDER.get(pool_code, 0)


def _role_can_operate_pool(role_code: str, pool_code: str | None) -> bool:
    if pool_code is None:
        return False
    if role_code == RoleCode.CUSTOMER.value:
        return False
    if role_code == RoleCode.ADMIN.value:
        return True
    return _tier_rank_for_role(role_code) >= _tier_rank_for_pool(pool_code)


def _role_codes_can_operate_pool(role_codes: list[str], pool_code: str | None) -> bool:
    return any(_role_can_operate_pool(role_code, pool_code) for role_code in role_codes)


def _next_pool_code(pool_code: str | None, responsibility_level: str) -> str | None:
    current_level = _pool_code_to_level(pool_code) or responsibility_level
    if current_level == RoleCode.T1.value:
        return "T2_POOL"
    if current_level == RoleCode.T2.value:
        return "T3_POOL"
    return None


def _is_internal_role(role_code: str) -> bool:
    return role_code in {
        RoleCode.T1.value,
        RoleCode.T2.value,
        RoleCode.T3.value,
        RoleCode.ADMIN.value,
    }


def _highest_internal_role(role_codes: list[str]) -> str | None:
    internal_roles = [code for code in role_codes if code in {RoleCode.T1.value, RoleCode.T2.value, RoleCode.T3.value}]
    if not internal_roles:
        if RoleCode.ADMIN.value in role_codes:
            return RoleCode.T2.value
        return None
    return max(internal_roles, key=_tier_rank_for_role)


def _actor_can_claim_pool(actor: ActorContext, pool_code: str | None) -> bool:
    return _role_can_operate_pool(actor.active_role, pool_code)


def _ticket_operation_pool_code(ticket: Ticket | TicketSummaryResponse) -> str | None:
    return ticket.current_pool_code or _level_to_pool_code(ticket.responsibility_level)


def _actor_can_operate_ticket(
    actor: ActorContext, ticket: Ticket | TicketSummaryResponse
) -> bool:
    return _role_can_operate_pool(actor.active_role, _ticket_operation_pool_code(ticket))


def _assert_actor_can_operate_ticket(actor: ActorContext, ticket: Ticket) -> None:
    _assert_internal_actor(actor)
    if not _actor_can_operate_ticket(actor, ticket):
        raise TicketOperationError(403, "Current role cannot operate on this ticket")


def _assert_valid_ownership_state(ticket: Ticket) -> None:
    has_pool = bool(ticket.current_pool_code)
    has_owner_name = bool(ticket.assigned_to)
    has_owner_user = bool(ticket.assigned_to_user_id)
    if has_owner_name != has_owner_user:
        raise TicketOperationError(409, "Ticket ownership state is invalid")
    if not has_pool and not has_owner_user:
        raise TicketOperationError(409, "Ticket ownership state is invalid")


def _get_active_internal_user(db: Session, user_id: str) -> tuple[User, list[str], str]:
    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise TicketOperationError(422, "Target user is invalid")

    role_codes = list(
        db.scalars(
            select(UserRole.role_code).where(
                UserRole.user_id == user_id,
                UserRole.is_active.is_(True),
            )
        ).all()
    )
    highest_role = _highest_internal_role(role_codes)
    if highest_role is None:
        raise TicketOperationError(422, "Target user is invalid")
    return user, role_codes, highest_role


def _list_active_internal_users(db: Session) -> list[dict[str, object]]:
    users = list(
        db.scalars(select(User).where(User.status == "active").order_by(User.display_name.asc())).all()
    )
    items: list[dict[str, object]] = []
    for user in users:
        role_codes = list(
            db.scalars(
                select(UserRole.role_code).where(
                    UserRole.user_id == user.id,
                    UserRole.is_active.is_(True),
                )
            ).all()
        )
        highest_role = _highest_internal_role(role_codes)
        if highest_role is None:
            continue
        items.append(
            {
                "id": user.id,
                "username": user.username,
                "display_name": user.display_name,
                "highest_role_code": highest_role,
                "role_codes": role_codes,
            }
        )
    return items


def _get_pending_escalation(db: Session, ticket_id: int) -> TicketEscalation | None:
    return db.scalar(
        select(TicketEscalation).where(
            TicketEscalation.ticket_id == ticket_id,
            TicketEscalation.status == TicketEscalationStatus.PENDING_CONFIRM.value,
        )
    )


def _assert_no_pending_escalation(db: Session, ticket_id: int) -> None:
    if _get_pending_escalation(db, ticket_id) is not None:
        raise TicketOperationError(
            409, "Ticket has a pending escalation request awaiting response"
        )


def _serialize_escalation(escalation: TicketEscalation | None) -> dict[str, object] | None:
    if escalation is None:
        return None
    return {
        "id": escalation.id,
        "ticket_id": escalation.ticket_id,
        "mode": escalation.mode,
        "status": escalation.status,
        "source_level": escalation.source_level,
        "target_level": escalation.target_level,
        "target_user_id": escalation.target_user_id,
        "target_pool_code": escalation.target_pool_code,
        "requested_by": escalation.requested_by_name,
        "requested_at": escalation.requested_at.isoformat(),
        "reject_reason": escalation.reject_reason,
        "source_pool_code": escalation.source_pool_code,
        "source_assigned_to": escalation.source_assigned_to,
    }


def _visibility_condition(actor: ActorContext, visibility: str) -> bool:
    if actor.active_role != RoleCode.CUSTOMER.value:
        return True
    return visibility != "INTERNAL"


def _available_actions(
    ticket: Ticket | TicketSummaryResponse,
    actor: ActorContext,
    *,
    has_pending_escalation: bool = False,
) -> list[str]:
    actions: list[str] = ["comment"]

    if actor.active_role == RoleCode.CUSTOMER.value:
        if ticket.main_status == TicketMainStatus.CLOSED.value:
            actions.append("reopen")
        return actions

    can_operate_ticket = _actor_can_operate_ticket(actor, ticket)

    if can_operate_ticket:
        actions.append("edit")

    if can_operate_ticket and not has_pending_escalation:
        if (
            ticket.current_pool_code
            and ticket.assigned_to_user_id is None
            and _actor_can_claim_pool(actor, ticket.current_pool_code)
        ):
            actions.append("claim")
            if _next_pool_code(ticket.current_pool_code, ticket.responsibility_level):
                actions.append("escalate_pool")
            actions.append("escalate_user")
        elif ticket.assigned_to_user_id == actor.user_id:
            actions.append("move_to_pool")
            if _next_pool_code(ticket.current_pool_code, ticket.responsibility_level):
                actions.append("escalate_pool")
            actions.append("escalate_user")

        if actor.active_role == RoleCode.ADMIN.value:
            actions.append("assign")

    if can_operate_ticket and ticket.main_status == TicketMainStatus.WAITING_RESPONSE.value:
        actions.append("respond")

    if can_operate_ticket and ticket.main_status == TicketMainStatus.IN_PROGRESS.value:
        actions.append("resolve")

    if can_operate_ticket and ticket.main_status == TicketMainStatus.RESOLVED.value:
        actions.append("close")

    if can_operate_ticket and ticket.main_status == TicketMainStatus.CLOSED.value:
        actions.append("reopen")

    return actions


def _responsibility_summary(ticket: Ticket) -> dict[str, str]:
    if ticket.current_pool_code and ticket.assigned_to:
        return {
            "zh": f"当前工单位于 {ticket.current_pool_code}，由 {ticket.assigned_to} 负责处理。",
            "en": f"The ticket is currently tracked in {ticket.current_pool_code} and assigned to {ticket.assigned_to}.",
        }

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
            "page_scope": "单租户模式下可查看当前系统全部工单",
            "comment_scope": "仅显示公开评论与公开进展",
            "hidden_fields": ["内部升级细节", "内部审计备注", "内部研判结论"],
        }

    return {
        "current_role": actor.active_role,
        "page_scope": "内部人员可查看全部工单，操作权限按当前角色对应的池子层级控制",
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
    pending_escalation = _get_pending_escalation(db, ticket.id)
    return {
        "ticket": _serialize_ticket(ticket),
        "_access": {
            "customer_user_id": ticket.customer_user_id,
            "is_deleted": ticket.is_deleted,
        },
        "pending_escalation": _serialize_escalation(pending_escalation),
        "activity_feed": _activity_feed_raw(db, ticket.id),
        "alarm_ids": _list_ticket_alarm_ids(db, ticket.id),
        "context_markdown": _get_ticket_context_markdown(db, ticket.id),
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
    has_pending_escalation = base["pending_escalation"] is not None
    return {
        "ticket": ticket_payload,
        "available_actions": _available_actions(
            ticket_model, actor, has_pending_escalation=has_pending_escalation
        ),
        "pending_escalation": base["pending_escalation"],
        "activity_feed": _filter_activity_feed(raw_items, actor),
        "related_knowledge": list_related_articles_for_ticket_detail(
            db, actor, category_id=str(ticket_payload["category_id"])
        ),
        "report_templates": list_templates_for_ticket_detail(
            db,
            actor,
            ticket_category_id=str(ticket_payload["category_id"]),
        ),
        "reports": list_reports_for_ticket_detail(
            db,
            actor,
            ticket_id=int(ticket_payload["id"]),
        ),
        "alarm_ids": base["alarm_ids"],
        "context_markdown": base["context_markdown"],
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
    has_pending_escalation = base["pending_escalation"] is not None
    return {
        "ticket": ticket_payload,
        "available_actions": _available_actions(
            ticket_model, actor, has_pending_escalation=has_pending_escalation
        ),
        "pending_escalation": base["pending_escalation"],
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
        customer_user_id=type_cast(Optional[str], access.get("customer_user_id")),
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
        customer_user_id=type_cast(Optional[str], access.get("customer_user_id")),
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
        customer_user_id=type_cast(Optional[str], access.get("customer_user_id")),
        is_deleted=bool(access.get("is_deleted")),
    ):
        return None
    return _live_response_from_base(base, actor)


def get_ticket_alert_lookup(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    *,
    source_id: str | None = None,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")

    alarm_ids = _list_ticket_alarm_ids(db, ticket.id)
    if not alarm_ids:
        return {
            "ticket_id": ticket.id,
            "source_id": None,
            "source_name": None,
            "table_name": None,
            "match_field": None,
            "alarm_ids": [],
            "missing_alarm_ids": [],
            "total_rows": 0,
            "items": [],
        }

    try:
        source = _get_source_or_error(db, source_id) if source_id else get_preferred_enabled_alert_source(db)
    except AlertSourceOperationError as exc:
        raise TicketOperationError(exc.status_code, str(exc.detail)) from exc

    if source is None:
        raise TicketOperationError(422, "No enabled alert source configured")
    if source.status != "ENABLED":
        raise TicketOperationError(422, "Alert source must be enabled before querying")

    unique_alarm_ids: list[str] = []
    seen_alarm_ids: set[str] = set()
    for alarm_id in alarm_ids:
        if alarm_id in seen_alarm_ids:
            continue
        seen_alarm_ids.add(alarm_id)
        unique_alarm_ids.append(alarm_id)

    try:
        rows = _query_alert_rows(source, unique_alarm_ids)
    except Exception as exc:
        raise TicketOperationError(502, _describe_external_error(exc)) from exc

    grouped_rows: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        key = str(row.get(source.ticket_match_field))
        grouped_rows.setdefault(key, []).append(row)

    items: list[dict[str, object]] = []
    missing_alarm_ids: list[str] = []
    seen_missing: set[str] = set()
    for sort_order, alarm_id in enumerate(alarm_ids):
        matched_rows = grouped_rows.get(alarm_id, [])
        found = len(matched_rows) > 0
        if not found and alarm_id not in seen_missing:
            seen_missing.add(alarm_id)
            missing_alarm_ids.append(alarm_id)
        items.append(
            {
                "sort_order": sort_order,
                "alarm_id": alarm_id,
                "found": found,
                "row_count": len(matched_rows),
                "rows": matched_rows,
            }
        )

    return {
        "ticket_id": ticket.id,
        "source_id": source.id,
        "source_name": source.name,
        "table_name": source.table_name,
        "match_field": source.ticket_match_field,
        "alarm_ids": alarm_ids,
        "missing_alarm_ids": missing_alarm_ids,
        "total_rows": len(rows),
        "items": items,
    }


def get_ticket_context_entry(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")

    context_row = _get_ticket_context_row(db, ticket.id)
    return {
        "ticket_id": ticket.id,
        "content_markdown": context_row.content_markdown if context_row else None,
        "updated_at": context_row.updated_at if context_row else None,
    }


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
    alarm_ids: list[str] | None = None,
    context_markdown: str | None = None,
) -> dict[str, object]:
    if category_id not in CATEGORY_NAMES:
        raise TicketOperationError(422, "Unsupported ticket category")

    normalized_alarm_ids = _normalize_alarm_ids(alarm_ids)
    normalized_context_markdown = _normalize_context_markdown(context_markdown)
    normalized_priority = _normalize_priority_code(priority)
    response_window, resolution_window = _sla_windows(db, normalized_priority)
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
        priority=normalized_priority,
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
    _replace_ticket_alarm_relations(
        db,
        ticket_id=ticket.id,
        actor=actor,
        alarm_ids=normalized_alarm_ids,
    )
    _upsert_ticket_context(
        db,
        ticket_id=ticket.id,
        actor=actor,
        context_markdown=normalized_context_markdown,
    )

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
        clear_registered_immediate_dispatches(db)
        raise TicketOperationError(409, TICKET_VERSION_CONFLICT_MESSAGE) from exc

    try:
        dispatch_registered_immediate_events(db)
    except Exception:
        logger.exception("Failed to dispatch immediate Event bindings after ticket commit")


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
    alarm_ids: list[str] | None = None,
    context_markdown: str | None = None,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_actor_can_operate_ticket(actor, ticket)
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
        normalized_priority = _normalize_priority_code(priority)
        if ticket.priority != normalized_priority:
            response_window, resolution_window = _sla_windows(db, normalized_priority)
            ticket.priority = normalized_priority
            ticket.response_deadline_at = ticket.created_at + response_window
            ticket.resolution_deadline_at = ticket.created_at + resolution_window
            changed = True
    if risk_score is not None:
        ticket.risk_score = risk_score
        changed = True
    if alarm_ids is not None:
        normalized_alarm_ids = _normalize_alarm_ids(alarm_ids)
        if normalized_alarm_ids != _list_ticket_alarm_ids(db, ticket.id):
            _replace_ticket_alarm_relations(
                db,
                ticket_id=ticket.id,
                actor=actor,
                alarm_ids=normalized_alarm_ids,
            )
            changed = True
    if context_markdown is not None:
        normalized_context_markdown = _normalize_context_markdown(context_markdown)
        if normalized_context_markdown != _get_ticket_context_markdown(db, ticket.id):
            _upsert_ticket_context(
                db,
                ticket_id=ticket.id,
                actor=actor,
                context_markdown=normalized_context_markdown,
            )
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
    if actor.active_role != RoleCode.CUSTOMER.value and action in {
        "claim",
        "move_to_pool",
        "respond",
        "resolve",
        "close",
        "reopen",
    }:
        _assert_actor_can_operate_ticket(actor, ticket)
    _assert_ticket_version(ticket, expected_version)
    if action in {"claim", "move_to_pool"}:
        _assert_valid_ownership_state(ticket)
        _assert_no_pending_escalation(db, ticket.id)

    if action == "claim" and ticket.current_pool_code is None:
        raise TicketOperationError(409, "Ticket has already been claimed")
    if action == "claim" and (
        ticket.assigned_to_user_id is not None or ticket.assigned_to is not None
    ):
        raise TicketOperationError(409, "Ticket has already been claimed")

    if action not in _available_actions(
        ticket,
        actor,
        has_pending_escalation=_get_pending_escalation(db, ticket.id) is not None,
    ):
        raise TicketOperationError(
            403, f"Action `{action}` is not available for the current role or status"
        )

    now = utcnow()
    previous_status = ticket.main_status

    if action == "respond":
        if ticket.responded_at is None:
            ticket.responded_at = now
        if ticket.main_status == TicketMainStatus.WAITING_RESPONSE.value:
            ticket.main_status = TicketMainStatus.IN_PROGRESS.value
        ticket.sub_status = TicketSubStatus.NONE.value
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
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_STATUS_CHANGED)
        cancel_pending_ticket_events(
            db, ticket_id=ticket.id, names=[TICKET_EVENT_RESPONSE_TIMEOUT]
        )
    elif action == "resolve":
        _assert_internal_actor(actor)
        ticket.resolved_at = now
        ticket.main_status = TicketMainStatus.RESOLVED.value
        ticket.sub_status = TicketSubStatus.NONE.value
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
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_STATUS_CHANGED)
        cancel_pending_ticket_events(
            db, ticket_id=ticket.id, names=[TICKET_EVENT_RESOLUTION_TIMEOUT]
        )
    elif action == "close":
        _assert_internal_actor(actor)
        ticket.closed_at = now
        ticket.main_status = TicketMainStatus.CLOSED.value
        ticket.sub_status = TicketSubStatus.NONE.value
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
        ticket.main_status = TicketMainStatus.CLOSED.value
        ticket.sub_status = TicketSubStatus.REOPENED.value
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="reopened",
            content=note or "工单已重开。",
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
        if not _actor_can_claim_pool(actor, ticket.current_pool_code):
            raise TicketOperationError(403, "Current role cannot claim this pool")
        ticket.assigned_to = actor.display_name
        ticket.assigned_to_user_id = actor.user_id
        ticket.responsibility_level = _default_responsibility_level(actor)
        ticket.sub_status = TicketSubStatus.NONE.value
        ticket.updated_at = now
        _record_action(
            db,
            ticket_id=ticket.id,
            actor=actor,
            action_type="claimed",
            content=note or f"{actor.display_name} 已领取当前工单。",
            visibility="PUBLIC",
        )
        create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_ASSIGNED)
    elif action == "move_to_pool":
        _assert_internal_actor(actor)
        ticket.assigned_to = None
        ticket.assigned_to_user_id = None
        ticket.current_pool_code = ticket.current_pool_code or _level_to_pool_code(ticket.responsibility_level)
        ticket.sub_status = TicketSubStatus.NONE.value
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
            db, ticket_id=ticket.id, name=TICKET_EVENT_ESCALATED
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


def list_internal_ticket_users(db: Session, actor: ActorContext) -> list[dict[str, object]]:
    _assert_internal_actor(actor)
    return _list_active_internal_users(db)


def assign_ticket(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    *,
    expected_version: int,
    target_user_id: str,
    note: str | None = None,
) -> dict[str, object]:
    if actor.active_role != RoleCode.ADMIN.value:
        raise TicketOperationError(403, "Admin role required")

    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_ticket_version(ticket, expected_version)
    _assert_valid_ownership_state(ticket)
    _assert_no_pending_escalation(db, ticket.id)
    target_user, target_role_codes, highest_role = _get_active_internal_user(db, target_user_id)
    if not _role_codes_can_operate_pool(
        target_role_codes, _ticket_operation_pool_code(ticket)
    ):
        raise TicketOperationError(422, "Target user cannot operate on the current ticket pool")

    now = utcnow()
    ticket.assigned_to = target_user.display_name
    ticket.assigned_to_user_id = target_user.id
    ticket.responsibility_level = highest_role
    ticket.sub_status = TicketSubStatus.NONE.value
    ticket.updated_at = now
    _record_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="assigned",
        content=note or f"管理员已将工单直接分配给 {target_user.display_name}。",
        visibility="INTERNAL",
        context={"target_user_id": target_user.id},
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_ASSIGNED)
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(ticket, actor, change_type="assigned", occurred_at=now)

    if target_user.id != actor.user_id:
        deliver_notification(
            db,
            user_id=target_user.id,
            category="ticket_assigned",
            title=f"工单 #{ticket.id} 已分配给你",
            content=f"{actor.display_name} 已将工单「{ticket.title}」分配给你处理。",
            related_resource_type="ticket",
            related_resource_id=ticket.id,
        )

    return build_ticket_detail(db, actor, ticket)


def _assert_can_initiate_escalation(actor: ActorContext, ticket: Ticket) -> None:
    _assert_actor_can_operate_ticket(actor, ticket)
    _assert_valid_ownership_state(ticket)
    if ticket.assigned_to_user_id is None:
        if not ticket.current_pool_code or not _actor_can_claim_pool(actor, ticket.current_pool_code):
            raise TicketOperationError(403, "Current role cannot operate on this pool")
        return
    if ticket.assigned_to_user_id != actor.user_id:
        raise TicketOperationError(403, "Only the current assignee can escalate this ticket")


def escalate_ticket_to_pool(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    *,
    expected_version: int,
    note: str | None = None,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_ticket_version(ticket, expected_version)
    _assert_can_initiate_escalation(actor, ticket)
    _assert_no_pending_escalation(db, ticket.id)

    target_pool_code = _next_pool_code(ticket.current_pool_code, ticket.responsibility_level)
    if target_pool_code is None:
        raise TicketOperationError(422, "Escalation to pool is not supported from the current tier")

    now = utcnow()
    ticket.assigned_to = None
    ticket.assigned_to_user_id = None
    ticket.current_pool_code = target_pool_code
    ticket.responsibility_level = target_pool_code.removesuffix("_POOL")
    ticket.sub_status = TicketSubStatus.NONE.value
    ticket.updated_at = now
    _record_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="escalated",
        content=note or f"工单已升级到 {target_pool_code}。",
        visibility="INTERNAL",
        context={"target_pool_code": target_pool_code},
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_ESCALATED)
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(ticket, actor, change_type="assigned", occurred_at=now)
    return build_ticket_detail(db, actor, ticket)


def escalate_ticket_to_user(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    *,
    expected_version: int,
    target_user_id: str,
    note: str | None = None,
) -> dict[str, object]:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_ticket_version(ticket, expected_version)
    _assert_can_initiate_escalation(actor, ticket)
    _assert_no_pending_escalation(db, ticket.id)

    target_user, target_role_codes, highest_role = _get_active_internal_user(db, target_user_id)
    if not _role_codes_can_operate_pool(
        target_role_codes, _ticket_operation_pool_code(ticket)
    ):
        raise TicketOperationError(422, "Target user cannot operate on the current ticket pool")
    now = utcnow()
    escalation = TicketEscalation(
        ticket_id=ticket.id,
        source_level=ticket.responsibility_level,
        target_level=highest_role,
        target_user_id=target_user.id,
        target_pool_code=None,
        mode=TicketEscalationMode.TO_USER.value,
        status=TicketEscalationStatus.PENDING_CONFIRM.value,
        requested_by=actor.user_id,
        requested_by_name=actor.display_name,
        requested_at=now,
        source_pool_code=ticket.current_pool_code,
        source_assigned_to=ticket.assigned_to,
        source_assigned_to_user_id=ticket.assigned_to_user_id,
        source_sub_status=ticket.sub_status,
    )
    db.add(escalation)
    ticket.sub_status = TicketSubStatus.ESCALATION_PENDING_CONFIRM.value
    ticket.updated_at = now
    _record_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="escalation_requested",
        content=note or f"已向 {target_user.display_name} 发起定向升级请求。",
        visibility="INTERNAL",
        context={"target_user_id": target_user.id},
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_ESCALATION_REQUESTED)
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    db.refresh(escalation)
    _publish_ticket_change(ticket, actor, change_type="assigned", occurred_at=now)

    deliver_notification(
        db,
        user_id=target_user.id,
        category="ticket_escalation_request",
        title=f"工单 #{ticket.id} 等待你确认升级",
        content=f"{actor.display_name} 希望将工单「{ticket.title}」升级给你处理。",
        related_resource_type="ticket_escalation",
        related_resource_id=escalation.id,
        action_required=True,
        action_type="ticket_escalation",
        action_status="pending",
        action_payload={
            "escalation_id": escalation.id,
            "ticket_id": ticket.id,
            "ticket_title": ticket.title,
            "requester_name": actor.display_name,
            "source_pool_code": escalation.source_pool_code,
            "source_assigned_to": escalation.source_assigned_to,
        },
    )

    return build_ticket_detail(db, actor, ticket)


def accept_ticket_escalation(
    db: Session,
    actor: ActorContext,
    escalation_id: str,
) -> dict[str, object]:
    escalation = db.get(TicketEscalation, escalation_id)
    if escalation is None:
        raise TicketOperationError(404, "Escalation request not found")
    if escalation.status != TicketEscalationStatus.PENDING_CONFIRM.value:
        raise TicketOperationError(409, "Escalation request has already been processed")
    if escalation.target_user_id != actor.user_id:
        raise TicketOperationError(403, "Only the target user can process this escalation request")

    ticket = get_ticket(db, actor, escalation.ticket_id)
    if ticket is None:
        ticket = _get_ticket_by_id(db, escalation.ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")
    _assert_actor_can_operate_ticket(actor, ticket)

    now = utcnow()
    ticket.assigned_to = actor.display_name
    ticket.assigned_to_user_id = actor.user_id
    ticket.current_pool_code = escalation.source_pool_code or ticket.current_pool_code
    ticket.responsibility_level = escalation.target_level
    ticket.sub_status = TicketSubStatus.ESCALATION_CONFIRMED.value
    ticket.updated_at = now
    escalation.status = TicketEscalationStatus.ACCEPTED.value
    escalation.confirmed_by = actor.user_id
    escalation.confirmed_at = now
    _record_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="escalation_accepted",
        content=f"{actor.display_name} 已接受升级请求并接手工单。",
        visibility="INTERNAL",
        context={"escalation_id": escalation.id},
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_ESCALATION_ACCEPTED)
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(ticket, actor, change_type="assigned", occurred_at=now)
    resolve_notification_action(
        db,
        user_id=actor.user_id,
        related_resource_type="ticket_escalation",
        related_resource_id=escalation.id,
    )

    if escalation.requested_by != actor.user_id:
        deliver_notification(
            db,
            user_id=escalation.requested_by,
            category="ticket_escalation_accepted",
            title=f"工单 #{ticket.id} 升级已被接受",
            content=f"{actor.display_name} 已接受工单「{ticket.title}」的升级请求。",
            related_resource_type="ticket",
            related_resource_id=ticket.id,
        )

    return build_ticket_detail(db, actor, ticket)


def reject_ticket_escalation(
    db: Session,
    actor: ActorContext,
    escalation_id: str,
    *,
    reason: str | None = None,
) -> dict[str, object]:
    escalation = db.get(TicketEscalation, escalation_id)
    if escalation is None:
        raise TicketOperationError(404, "Escalation request not found")
    if escalation.status != TicketEscalationStatus.PENDING_CONFIRM.value:
        raise TicketOperationError(409, "Escalation request has already been processed")
    if escalation.target_user_id != actor.user_id:
        raise TicketOperationError(403, "Only the target user can process this escalation request")

    ticket = get_ticket(db, actor, escalation.ticket_id)
    if ticket is None:
        ticket = _get_ticket_by_id(db, escalation.ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")

    now = utcnow()
    ticket.assigned_to = escalation.source_assigned_to
    ticket.assigned_to_user_id = escalation.source_assigned_to_user_id
    ticket.current_pool_code = escalation.source_pool_code
    ticket.responsibility_level = escalation.source_level
    ticket.sub_status = TicketSubStatus.ESCALATION_REJECTED.value
    ticket.updated_at = now
    escalation.status = TicketEscalationStatus.REJECTED.value
    escalation.rejected_by = actor.user_id
    escalation.rejected_at = now
    escalation.reject_reason = reason
    _record_action(
        db,
        ticket_id=ticket.id,
        actor=actor,
        action_type="escalation_rejected",
        content=reason or f"{actor.display_name} 已拒绝升级请求，工单恢复原归属。",
        visibility="INTERNAL",
        context={"escalation_id": escalation.id},
    )
    create_ticket_event(db, ticket_id=ticket.id, name=TICKET_EVENT_ESCALATION_REJECTED)
    _commit_ticket_changes(db)
    _invalidate_ticket_cache(ticket.id)
    db.refresh(ticket)
    _publish_ticket_change(ticket, actor, change_type="assigned", occurred_at=now)
    resolve_notification_action(
        db,
        user_id=actor.user_id,
        related_resource_type="ticket_escalation",
        related_resource_id=escalation.id,
    )

    if escalation.requested_by != actor.user_id:
        deliver_notification(
            db,
            user_id=escalation.requested_by,
            category="ticket_escalation_rejected",
            title=f"工单 #{ticket.id} 升级已被拒绝",
            content=f"{actor.display_name} 已拒绝工单「{ticket.title}」的升级请求。",
            related_resource_type="ticket",
            related_resource_id=ticket.id,
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
