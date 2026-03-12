from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from jinja2 import StrictUndefined, TemplateError
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...enums import RoleCode
from ...security import utcnow
from .enums import TemplateStatus, TemplateType
from .models import Template
from .schemas import (
    LocalizedTextResponse,
    TemplateFieldDefinitionResponse,
    TemplateFieldErrorResponse,
    TemplateFieldsPayload,
    TemplateHeaderPayload,
    TemplateRenderedPayloadResponse,
    TemplateTypeDefinitionResponse,
)

HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
HEADER_KEY_PATTERN = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
JINJA_ENV = SandboxedEnvironment(undefined=StrictUndefined, autoescape=False)


class TemplateOperationError(Exception):
    status_code: int
    detail: str | dict[str, object]

    def __init__(self, status_code: int, detail: str | dict[str, object]):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _template_type_definition(template_type: str) -> TemplateTypeDefinitionResponse:
    if template_type == TemplateType.EMAIL.value:
        return TemplateTypeDefinitionResponse(
            template_type=template_type,
            label=LocalizedTextResponse(zh="Email 模板", en="Email Template"),
            description=LocalizedTextResponse(
                zh="用于邮件通知，固定字段为 subject 与 body。",
                en="Used for email notifications with fixed subject and body fields.",
            ),
            fields=[
                TemplateFieldDefinitionResponse(
                    key="subject",
                    label=LocalizedTextResponse(zh="邮件主题", en="Subject"),
                    description=LocalizedTextResponse(
                        zh="必填字段，支持 Jinja2 变量渲染。",
                        en="Required field with Jinja2 variable rendering.",
                    ),
                    field_kind="text",
                    required=True,
                    supports_jinja=True,
                ),
                TemplateFieldDefinitionResponse(
                    key="body",
                    label=LocalizedTextResponse(zh="邮件正文", en="Body"),
                    description=LocalizedTextResponse(
                        zh="必填字段，支持 Jinja2 变量渲染。",
                        en="Required field with Jinja2 variable rendering.",
                    ),
                    field_kind="textarea",
                    required=True,
                    supports_jinja=True,
                ),
            ],
        )

    if template_type == TemplateType.WEBHOOK.value:
        return TemplateTypeDefinitionResponse(
            template_type=template_type,
            label=LocalizedTextResponse(zh="Webhook 模板", en="Webhook Template"),
            description=LocalizedTextResponse(
                zh="用于回调外部系统，固定字段为 url、method、headers、body。",
                en="Used for outbound callbacks with url, method, headers, and body.",
            ),
            fields=[
                TemplateFieldDefinitionResponse(
                    key="url",
                    label=LocalizedTextResponse(zh="请求地址", en="URL"),
                    description=LocalizedTextResponse(
                        zh="必填字段，渲染后必须得到最终可用地址。",
                        en="Required field and must render to a usable final URL.",
                    ),
                    field_kind="text",
                    required=True,
                    supports_jinja=True,
                ),
                TemplateFieldDefinitionResponse(
                    key="method",
                    label=LocalizedTextResponse(zh="请求方法", en="Method"),
                    description=LocalizedTextResponse(
                        zh="固定枚举，本次实现按常见 HTTP 方法提供。",
                        en="Fixed enum implemented with a common HTTP method set.",
                    ),
                    field_kind="select",
                    required=True,
                    supports_jinja=False,
                    enum_options=list(HTTP_METHODS),
                ),
                TemplateFieldDefinitionResponse(
                    key="headers",
                    label=LocalizedTextResponse(zh="请求头", en="Headers"),
                    description=LocalizedTextResponse(
                        zh="按结构化键值对维护，仅 value 参与模板渲染。",
                        en="Managed as key-value pairs with templating on the value only.",
                    ),
                    field_kind="headers",
                    required=False,
                    supports_jinja=True,
                ),
                TemplateFieldDefinitionResponse(
                    key="body",
                    label=LocalizedTextResponse(zh="请求体", en="Body"),
                    description=LocalizedTextResponse(
                        zh="可选字段；method=GET 时允许保存，发送侧忽略。",
                        en="Optional field; when method=GET it can be saved and later ignored by delivery.",
                    ),
                    field_kind="textarea",
                    required=False,
                    supports_jinja=True,
                ),
            ],
        )

    raise TemplateOperationError(422, "Unsupported template type")


