from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class SwitchRoleRequest(BaseModel):
    active_role_code: str = Field(min_length=2, max_length=32)


class AuthenticatedUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    display_name: str
    status: str
    token_version: int
    role_version: int
    active_role: str
    roles: list[str]


class AuthResponse(BaseModel):
    user: AuthenticatedUser
    session_id: str


class MessageResponse(BaseModel):
    message: str


class AdminOverviewResponse(BaseModel):
    actor: AuthenticatedUser
    permissions: list[str]


class ObjectAccessResponse(BaseModel):
    actor_id: str
    active_role: str
    object_scope: dict[str, Any]
    access_granted: bool = True


class CsrfTokenResponse(BaseModel):
    csrf_token: str


class TicketSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
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
    content_markdown: str = Field(min_length=1, max_length=20000)


class KnowledgeArticleUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: str | None = Field(default=None, min_length=1, max_length=64)
    content_markdown: str | None = Field(default=None, min_length=1, max_length=20000)


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


class ReportTemplateListResponse(BaseModel):
    items: list[ReportTemplateSummaryResponse]
    total_count: int


class ReportTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")


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


class TicketReportListResponse(BaseModel):
    items: list[TicketReportResponse]
    total_count: int


class TicketReportUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    report_type: str | None = Field(default=None, min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=4000)
    source_template_id: str | None = Field(default=None, min_length=1, max_length=36)


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
    activity_feed: list[TicketActivityItemResponse]
    related_knowledge: list[KnowledgeArticleSummaryResponse]
    report_templates: list[ReportTemplateSummaryResponse]
    reports: list[TicketReportResponse]
    raw_alerts: list[TicketAlertResponse]
    siem_context_markdown: LocalizedTextResponse
    external_context: TicketExternalContextResponse
    responsibility_summary: LocalizedTextResponse
    permission_scope: TicketPermissionScopeResponse


class TicketCommentCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    visibility: str = Field(default="PUBLIC", pattern="^(PUBLIC|INTERNAL)$")


class TicketCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=8000)
    category_id: str = Field(min_length=1, max_length=64)
    priority: str = Field(min_length=2, max_length=8)
    risk_score: int = Field(ge=0, le=100)
    assignment_mode: str = Field(default="unassigned", pattern="^(unassigned|self|pool)$")
    pool_code: str | None = Field(default=None, min_length=2, max_length=32)


class TicketUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=8000)
    category_id: str | None = Field(default=None, min_length=1, max_length=64)
    priority: str | None = Field(default=None, min_length=2, max_length=8)
    risk_score: int | None = Field(default=None, ge=0, le=100)


class TicketActionCommandRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
