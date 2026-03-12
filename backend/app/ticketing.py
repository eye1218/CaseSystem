from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from app.auth import ActorContext
from app.enums import RoleCode, TicketMainStatus, TicketPriority, TicketSubStatus
from app.knowledge import list_related_articles_for_ticket_detail
from app.models import Ticket, TicketAction, TicketComment
from app.reporting import list_reports_for_ticket_detail, list_templates_for_ticket_detail
from app.security import utcnow
from app.ticket_categories import TICKET_CATEGORY_NAMES
from app.ticket_detail_assets import ALERT_LIBRARY, CONTEXT_LIBRARY


class TicketOperationError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


CATEGORY_NAMES = TICKET_CATEGORY_NAMES

POOL_CODES = {"T1_POOL", "T2_POOL", "T3_POOL"}

TICKET_SEED_DATA = [
    {
        "id": 100182,
        "title": "横向移动预警：域账号异常访问多台办公终端",
        "description": "SIEM 捕获到同一域账号在 12 分钟内访问多台办公终端并伴随横向认证尝试，已完成初判，等待升级确认。",
        "category_id": "intrusion",
        "category_name": "入侵检测",
        "source": "SIEM",
        "priority": TicketPriority.P1.value,
        "risk_score": 92,
        "main_status": TicketMainStatus.IN_PROGRESS.value,
        "sub_status": TicketSubStatus.ESCALATION_PENDING_CONFIRM.value,
        "created_by": "系统规则",
        "created_by_user_id": "user-admin",
        "customer_user_id": None,
        "assigned_to": "Admin",
        "assigned_to_user_id": "user-admin",
        "current_pool_code": None,
        "responsibility_level": "T2",
        "response_deadline_at": utcnow() + timedelta(hours=1),
        "resolution_deadline_at": utcnow() + timedelta(hours=4),
        "responded_at": utcnow() - timedelta(minutes=30),
        "response_timeout_at": None,
        "resolved_at": None,
        "resolution_timeout_at": None,
        "closed_at": None,
        "created_at": utcnow() - timedelta(hours=2),
        "updated_at": utcnow() - timedelta(minutes=12),
    },
    {
        "id": 100181,
        "title": "客户反馈：补充邮件钓鱼处置报告结论",
        "description": "客户要求在关闭前补充影响范围与修复建议，当前已处置完成，等待最终关闭。",
        "category_id": "phishing",
        "category_name": "网络钓鱼",
        "source": "CUSTOMER",
        "priority": TicketPriority.P2.value,
        "risk_score": 63,
        "main_status": TicketMainStatus.RESOLVED.value,
        "sub_status": TicketSubStatus.NONE.value,
        "created_by": "Customer",
        "created_by_user_id": "user-customer",
        "customer_user_id": "user-customer",
        "assigned_to": "Admin",
        "assigned_to_user_id": "user-admin",
        "current_pool_code": None,
        "responsibility_level": "T2",
        "response_deadline_at": utcnow() - timedelta(days=1, hours=4),
        "resolution_deadline_at": utcnow() - timedelta(hours=6),
        "responded_at": utcnow() - timedelta(days=1, hours=5),
        "response_timeout_at": None,
        "resolved_at": utcnow() - timedelta(hours=2),
        "resolution_timeout_at": None,
        "closed_at": None,
        "created_at": utcnow() - timedelta(days=1, hours=8),
        "updated_at": utcnow() - timedelta(hours=2),
    },
    {
        "id": 100177,
        "title": "夜班值守：终端恶意软件待 T2 池领取",
        "description": "EDR 在夜班期间连续上报可疑落地动作，当前工单已进入 T2_POOL，等待内部人员领取。",
        "category_id": "endpoint",
        "category_name": "终端安全",
        "source": "EDR",
        "priority": TicketPriority.P2.value,
        "risk_score": 74,
        "main_status": TicketMainStatus.WAITING_RESPONSE.value,
        "sub_status": TicketSubStatus.NONE.value,
        "created_by": "系统规则",
        "created_by_user_id": "user-analyst",
        "customer_user_id": None,
        "assigned_to": None,
        "assigned_to_user_id": None,
        "current_pool_code": "T2_POOL",
        "responsibility_level": "T2",
        "response_deadline_at": utcnow() + timedelta(minutes=38),
        "resolution_deadline_at": utcnow() + timedelta(hours=7),
        "responded_at": None,
        "response_timeout_at": None,
        "resolved_at": None,
        "resolution_timeout_at": None,
        "closed_at": None,
        "created_at": utcnow() - timedelta(minutes=40),
        "updated_at": utcnow() - timedelta(minutes=22),
    },
    {
        "id": 100169,
        "title": "主机异常登录：响应 SLA 已超时",
        "description": "检测到堡垒机来源的异常登录爆发，当前尚未补响应，主状态保持 RESPONSE_TIMEOUT。",
        "category_id": "intrusion",
        "category_name": "入侵检测",
        "source": "SIEM",
        "priority": TicketPriority.P1.value,
        "risk_score": 87,
        "main_status": TicketMainStatus.RESPONSE_TIMEOUT.value,
        "sub_status": TicketSubStatus.NONE.value,
        "created_by": "系统规则",
        "created_by_user_id": "user-admin",
        "customer_user_id": None,
        "assigned_to": "Analyst",
        "assigned_to_user_id": "user-analyst",
        "current_pool_code": None,
        "responsibility_level": "T1",
        "response_deadline_at": utcnow() - timedelta(hours=3),
        "resolution_deadline_at": utcnow() + timedelta(hours=2),
        "responded_at": None,
        "response_timeout_at": utcnow() - timedelta(hours=2),
        "resolved_at": None,
        "resolution_timeout_at": None,
        "closed_at": None,
        "created_at": utcnow() - timedelta(hours=5),
        "updated_at": utcnow() - timedelta(hours=1, minutes=20),
    },
    {
        "id": 100161,
        "title": "客户系统故障排查单",
        "description": "客户侧应用访问异常已恢复，当前仅保留关闭态记录供后续复盘和 Reopen 使用。",
        "category_id": "network",
        "category_name": "网络攻击",
        "source": "CUSTOMER",
        "priority": TicketPriority.P3.value,
        "risk_score": 41,
        "main_status": TicketMainStatus.CLOSED.value,
        "sub_status": TicketSubStatus.NONE.value,
        "created_by": "Customer",
        "created_by_user_id": "user-customer",
        "customer_user_id": "user-customer",
        "assigned_to": "Admin",
        "assigned_to_user_id": "user-admin",
        "current_pool_code": None,
        "responsibility_level": "T2",
        "response_deadline_at": utcnow() - timedelta(days=3),
        "resolution_deadline_at": utcnow() - timedelta(days=2, hours=18),
        "responded_at": utcnow() - timedelta(days=3, hours=1),
        "response_timeout_at": None,
        "resolved_at": utcnow() - timedelta(days=2, hours=20),
        "resolution_timeout_at": None,
        "closed_at": utcnow() - timedelta(days=2, hours=18),
        "created_at": utcnow() - timedelta(days=4),
        "updated_at": utcnow() - timedelta(days=2, hours=18),
    },
]

