from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field


class EventRuleFilterRequest(BaseModel):
    field: str | None = None
    operator: str | None = None
    values: list[str] = Field(default_factory=list)
    min_value: int | None = None
    max_value: int | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    relative_time: dict[str, Any] | None = None


class EventRuleTimeRuleRequest(BaseModel):
    mode: str | None = None
    delay_amount: int | None = None
    delay_unit: str | None = None
    target_offset_amount: int | None = None
    target_offset_unit: str | None = None
    adjustment_direction: str | None = None
    adjustment_amount: int | None = None
    adjustment_unit: str | None = None


class EventRuleCreateRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    event_type: str | None = None
    status: str | None = None
    trigger_point: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    filters: list[EventRuleFilterRequest] = Field(default_factory=list)
    time_rule: EventRuleTimeRuleRequest = Field(default_factory=EventRuleTimeRuleRequest)
    task_template_ids: list[str] = Field(default_factory=list)


class EventRuleUpdateRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    event_type: str | None = None
    status: str | None = None
    trigger_point: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    filters: list[EventRuleFilterRequest] | None = None
    time_rule: EventRuleTimeRuleRequest | None = None
    task_template_ids: list[str] | None = None


class EventRuleStatusRequest(BaseModel):
    status: str


class EventTaskTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    group: str


class EventTaskTemplateListResponse(BaseModel):
    items: list[EventTaskTemplateResponse]


class EventRuleBoundTaskResponse(BaseModel):
    id: str
    name: str
    description: str
    group: str


class EventRuleSummaryResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    event_type: str
    status: str
    trigger_point: str
    description: str | None
    tags: list[str]
    task_template_count: int
    filter_summary: str
    trigger_summary: str
    updated_at: datetime
    updated_by: str


class EventRuleDetailResponse(BaseModel):
    id: str
    name: str
    code: str
    event_type: str
    status: str
    trigger_point: str
    object_type: str
    description: str | None
    tags: list[str]
    filters: list[dict[str, Any]]
    time_rule: dict[str, Any]
    bound_tasks: list[EventRuleBoundTaskResponse]
    filter_summary: str
    trigger_summary: str
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class EventRuleListResponse(BaseModel):
    items: list[EventRuleSummaryResponse]
    total_count: int
