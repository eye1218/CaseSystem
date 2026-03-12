from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from .enums import EventType


class EventBindingCreateRequest(BaseModel):
    task_template_id: str = Field(min_length=1, max_length=128)
    payload: dict[str, object] = Field(default_factory=dict)


class EventCreateRequest(BaseModel):
    event_type: EventType
    trigger_time: datetime | None = None
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    payload: dict[str, object] = Field(default_factory=dict)


class EventRescheduleRequest(BaseModel):
    trigger_time: datetime


class EventBindingResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    task_template_id: str
    payload: dict[str, object]
    created_at: datetime


class EventSummaryResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    status: str
    trigger_time: datetime | None
    title: str | None
    description: str | None
    payload: dict[str, object]
    created_by_user_id: str | None
    triggered_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EventDetailResponse(BaseModel):
    event: EventSummaryResponse
    bindings: list[EventBindingResponse]


class EventListResponse(BaseModel):
    items: list[EventSummaryResponse]
    total_count: int
