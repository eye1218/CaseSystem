from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, String, Text, UniqueConstraint, func
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


class Template(TimestampMixin, Base):
    __tablename__ = "templates"
    __table_args__ = (UniqueConstraint("code", name="uq_templates_code"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    template_type: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    field_values: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