TICKET_ACTION_SEED_DATA = [
    {
        "id": "action-100182-created",
        "ticket_id": 100182,
        "action_type": "created",
        "actor_name": "System",
        "actor_role": None,
        "visibility": "PUBLIC",
        "content": "SIEM 规则命中后自动创建工单并推送给值班队列。",
        "from_status": None,
        "to_status": TicketMainStatus.WAITING_RESPONSE.value,
        "context": {},
        "created_at": utcnow() - timedelta(hours=2),
    },
    {
        "id": "action-100182-assigned",
        "ticket_id": 100182,
        "action_type": "assigned",
        "actor_user_id": "user-admin",
        "actor_name": "Admin",
        "actor_role": RoleCode.ADMIN.value,
        "visibility": "INTERNAL",
        "content": "工单升级至 T2 并分配给当前负责人处理。",
        "from_status": None,
        "to_status": None,
        "context": {"assignee": "Admin"},
        "created_at": utcnow() - timedelta(hours=1, minutes=40),
    },
    {
        "id": "action-100177-created",
        "ticket_id": 100177,
        "action_type": "created",
        "actor_name": "System",
        "actor_role": None,
        "visibility": "PUBLIC",
        "content": "夜班值守期间由 EDR 自动创建工单。",
        "from_status": None,
        "to_status": TicketMainStatus.WAITING_RESPONSE.value,
        "context": {},
        "created_at": utcnow() - timedelta(minutes=40),
    },
    {
        "id": "action-100177-pooled",
        "ticket_id": 100177,
        "action_type": "moved_to_pool",
        "actor_name": "Duty Manager",
        "actor_role": RoleCode.T2.value,
        "visibility": "PUBLIC",
        "content": "夜班负责人将工单投入 T2 池等待白班同事领取。",
        "from_status": None,
        "to_status": None,
        "context": {"pool": "T2_POOL"},
        "created_at": utcnow() - timedelta(minutes=28),
    },
    {
        "id": "action-100169-created",
        "ticket_id": 100169,
        "action_type": "created",
        "actor_name": "System",
        "actor_role": None,
        "visibility": "PUBLIC",
        "content": "堡垒机异常登录行为触发工单创建。",
        "from_status": None,
        "to_status": TicketMainStatus.WAITING_RESPONSE.value,
        "context": {},
        "created_at": utcnow() - timedelta(hours=5),
    },
    {
        "id": "action-100169-timeout",
        "ticket_id": 100169,
        "action_type": "status_change",
        "actor_name": "System",
        "actor_role": None,
        "visibility": "PUBLIC",
        "content": "响应 SLA 超时，主状态切换为 RESPONSE_TIMEOUT。",
        "from_status": TicketMainStatus.WAITING_RESPONSE.value,
        "to_status": TicketMainStatus.RESPONSE_TIMEOUT.value,
        "context": {},
        "created_at": utcnow() - timedelta(hours=2),
    },
    {
        "id": "action-100181-created",
        "ticket_id": 100181,
        "action_type": "created",
        "actor_name": "Customer",
        "actor_role": RoleCode.CUSTOMER.value,
        "visibility": "PUBLIC",
        "content": "客户提交补充报告请求。",
        "from_status": None,
        "to_status": TicketMainStatus.WAITING_RESPONSE.value,
        "context": {},
        "created_at": utcnow() - timedelta(days=1, hours=8),
    },
    {
        "id": "action-100181-resolved",
        "ticket_id": 100181,
        "action_type": "resolved",
        "actor_name": "Admin",
        "actor_role": RoleCode.ADMIN.value,
        "visibility": "PUBLIC",
        "content": "已完成报告补充并更新处置结论。",
        "from_status": TicketMainStatus.IN_PROGRESS.value,
        "to_status": TicketMainStatus.RESOLVED.value,
        "context": {},
        "created_at": utcnow() - timedelta(hours=2),
    },
    {
        "id": "action-100161-created",
        "ticket_id": 100161,
        "action_type": "created",
        "actor_name": "Customer",
        "actor_role": RoleCode.CUSTOMER.value,
        "visibility": "PUBLIC",
        "content": "客户发起网络故障排查工单。",
        "from_status": None,
        "to_status": TicketMainStatus.WAITING_RESPONSE.value,
        "context": {},
        "created_at": utcnow() - timedelta(days=4),
    },
    {
        "id": "action-100161-closed",
        "ticket_id": 100161,
        "action_type": "closed",
        "actor_name": "Admin",
        "actor_role": RoleCode.ADMIN.value,
        "visibility": "PUBLIC",
        "content": "故障恢复确认后关闭工单。",
        "from_status": TicketMainStatus.RESOLVED.value,
        "to_status": TicketMainStatus.CLOSED.value,
        "context": {},
        "created_at": utcnow() - timedelta(days=2, hours=18),
    },
]