def _require_admin_actor(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise TemplateOperationError(403, "Admin role required")


def _require_runtime_actor(actor: ActorContext) -> None:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise TemplateOperationError(403, "Internal role required")


def _normalize_code(code: str | None) -> str | None:
    if code is None:
        return None
    normalized = code.strip()
    return normalized or None


def _normalized_fields_payload(fields: TemplateFieldsPayload) -> TemplateFieldsPayload:
    return TemplateFieldsPayload.model_validate(fields.model_dump())


def _append_field_error(
    errors: list[TemplateFieldErrorResponse], *, field: str, message: str
) -> None:
    errors.append(TemplateFieldErrorResponse(field=field, message=message))


def _normalize_header_rows(
    headers: list[TemplateHeaderPayload],
) -> tuple[list[TemplateHeaderPayload], list[TemplateFieldErrorResponse]]:
    normalized_rows: list[TemplateHeaderPayload] = []
    errors: list[TemplateFieldErrorResponse] = []
    seen_keys: set[str] = set()

    for index, row in enumerate(headers, start=1):
        key = row.key.strip()
        value = row.value
        if not key and not value.strip():
            continue
        if not key:
            _append_field_error(
                errors,
                field="headers",
                message=f"Header row {index} is missing a name",
            )
            continue
        if "{{" in key or "{%" in key or "{#" in key:
            _append_field_error(
                errors,
                field="headers",
                message=f"Header key `{key}` does not support template syntax",
            )
            continue
        if HEADER_KEY_PATTERN.match(key) is None:
            _append_field_error(
                errors,
                field="headers",
                message=f"Header key `{key}` is not a valid HTTP header name",
            )
            continue
        normalized_key = key.lower()
        if normalized_key in seen_keys:
            _append_field_error(
                errors,
                field="headers",
                message=f"Duplicate header key `{key}` is not allowed",
            )
            continue
        seen_keys.add(normalized_key)
        normalized_rows.append(TemplateHeaderPayload(key=key, value=value))

    return normalized_rows, errors


def _validate_and_normalize_fields(
    template_type: str,
    fields: TemplateFieldsPayload,
) -> tuple[TemplateFieldsPayload, list[TemplateFieldErrorResponse]]:
    payload = _normalized_fields_payload(fields)
    errors: list[TemplateFieldErrorResponse] = []

    normalized_headers, header_errors = _normalize_header_rows(payload.headers)
    errors.extend(header_errors)

    if template_type == TemplateType.EMAIL.value:
        if not payload.subject.strip():
            _append_field_error(errors, field="subject", message="Subject is required")
        if not payload.body.strip():
            _append_field_error(errors, field="body", message="Body is required")
        return (
            TemplateFieldsPayload(
                subject=payload.subject,
                body=payload.body,
                url="",
                method=None,
                headers=[],
            ),
            errors,
        )

    if template_type == TemplateType.WEBHOOK.value:
        method = (payload.method or "").strip().upper()
        if not payload.url.strip():
            _append_field_error(errors, field="url", message="URL is required")
        if not method:
            _append_field_error(errors, field="method", message="Method is required")
        elif method not in HTTP_METHODS:
            _append_field_error(
                errors,
                field="method",
                message=f"Method `{method}` is outside the supported enum",
            )
        return (
            TemplateFieldsPayload(
                subject="",
                body=payload.body,
                url=payload.url,
                method=method or None,
                headers=normalized_headers,
            ),
            errors,
        )

    raise TemplateOperationError(422, "Unsupported template type")


def _raise_if_field_errors(errors: list[TemplateFieldErrorResponse]) -> None:
    if errors:
        raise TemplateOperationError(
            422,
            {
                "message": "Template field validation failed",
                "field_errors": [error.model_dump() for error in errors],
            },
        )


def _fields_to_storage_payload(fields: TemplateFieldsPayload) -> dict[str, object]:
    payload: dict[str, object] = {
        "subject": fields.subject,
        "body": fields.body,
        "url": fields.url,
        "method": fields.method,
        "headers": [header.model_dump() for header in fields.headers],
    }
    return payload


def _storage_payload_to_fields(field_values: dict[str, object]) -> TemplateFieldsPayload:
    raw_headers = field_values.get("headers")
    headers: list[TemplateHeaderPayload] = []
    if isinstance(raw_headers, list):
        for row in raw_headers:
            if isinstance(row, dict):
                headers.append(
                    TemplateHeaderPayload(
                        key=str(row.get("key", "")),
                        value=str(row.get("value", "")),
                    )
                )

    method_value = field_values.get("method")
    method = str(method_value) if isinstance(method_value, str) else None
    return TemplateFieldsPayload(
        subject=str(field_values.get("subject", "")),
        body=str(field_values.get("body", "")),
        url=str(field_values.get("url", "")),
        method=method,
        headers=headers,
    )


def _build_summary(template: Template) -> dict[str, object]:
    return {
        "id": template.id,
        "name": template.name,
        "code": template.code,
        "template_type": template.template_type,
        "description": template.description,
        "status": template.status,
        "created_by_user_id": template.created_by_user_id,
        "updated_by_user_id": template.updated_by_user_id,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


def _build_detail(template: Template) -> dict[str, object]:
    return {
        "template": _build_summary(template),
        "fields": _storage_payload_to_fields(template.field_values),
        "field_definition": _template_type_definition(template.template_type),
    }


def list_template_types(actor: ActorContext) -> dict[str, object]:
    _require_admin_actor(actor)
    return {
        "items": [
            _template_type_definition(TemplateType.EMAIL.value),
            _template_type_definition(TemplateType.WEBHOOK.value),
        ]
    }


def list_templates(
    db: Session,
    actor: ActorContext,
    *,
    template_type: str | None = None,
    status: str | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, object]], int]:
    _require_admin_actor(actor)
    conditions = []

    if template_type:
        conditions.append(Template.template_type == template_type)
    if status:
        conditions.append(Template.status == status)
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(Template.name.ilike(pattern), Template.code.ilike(pattern))
        )

    query = select(Template).where(*conditions).order_by(Template.updated_at.desc())
    items = list(db.scalars(query).all())
    total_count = db.scalar(
        select(func.count()).select_from(Template).where(*conditions)
    ) or 0
    return [_build_summary(item) for item in items], int(total_count)


