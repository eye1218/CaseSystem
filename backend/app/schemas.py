from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .modules.tickets.schemas import (
    LocalizedTextResponse,
    ReportTemplateReferenceResponse,
    ReportTemplateSummaryResponse,
    TicketActionCommandRequest,
    TicketActivityItemResponse,
    TicketAlertResponse,
    TicketCommentCreateRequest,
    TicketCreateRequest,
    TicketDetailResponse,
    TicketExternalContextResponse,
    TicketKnowledgeArticleResponse,
    TicketListResponse,
    TicketPermissionScopeResponse,
    TicketReportResponse,
    TicketSummaryResponse,
    TicketUpdateRequest,
)


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


class SocketTokenResponse(BaseModel):
    token: str


class ReportTemplateListResponse(BaseModel):
    items: list["ReportTemplateSummaryResponse"]
    total_count: int


class ReportTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")


class TicketReportListResponse(BaseModel):
    items: list["TicketReportResponse"]
    total_count: int


class TicketReportUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    report_type: str | None = Field(default=None, min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=4000)
    source_template_id: str | None = Field(default=None, min_length=1, max_length=36)


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    active_role_code: str = Field(min_length=2, max_length=32)


class ApiTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    active_role_code: str
    status: str
    created_at: Any
    last_used_at: Any | None
    expires_at: Any | None
    created_by: str | None


class ApiTokenCreatedResponse(ApiTokenResponse):
    raw_token: str


class ApiTokenListResponse(BaseModel):
    items: list[ApiTokenResponse]