TICKET_COMMENT_SEED_DATA = [
    {
        "id": "comment-100182-1",
        "ticket_id": 100182,
        "actor_user_id": "user-admin",
        "actor_name": "Admin",
        "actor_role": RoleCode.ADMIN.value,
        "visibility": "INTERNAL",
        "content": "已确认横向认证痕迹，正在等待升级对象确认接手。",
        "is_system": False,
        "created_at": utcnow() - timedelta(hours=1, minutes=12),
        "updated_at": utcnow() - timedelta(hours=1, minutes=12),
    },
    {
        "id": "comment-100177-1",
        "ticket_id": 100177,
        "actor_user_id": "user-analyst",
        "actor_name": "Analyst",
        "actor_role": RoleCode.T1.value,
        "visibility": "PUBLIC",
        "content": "夜班已经完成基础证据保全，白班同事可直接继续排查落地样本。",
        "is_system": False,
        "created_at": utcnow() - timedelta(minutes=18),
        "updated_at": utcnow() - timedelta(minutes=18),
    },
    {
        "id": "comment-100181-1",
        "ticket_id": 100181,
        "actor_user_id": "user-customer",
        "actor_name": "Customer",
        "actor_role": RoleCode.CUSTOMER.value,
        "visibility": "PUBLIC",
        "content": "请在最终报告中补充业务影响范围和建议动作。",
        "is_system": False,
        "created_at": utcnow() - timedelta(hours=3),
        "updated_at": utcnow() - timedelta(hours=3),
    },
]


