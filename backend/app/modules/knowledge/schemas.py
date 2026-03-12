from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class KnowledgePermissionsResponse(BaseModel):
    can_edit: bool
    can_delete: bool
    can_pin: bool


class KnowledgeArticleSummaryResponse(BaseModel):
    id: str
    title: str
    category_id: str
    category_name: str
    excerpt: str
    author_name: str
    updated_at: datetime
    likes_count: int
    is_pinned: bool


class KnowledgeArticleDetailResponse(KnowledgeArticleSummaryResponse):
    content_markdown: str
    viewer_has_liked: bool
    permissions: KnowledgePermissionsResponse


class KnowledgeArticleListResponse(BaseModel):
    items: list[KnowledgeArticleSummaryResponse]
    total_count: int


class KnowledgeArticleCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    category_id: str = Field(min_length=1, max_length=64)
    content_markdown: str = Field(min_length=1)


class KnowledgeArticleUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: str | None = Field(default=None, min_length=1, max_length=64)
    content_markdown: str | None = Field(default=None, min_length=1)
