from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ...database import Base
from .enums import NotificationStatus


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    related_resource_type: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    related_resource_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), default=NotificationStatus.PENDING.value, nullable=False
    )
    action_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    action_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    action_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    action_payload: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    delivered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expire_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