def _assert_code_available(
    db: Session, *, code: str | None, current_template_id: str | None = None
) -> None:
    if not code:
        return
    existing = db.scalar(select(Template).where(Template.code == code))
    if existing is None:
        return
    if current_template_id is not None and existing.id == current_template_id:
        return
    raise TemplateOperationError(409, f"Template code `{code}` already exists")


def create_template(
    db: Session,
    actor: ActorContext,
    *,
    name: str,
    code: str | None,
    template_type: str,
    description: str | None,
    fields: TemplateFieldsPayload,
) -> dict[str, object]:
    _require_admin_actor(actor)
    if not name.strip():
        raise TemplateOperationError(422, "Template name is required")
    normalized_fields, field_errors = _validate_and_normalize_fields(template_type, fields)
    _raise_if_field_errors(field_errors)

    normalized_code = _normalize_code(code)
    _assert_code_available(db, code=normalized_code)

    now = utcnow()
    template = Template(
        name=name.strip(),
        code=normalized_code,
        template_type=template_type,
        description=description.strip() if isinstance(description, str) and description.strip() else None,
        status=TemplateStatus.DRAFT.value,
        field_values=_fields_to_storage_payload(normalized_fields),
        created_by_user_id=actor.user_id,
        updated_by_user_id=actor.user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _build_detail(template)


def _get_template_or_error(db: Session, template_id: str) -> Template:
    template = db.scalar(select(Template).where(Template.id == template_id))
    if template is None:
        raise TemplateOperationError(404, "Template not found")
    return template


def get_template(db: Session, actor: ActorContext, template_id: str) -> dict[str, object]:
    _require_admin_actor(actor)
    template = _get_template_or_error(db, template_id)
    return _build_detail(template)


def update_template(
    db: Session,
    actor: ActorContext,
    *,
    template_id: str,
    name: str | None,
    code: str | None,
    description: str | None,
    fields: TemplateFieldsPayload | None,
) -> dict[str, object]:
    _require_admin_actor(actor)
    template = _get_template_or_error(db, template_id)
    merged_fields = (
        fields if fields is not None else _storage_payload_to_fields(template.field_values)
    )
    normalized_fields, field_errors = _validate_and_normalize_fields(
        template.template_type, merged_fields
    )
    _raise_if_field_errors(field_errors)

    if name is not None:
        if not name.strip():
            raise TemplateOperationError(422, "Template name is required")
        template.name = name.strip()
    if code is not None:
        normalized_code = _normalize_code(code)
        _assert_code_available(
            db, code=normalized_code, current_template_id=template.id
        )
        template.code = normalized_code
    if description is not None:
        template.description = description.strip() or None

    template.field_values = _fields_to_storage_payload(normalized_fields)
    template.updated_by_user_id = actor.user_id
    template.updated_at = utcnow()
    db.commit()
    db.refresh(template)
    return _build_detail(template)


def update_template_status(
    db: Session,
    actor: ActorContext,
    *,
    template_id: str,
    status: str,
) -> dict[str, object]:
    _require_admin_actor(actor)
    template = _get_template_or_error(db, template_id)
    template.status = status
    template.updated_by_user_id = actor.user_id
    template.updated_at = utcnow()
    db.commit()
    db.refresh(template)
    return _build_detail(template)


def _render_text_field(
    *,
    field: str,
    template_value: str,
    context: dict[str, object],
    field_errors: list[TemplateFieldErrorResponse],
) -> str:
    if not template_value:
        return ""
    try:
        compiled = JINJA_ENV.from_string(template_value)
        return str(compiled.render(**context))
    except TemplateError as exc:
        _append_field_error(field_errors, field=field, message=str(exc))
        return ""


def _validate_rendered_url(
    *, value: str, field_errors: list[TemplateFieldErrorResponse]
) -> None:
    if not value:
        return
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        _append_field_error(
            field_errors,
            field="url",
            message="Rendered URL must be a valid http/https address",
        )


def _preview_template_payload(
    *,
    template_type: str,
    fields: TemplateFieldsPayload,
    context: dict[str, object],
) -> dict[str, object]:
    normalized_fields, field_errors = _validate_and_normalize_fields(template_type, fields)
    rendered_fields = TemplateFieldsPayload(
        subject="",
        body="",
        url="",
        method=normalized_fields.method,
        headers=[],
    )

    if template_type == TemplateType.EMAIL.value:
        rendered_fields.subject = _render_text_field(
            field="subject",
            template_value=normalized_fields.subject,
            context=context,
            field_errors=field_errors,
        )
        rendered_fields.body = _render_text_field(
            field="body",
            template_value=normalized_fields.body,
            context=context,
            field_errors=field_errors,
        )
    elif template_type == TemplateType.WEBHOOK.value:
        rendered_fields.url = _render_text_field(
            field="url",
            template_value=normalized_fields.url,
            context=context,
            field_errors=field_errors,
        )
        _validate_rendered_url(value=rendered_fields.url.strip(), field_errors=field_errors)
        rendered_fields.body = _render_text_field(
            field="body",
            template_value=normalized_fields.body,
            context=context,
            field_errors=field_errors,
        )
        rendered_headers: list[TemplateHeaderPayload] = []
        for header in normalized_fields.headers:
            rendered_headers.append(
                TemplateHeaderPayload(
                    key=header.key,
                    value=_render_text_field(
                        field="headers",
                        template_value=header.value,
                        context=context,
                        field_errors=field_errors,
                    ),
                )
            )
        rendered_fields.headers = rendered_headers
    else:
        raise TemplateOperationError(422, "Unsupported template type")

    return {
        "template_type": template_type,
        "rendered": rendered_fields,
        "field_errors": field_errors,
    }


def preview_template(
    actor: ActorContext,
    *,
    template_type: str,
    fields: TemplateFieldsPayload,
    context: dict[str, object],
) -> dict[str, object]:
    _require_admin_actor(actor)
    return _preview_template_payload(
        template_type=template_type,
        fields=fields,
        context=context,
    )


def _resolve_template_for_render(
    db: Session, *, template_id: str | None, template_code: str | None
) -> Template:
    if template_id:
        return _get_template_or_error(db, template_id)

    assert template_code is not None
    template = db.scalar(select(Template).where(Template.code == template_code.strip()))
    if template is None:
        raise TemplateOperationError(404, "Template not found")
    return template


def render_template(
    db: Session,
    actor: ActorContext,
    *,
    template_id: str | None,
    template_code: str | None,
    context: dict[str, object],
) -> dict[str, object]:
    _require_runtime_actor(actor)
    template = _resolve_template_for_render(
        db, template_id=template_id, template_code=template_code
    )
    if template.status != TemplateStatus.ACTIVE.value:
        raise TemplateOperationError(409, "Template is not active")

    preview = _preview_template_payload(
        template_type=template.template_type,
        fields=_storage_payload_to_fields(template.field_values),
        context=context,
    )
    field_errors = preview["field_errors"]
    if field_errors:
        raise TemplateOperationError(
            422,
            {
                "message": "Template render failed",
                "field_errors": [error.model_dump() for error in field_errors],
            },
        )

    rendered_config = preview["rendered"]
    assert isinstance(rendered_config, TemplateFieldsPayload)

    rendered_payload = TemplateRenderedPayloadResponse(
        subject=rendered_config.subject if template.template_type == TemplateType.EMAIL.value else None,
        body=rendered_config.body,
        url=rendered_config.url if template.template_type == TemplateType.WEBHOOK.value else None,
        method=rendered_config.method if template.template_type == TemplateType.WEBHOOK.value else None,
        headers={header.key: header.value for header in rendered_config.headers},
    )
    return {
        "template_id": template.id,
        "template_code": template.code,
        "template_type": template.template_type,
        "rendered": rendered_payload,
    }
