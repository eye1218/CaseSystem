from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditTicketItem(BaseModel):
    ticket_id: int
    title: str
    main_status: str
    sub_status: str
    priority: str
    risk_score: int
    assigned_to: str | None
    assigned_to_user_id: str | None
    created_at: datetime
    updated_at: datetime
    log_count: int
    last_event_at: datetime | None
    last_actor_name: str | None
    last_actor_role: str | None
    last_action_type: str | None


class AuditTicketListResponse(BaseModel):
    items: list[AuditTicketItem]
    total_count: int
    filtered_count: int
    has_more: bool
    next_offset: int | None


class AuditTicketSummary(BaseModel):
    id: int
    title: str
    main_status: str
    sub_status: str
    priority: str
    risk_score: int
    assigned_to: str | None
    assigned_to_user_id: str | None
    created_at: datetime
    updated_at: datetime


class AuditLogItem(BaseModel):
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


class AuditLogListResponse(BaseModel):
    ticket: AuditTicketSummary
    items: list[AuditLogItem]
    total_count: int
    filtered_count: int
    has_more: bool
    next_offset: int | None
