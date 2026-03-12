from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NotificationResourceResponse(BaseModel):
    resource_type: str | None = None
    resource_id: str | None = None


class NotificationSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    category: str
    title: str
    content: str
    related_resource_type: str | None
    related_resource_id: str | None
    status: str
    created_at: datetime
    delivered_at: datetime | None
    read_at: datetime | None
    expire_at: datetime | None


class NotificationListResponse(BaseModel):
    items: list[NotificationSummaryResponse]
    total_count: int
    unread_count: int


class NotificationMutationResponse(BaseModel):
    notification: NotificationSummaryResponse
    unread_count: int


class NotificationCreateRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=36)
    category: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=4000)
    related_resource_type: str | None = Field(default=None, max_length=64)
    related_resource_id: str | int | None = None
    expire_at: datetime | None = None

