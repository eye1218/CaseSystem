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


class AlertSourceConfig(TimestampMixin, Base):
    __tablename__ = "alert_source_configs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password: Mapped[str] = mapped_column(Text, nullable=False)
    database_name: Mapped[str] = mapped_column(String(128), nullable=False)
    table_name: Mapped[str] = mapped_column(String(128), nullable=False)
    ticket_match_field: Mapped[str] = mapped_column(String(128), nullable=False, default="alert_id")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ENABLED")
    latest_test_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    latest_test_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    latest_test_error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_by_name: Mapped[str] = mapped_column(String(128), nullable=False)


class AlertSourceAuditLog(Base):
    __tablename__ = "alert_source_audit_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    source_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("alert_source_configs.id", ondelete="SET NULL"), nullable=True
    )
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    actor_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

