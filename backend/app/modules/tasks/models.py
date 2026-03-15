from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
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


class TaskTemplate(TimestampMixin, Base):
    __tablename__ = "task_templates"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    task_type: Mapped[str] = mapped_column(String(16), nullable=False)
    reference_template_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("templates.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    recipient_config: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    target_config: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_by_name: Mapped[str] = mapped_column(String(128), nullable=False)


class TaskInstance(TimestampMixin, Base):
    __tablename__ = "task_instances"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    task_template_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("task_templates.id"), nullable=True
    )
    source_event_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("events.id"), nullable=True
    )
    source_binding_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("event_bindings.id"), nullable=True
    )
    ticket_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tickets.id"), nullable=True
    )
    task_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    template_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    latest_result: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_of_task_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("task_instances.id"), nullable=True
    )
    operator_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    operator_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskExecutionLog(Base):
    __tablename__ = "task_execution_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    task_instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("task_instances.id", ondelete="CASCADE"), nullable=False
    )
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    actor_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    input_summary: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    rendered_summary: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    response_summary: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
