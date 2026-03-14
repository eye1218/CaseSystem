from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field


class TaskRecipientRuleRequest(BaseModel):
    source_type: str
    value: str | None = None


class TaskRecipientConfigRequest(BaseModel):
    to: list[TaskRecipientRuleRequest] = Field(default_factory=list)
    cc: list[TaskRecipientRuleRequest] = Field(default_factory=list)
    bcc: list[TaskRecipientRuleRequest] = Field(default_factory=list)


class TaskTemplateCreateRequest(BaseModel):
    name: str
    task_type: str
    reference_template_id: str
    sender_config_id: str | None = None
    status: str = "ACTIVE"
    recipient_config: TaskRecipientConfigRequest = Field(default_factory=TaskRecipientConfigRequest)
    target_config: dict[str, Any] = Field(default_factory=dict)
    description: str | None = None


class TaskTemplateUpdateRequest(BaseModel):
    name: str | None = None
    reference_template_id: str | None = None
    sender_config_id: str | None = None
    recipient_config: TaskRecipientConfigRequest | None = None
    target_config: dict[str, Any] | None = None
    description: str | None = None


class TaskTemplateStatusRequest(BaseModel):
    status: str


class TaskRecipientRuleResponse(BaseModel):
    source_type: str
    value: str | None = None


class TaskRecipientConfigResponse(BaseModel):
    to: list[TaskRecipientRuleResponse] = Field(default_factory=list)
    cc: list[TaskRecipientRuleResponse] = Field(default_factory=list)
    bcc: list[TaskRecipientRuleResponse] = Field(default_factory=list)


class TaskTemplateSummaryResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: str
    name: str
    task_type: str
    reference_template_id: str
    sender_config_id: str | None = None
    status: str
    recipient_config: TaskRecipientConfigResponse
    target_config: dict[str, Any]
    description: str | None
    created_at: datetime
    updated_at: datetime


class TaskTemplateListResponse(BaseModel):
    items: list[TaskTemplateSummaryResponse]
    total_count: int


class EventBindableTaskTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    group: str


class EventBindableTaskTemplateListResponse(BaseModel):
    items: list[EventBindableTaskTemplateResponse]


class TaskExecutionLogResponse(BaseModel):
    id: str
    stage: str
    actor_user_id: str | None = None
    actor_name: str | None = None
    input_summary: dict[str, Any] = Field(default_factory=dict)
    rendered_summary: dict[str, Any] = Field(default_factory=dict)
    response_summary: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    created_at: datetime


class TaskInstanceSummaryResponse(BaseModel):
    id: str
    task_template_id: str | None = None
    source_event_id: str | None = None
    source_binding_id: str | None = None
    ticket_id: int | None = None
    task_type: str
    task_name: str
    status: str
    target_summary: str
    latest_result: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    retry_of_task_id: str | None = None
    operator_user_id: str | None = None
    operator_name: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TaskInstanceDetailResponse(TaskInstanceSummaryResponse):
    template_snapshot: dict[str, Any] = Field(default_factory=dict)
    logs: list[TaskExecutionLogResponse] = Field(default_factory=list)


class TaskInstanceListResponse(BaseModel):
    items: list[TaskInstanceSummaryResponse]
    total_count: int
