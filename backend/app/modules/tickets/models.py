from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column

from ...database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Ticket(TimestampMixin, Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[str] = mapped_column(String(64), nullable=False)
    category_name: Mapped[str] = mapped_column(String(128), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    main_status: Mapped[str] = mapped_column(String(32), nullable=False)
    sub_status: Mapped[str] = mapped_column(String(64), nullable=False, default="NONE")
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    customer_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    assigned_to_user_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    current_pool_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    responsibility_level: Mapped[str] = mapped_column(String(16), nullable=False)
    response_deadline_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolution_deadline_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    response_timeout_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolution_timeout_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    __mapper_args__ = {"version_id_col": version}


class TicketComment(TimestampMixin, Base):
    __tablename__ = "ticket_comments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(128), nullable=False)
    actor_role: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    visibility: Mapped[str] = mapped_column(
        String(16), default="PUBLIC", nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class TicketAction(Base):
    __tablename__ = "ticket_actions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(128), nullable=False)
    actor_role: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    visibility: Mapped[str] = mapped_column(
        String(16), default="PUBLIC", nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    context: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TicketEscalation(Base):
    __tablename__ = "ticket_escalations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    source_level: Mapped[str] = mapped_column(String(16), nullable=False)
    target_level: Mapped[str] = mapped_column(String(16), nullable=False)
    target_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    target_pool_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    requested_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    requested_by_name: Mapped[str] = mapped_column(String(128), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    source_pool_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    source_assigned_to: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    source_assigned_to_user_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    source_sub_status: Mapped[str] = mapped_column(String(64), nullable=False, default="NONE")
    confirmed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejected_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class TicketAlarmRelation(Base):
    __tablename__ = "ticket_alarm_relation"
    __table_args__ = (
        UniqueConstraint("ticket_id", "sort_order", name="uq_ticket_alarm_relation_order"),
        Index("idx_ticket_alarm_relation_ticket_alarm", "ticket_id", "alarm_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    alarm_id: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class TicketContext(Base):
    __tablename__ = "ticket_context"

    ticket_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tickets.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    content_markdown: Mapped[str] = mapped_column(
        Text().with_variant(LONGTEXT(), "mysql"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