def seed_tickets(db: Session) -> None:
    existing_ids = set(db.scalars(select(Ticket.id)).all())
    for payload in TICKET_SEED_DATA:
        if payload["id"] in existing_ids:
            continue
        db.add(Ticket(**payload))
    db.commit()
    seed_ticket_supporting_records(db)


def seed_ticket_supporting_records(db: Session) -> None:
    existing_action_ids = set(db.scalars(select(TicketAction.id)).all())
    for payload in TICKET_ACTION_SEED_DATA:
        if payload["id"] in existing_action_ids:
            continue
        db.add(TicketAction(**payload))

    existing_comment_ids = set(db.scalars(select(TicketComment.id)).all())
    for payload in TICKET_COMMENT_SEED_DATA:
        if payload["id"] in existing_comment_ids:
            continue
        db.add(TicketComment(**payload))

    db.commit()


def _base_conditions(actor: ActorContext) -> list:
    conditions = [Ticket.is_deleted.is_(False)]
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
    created_from=None,
    created_to=None,
    sort_by: str = "id",
    sort_dir: str = "desc",
) -> tuple[list[Ticket], int]:
    conditions = _base_conditions(actor)
    total_count = db.scalar(select(func.count()).select_from(Ticket).where(*conditions)) or 0

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


def _resolve_assignment(actor: ActorContext, assignment_mode: str, pool_code: str | None) -> tuple[str | None, str | None, str]:
    responsibility_level = _default_responsibility_level(actor)

    if actor.active_role == RoleCode.CUSTOMER.value:
        return None, None, responsibility_level

    if assignment_mode == "self":
        return actor.display_name, None, responsibility_level

    if assignment_mode == "pool":
        if pool_code not in POOL_CODES:
            raise TicketOperationError(422, "A valid pool code is required when assignment_mode is `pool`")
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

    if ticket.main_status in {TicketMainStatus.WAITING_RESPONSE.value, TicketMainStatus.RESPONSE_TIMEOUT.value}:
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


def _permission_scope(actor: ActorContext) -> dict:
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


def _raw_alerts(ticket: Ticket) -> list[dict]:
    return ALERT_LIBRARY.get(ticket.source, [])


def _external_context(ticket: Ticket) -> dict:
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
    return CONTEXT_LIBRARY.get(ticket.category_id, CONTEXT_LIBRARY["network"])["markdown"]


def _activity_feed(db: Session, actor: ActorContext, ticket_id: int) -> list[dict]:
    actions = [
        row
        for row in db.scalars(select(TicketAction).where(TicketAction.ticket_id == ticket_id).order_by(TicketAction.created_at)).all()
        if _visibility_condition(actor, row.visibility)
    ]
    comments = [
        row
        for row in db.scalars(select(TicketComment).where(TicketComment.ticket_id == ticket_id).order_by(TicketComment.created_at)).all()
        if _visibility_condition(actor, row.visibility)
    ]

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
            "created_at": action.created_at,
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
            "created_at": comment.created_at,
            "is_system": comment.is_system,
        }
        for comment in comments
    )
    return sorted(items, key=lambda item: item["created_at"])


