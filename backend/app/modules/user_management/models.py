from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ...database import Base
from ...models import TimestampMixin


class UserGroup(TimestampMixin, Base):
    __tablename__ = "user_groups"
    __table_args__ = (UniqueConstraint("name", name="uq_user_groups_name"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)


class UserGroupMember(Base):
    __tablename__ = "user_group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_user_group_member"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user_groups.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserAdminAuditLog(Base):
    __tablename__ = "user_admin_audit_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    before_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    after_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    meta_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

