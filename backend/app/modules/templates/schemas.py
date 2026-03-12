from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import TemplateStatus, TemplateType


class LocalizedTextResponse(BaseModel):
    zh: str
    en: str


class TemplateHeaderPayload(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    key: str = Field(default="", max_length=256)
    value: str = Field(default="", max_length=4000)


class TemplateFieldsPayload(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    subject: str = Field(default="", max_length=2000)
    body: str = Field(default="", max_length=20000)
    url: str = Field(default="", max_length=4000)
    method: str | None = Field(default=None, max_length=16)
    headers: list[TemplateHeaderPayload] = Field(default_factory=list)


class TemplateFieldDefinitionResponse(BaseModel):
    key: str
    label: LocalizedTextResponse
    description: LocalizedTextResponse
    field_kind: str
    required: bool
    supports_jinja: bool
    enum_options: list[str] = Field(default_factory=list)


class TemplateTypeDefinitionResponse(BaseModel):
    template_type: str
    label: LocalizedTextResponse
    description: LocalizedTextResponse
    fields: list[TemplateFieldDefinitionResponse]


class TemplateTypeListResponse(BaseModel):
    items: list[TemplateTypeDefinitionResponse]


class TemplateSummaryResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str | None
    template_type: str
    description: str | None
    status: str
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class TemplateDetailResponse(BaseModel):
    template: TemplateSummaryResponse
    fields: TemplateFieldsPayload
    field_definition: TemplateTypeDefinitionResponse


class TemplateListResponse(BaseModel):
    items: list[TemplateSummaryResponse]
    total_count: int


class TemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    code: str | None = Field(default=None, max_length=128)
    template_type: TemplateType
    description: str | None = Field(default=None, max_length=4000)
    fields: TemplateFieldsPayload


class TemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    code: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    fields: TemplateFieldsPayload | None = None


class TemplateStatusUpdateRequest(BaseModel):
    status: TemplateStatus


class TemplatePreviewRequest(BaseModel):
    template_type: TemplateType
    fields: TemplateFieldsPayload
    context: dict[str, object] = Field(default_factory=dict)


class TemplateFieldErrorResponse(BaseModel):
    field: str
    message: str


class TemplatePreviewResponse(BaseModel):
    template_type: str
    rendered: TemplateFieldsPayload
    field_errors: list[TemplateFieldErrorResponse]


class TemplateRenderRequest(BaseModel):
    template_id: str | None = Field(default=None, min_length=1, max_length=36)
    template_code: str | None = Field(default=None, min_length=1, max_length=128)
    context: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_template_locator(self) -> "TemplateRenderRequest":
        if bool(self.template_id) == bool(self.template_code):
            raise ValueError("Exactly one of template_id or template_code is required")
        return self


class TemplateRenderedPayloadResponse(BaseModel):
    subject: str | None = None
    body: str | None = None
    url: str | None = None
    method: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)


class TemplateRenderResponse(BaseModel):
    template_id: str
    template_code: str | None
    template_type: str
    rendered: TemplateRenderedPayloadResponse

