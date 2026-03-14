from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..knowledge.schemas import KnowledgeArticleSummaryResponse


class TicketSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    title: str
    description: str
    category_id: str
    category_name: str
    source: str
    priority: str
    risk_score: int
    main_status: str
    sub_status: str
    created_by: str
    assigned_to: str | None
    assigned_to_user_id: str | None = None
    current_pool_code: str | None
    responsibility_level: str
    response_deadline_at: datetime | None
    resolution_deadline_at: datetime | None
    responded_at: datetime | None
    response_timeout_at: datetime | None
    resolved_at: datetime | None
    resolution_timeout_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TicketListResponse(BaseModel):
    items: list[TicketSummaryResponse]
    total_count: int
    filtered_count: int
    has_more: bool
    next_offset: int | None


class LocalizedTextResponse(BaseModel):
    zh: str
    en: str


class TicketKnowledgeArticleResponse(BaseModel):
    id: str
    title: LocalizedTextResponse
    summary: LocalizedTextResponse
    tags: list[str]
    author: str
    updated_at: str
    version: str
    likes: int
    content: LocalizedTextResponse


class ReportTemplateSummaryResponse(BaseModel):
    id: str
    name: str
    description: str | None
    ticket_category_id: str
    status: str
    original_filename: str
    content_type: str | None
    size_bytes: int
    download_path: str
    created_at: datetime
    updated_at: datetime


class ReportTemplateReferenceResponse(BaseModel):
    id: str
    name: str


class TicketReportResponse(BaseModel):
    id: str
    ticket_id: int
    title: str
    report_type: str
    note: str | None
    source_template: ReportTemplateReferenceResponse | None
    original_filename: str
    content_type: str | None
    size_bytes: int
    uploaded_by: str
    created_at: datetime
    updated_at: datetime
    download_path: str


class TicketAlertResponse(BaseModel):
    seq: int
    time: str
    rule_id: str
    src_ip: str
    src_port: int
    dst_host: str
    dst_port: int
    user: str
    result: str


class TicketExternalContextResponse(BaseModel):
    source: str
    rule_name: str
    severity: str
    asset: str
    indicator: str
    summary: LocalizedTextResponse


class TicketPermissionScopeResponse(BaseModel):
    current_role: str
    page_scope: str
    comment_scope: str
    hidden_fields: list[str]


class TicketEscalationSummaryResponse(BaseModel):
    id: str
    ticket_id: int
    mode: str
    status: str
    source_level: str
    target_level: str
    target_user_id: str | None = None
    target_pool_code: str | None = None
    requested_by: str
    requested_at: datetime
    reject_reason: str | None = None
    source_pool_code: str | None = None
    source_assigned_to: str | None = None


class InternalTicketUserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    highest_role_code: str
    role_codes: list[str]


class TicketActivityItemResponse(BaseModel):
    id: str
    item_type: str
    actor_name: str
    actor_role: str | None
    visibility: str
    content: str
    from_status: str | None = None
    to_status: str | None = None
    created_at: datetime
    is_system: bool = False


class TicketDetailResponse(BaseModel):
    ticket: TicketSummaryResponse
    available_actions: list[str]
    pending_escalation: TicketEscalationSummaryResponse | None = None
    activity_feed: list[TicketActivityItemResponse]
    related_knowledge: list[KnowledgeArticleSummaryResponse]
    report_templates: list[ReportTemplateSummaryResponse]
    reports: list[TicketReportResponse]
    raw_alerts: list[TicketAlertResponse]
    siem_context_markdown: LocalizedTextResponse
    external_context: TicketExternalContextResponse
    responsibility_summary: LocalizedTextResponse
    permission_scope: TicketPermissionScopeResponse


class TicketLiveResponse(BaseModel):
    ticket: TicketSummaryResponse
    available_actions: list[str]
    pending_escalation: TicketEscalationSummaryResponse | None = None
    activity_feed: list[TicketActivityItemResponse]
    raw_alerts: list[TicketAlertResponse]
    responsibility_summary: LocalizedTextResponse
    permission_scope: TicketPermissionScopeResponse


class TicketCommentCreateRequest(BaseModel):
    version: int = Field(ge=1)
    content: str = Field(min_length=1, max_length=4000)
    visibility: str = Field(default="PUBLIC", pattern="^(PUBLIC|INTERNAL)$")


class TicketCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=8000)
    category_id: str = Field(min_length=1, max_length=64)
    priority: str = Field(min_length=2, max_length=8)
    risk_score: int = Field(ge=0, le=100)
    assignment_mode: str = Field(
        default="unassigned", pattern="^(unassigned|self|pool)$"
    )
    pool_code: str | None = Field(default=None, min_length=2, max_length=32)


class TicketUpdateRequest(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=8000)
    category_id: str | None = Field(default=None, min_length=1, max_length=64)
    priority: str | None = Field(default=None, min_length=2, max_length=8)
    risk_score: int | None = Field(default=None, ge=0, le=100)


class TicketActionCommandRequest(BaseModel):
    version: int = Field(ge=1)
    note: str | None = Field(default=None, max_length=1000)


class TicketAssignRequest(BaseModel):
    version: int = Field(ge=1)
    target_user_id: str = Field(min_length=1, max_length=36)
    note: str | None = Field(default=None, max_length=1000)


class TicketEscalateToPoolRequest(BaseModel):
    version: int = Field(ge=1)
    note: str | None = Field(default=None, max_length=1000)


class TicketEscalateToUserRequest(BaseModel):
    version: int = Field(ge=1)
    target_user_id: str = Field(min_length=1, max_length=36)
    note: str | None = Field(default=None, max_length=1000)


class TicketEscalationRejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class InternalTicketUserListResponse(BaseModel):
    items: list[InternalTicketUserResponse]