def build_ticket_detail(db: Session, actor: ActorContext, ticket: Ticket) -> dict:
    return {
        "ticket": ticket,
        "available_actions": _available_actions(ticket, actor),
        "activity_feed": _activity_feed(db, actor, ticket.id),
        "related_knowledge": list_related_articles_for_ticket_detail(db, actor, category_id=ticket.category_id),
        "report_templates": list_templates_for_ticket_detail(
            db, actor, ticket_category_id=ticket.category_id
        ),
        "reports": list_reports_for_ticket_detail(db, actor, ticket_id=ticket.id),
        "raw_alerts": _raw_alerts(ticket),
        "siem_context_markdown": _context_markdown(ticket),
        "external_context": _external_context(ticket),
        "responsibility_summary": _responsibility_summary(ticket),
        "permission_scope": _permission_scope(actor),
    }


def get_ticket_detail(db: Session, actor: ActorContext, ticket_id: int) -> dict | None:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        return None
    return build_ticket_detail(db, actor, ticket)


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
) -> dict:
    if category_id not in CATEGORY_NAMES:
        raise TicketOperationError(422, "Unsupported ticket category")

    response_window, resolution_window = _sla_windows(priority)
    assigned_to, current_pool_code, responsibility_level = _resolve_assignment(actor, assignment_mode, pool_code)
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
        customer_user_id=actor.user_id if actor.active_role == RoleCode.CUSTOMER.value else None,
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
    db.commit()
    db.refresh(ticket)
    return build_ticket_detail(db, actor, ticket)


def _assert_internal_actor(actor: ActorContext) -> None:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise TicketOperationError(403, "Current role cannot perform this action")


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
            visibility=visibility,
            content=content,
            from_status=from_status,
            to_status=to_status,
            context=context or {},
            created_at=utcnow(),
        )
    )


def add_ticket_comment(db: Session, actor: ActorContext, ticket_id: int, content: str, visibility: str) -> dict:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")

    normalized_visibility = "PUBLIC" if actor.active_role == RoleCode.CUSTOMER.value else visibility
    db.add(
        TicketComment(
            ticket_id=ticket.id,
            actor_user_id=actor.user_id,
            actor_name=actor.display_name,
            actor_role=actor.active_role,
            visibility=normalized_visibility,
            content=content,
            is_system=False,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )
    db.commit()
    db.refresh(ticket)
    return build_ticket_detail(db, actor, ticket)


def update_ticket_detail(
    db: Session,
    actor: ActorContext,
    ticket_id: int,
    *,
    title: str | None = None,
    description: str | None = None,
    category_id: str | None = None,
    priority: str | None = None,
    risk_score: int | None = None,
) -> dict:
    _assert_internal_actor(actor)
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")

    changed = False
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
        ticket.updated_at = utcnow()
        _record_action(db, ticket_id=ticket.id, actor=actor, action_type="updated", content="更新了工单基础信息。")
        db.commit()

    return build_ticket_detail(db, actor, ticket)


def execute_ticket_action(db: Session, actor: ActorContext, ticket_id: int, action: str, note: str | None = None) -> dict:
    ticket = get_ticket(db, actor, ticket_id)
    if ticket is None:
        raise TicketOperationError(404, "Ticket not found")

    if action not in _available_actions(ticket, actor):
        raise TicketOperationError(403, f"Action `{action}` is not available for the current role or status")

    now = utcnow()
    previous_status = ticket.main_status

    if action == "respond":
        if ticket.responded_at is None:
            ticket.responded_at = now
        if ticket.main_status in {TicketMainStatus.WAITING_RESPONSE.value, TicketMainStatus.REOPENED.value}:
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
    else:
        raise TicketOperationError(400, f"Unsupported action `{action}`")

    db.commit()
    return build_ticket_detail(db, actor, ticket)
