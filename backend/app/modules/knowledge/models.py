from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ...database import Base
from ...models import TimestampMixin


class KnowledgeArticle(TimestampMixin, Base):
    __tablename__ = "knowledge_articles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[str] = mapped_column(String(64), nullable=False)
    content_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_by_name: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_by_user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    updated_by_name: Mapped[str] = mapped_column(String(128), nullable=False)


class KnowledgeArticleLike(Base):
    __tablename__ = "knowledge_article_likes"
    __table_args__ = (
        UniqueConstraint("article_id", "user_id", name="uq_knowledge_article_like"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    article_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("knowledge_articles.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
