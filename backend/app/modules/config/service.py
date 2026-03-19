from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...security import utcnow
from .models import SystemConfig


class ConfigOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


SLA_POLICY_CATEGORY = "ticket.sla_policy"
SLA_PRIORITY_CODE_RE = re.compile(r"^[A-Z0-9_-]{1,8}$")
TICKET_TIMEOUT_REMINDER_CATEGORY = "ticket.timeout_reminder"
TICKET_TIMEOUT_REMINDER_KEY = "DEFAULT"


def _normalize_config_key(key: str) -> str:
    return key.strip().upper()


def _coerce_positive_int(field_name: str, value: Any) -> int:
    if isinstance(value, bool):
        raise ConfigOperationError(422, f"{field_name} must be a positive integer")
    if isinstance(value, float):
        if not value.is_integer():
            raise ConfigOperationError(422, f"{field_name} must be a positive integer")
        parsed = int(value)
    else:
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ConfigOperationError(422, f"{field_name} must be a positive integer") from exc
    if parsed <= 0:
        raise ConfigOperationError(422, f"{field_name} must be a positive integer")
    return parsed


def _validate_sla_policy_payload(*, key: str, value: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    normalized_key = _normalize_config_key(key)
    if not SLA_PRIORITY_CODE_RE.fullmatch(normalized_key):
        raise ConfigOperationError(
            422,
            "SLA priority code must be 1-8 chars: uppercase letters, numbers, _ and -",
        )
    if not isinstance(value, dict):
        raise ConfigOperationError(422, "SLA policy value must be an object")
    response_minutes = _coerce_positive_int("response_minutes", value.get("response_minutes"))
    resolution_minutes = _coerce_positive_int("resolution_minutes", value.get("resolution_minutes"))
    if resolution_minutes < response_minutes:
        raise ConfigOperationError(422, "resolution_minutes cannot be less than response_minutes")
    normalized_value = {
        "response_minutes": response_minutes,
        "resolution_minutes": resolution_minutes,
    }
    return normalized_key, normalized_value


def _validate_timeout_reminder_payload(*, key: str, value: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    normalized_key = _normalize_config_key(key)
    if normalized_key != TICKET_TIMEOUT_REMINDER_KEY:
        raise ConfigOperationError(
            422,
            f"{TICKET_TIMEOUT_REMINDER_CATEGORY} only supports key `{TICKET_TIMEOUT_REMINDER_KEY}`",
        )
    if not isinstance(value, dict):
        raise ConfigOperationError(422, "Timeout reminder value must be an object")

    response_reminder_minutes = _coerce_positive_int(
        "response_reminder_minutes", value.get("response_reminder_minutes")
    )
    resolution_reminder_minutes = _coerce_positive_int(
        "resolution_reminder_minutes", value.get("resolution_reminder_minutes")
    )
    return normalized_key, {
        "response_reminder_minutes": response_reminder_minutes,
        "resolution_reminder_minutes": resolution_reminder_minutes,
    }


def get_configs_by_category(db: Session, category: str) -> list[SystemConfig]:
    return list(
        db.scalars(
            select(SystemConfig)
            .where(SystemConfig.category == category)
            .where(SystemConfig.is_active == True)
            .order_by(SystemConfig.key)
        ).all()
    )


def get_config(db: Session, category: str, key: str) -> SystemConfig | None:
    return db.scalars(
        select(SystemConfig)
        .where(SystemConfig.category == category)
        .where(SystemConfig.key == key)
    ).first()


def create_config(
    db: Session,
    category: str,
    key: str,
    value: dict,
    description: str | None = None,
) -> SystemConfig:
    if category == SLA_POLICY_CATEGORY:
        key, value = _validate_sla_policy_payload(key=key, value=value)
    elif category == TICKET_TIMEOUT_REMINDER_CATEGORY:
        key, value = _validate_timeout_reminder_payload(key=key, value=value)
    existing = get_config(db, category, key)
    if existing:
        raise ConfigOperationError(409, f"Config with category='{category}' and key='{key}' already exists")

    config = SystemConfig(
        category=category,
        key=key,
        value=value,
        description=description,
        is_active=True,
    )
    db.add(config)
    db.flush()
    return config


def update_config(
    db: Session,
    category: str,
    key: str,
    value: dict | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> SystemConfig:
    config = get_config(db, category, key)
    if not config:
        raise ConfigOperationError(404, f"Config with category='{category}' and key='{key}' not found")

    if value is not None:
        if category == SLA_POLICY_CATEGORY:
            _, value = _validate_sla_policy_payload(key=key, value=value)
        elif category == TICKET_TIMEOUT_REMINDER_CATEGORY:
            _, value = _validate_timeout_reminder_payload(key=key, value=value)
        config.value = value
    if description is not None:
        config.description = description
    if is_active is not None:
        config.is_active = is_active
    config.updated_at = utcnow()
    db.flush()
    return config


def delete_config(db: Session, category: str, key: str) -> None:
    config = get_config(db, category, key)
    if not config:
        raise ConfigOperationError(404, f"Config with category='{category}' and key='{key}' not found")

    config.is_active = False
    config.updated_at = utcnow()
    db.flush()


def list_categories(db: Session) -> list[str]:
    rows = db.scalars(
        select(SystemConfig.category)
        .where(SystemConfig.is_active == True)
        .distinct()
    ).all()
    return list(rows)


def seed_default_configs(db: Session) -> None:
    """Seed default ticket category and priority configs if they don't exist."""
    default_categories = [
        {"key": "intrusion", "value": {"zh": "入侵检测", "en": "Intrusion Detection"}},
        {"key": "network", "value": {"zh": "网络攻击", "en": "Network Attack"}},
        {"key": "data", "value": {"zh": "数据安全", "en": "Data Security"}},
        {"key": "endpoint", "value": {"zh": "终端安全", "en": "Endpoint Security"}},
        {"key": "phishing", "value": {"zh": "网络钓鱼", "en": "Phishing"}},
    ]

    for cat in default_categories:
        if not get_config(db, "ticket.category", cat["key"]):
            create_config(
                db,
                category="ticket.category",
                key=cat["key"],
                value=cat["value"],
                description=f"工单分类: {cat['value']['zh']}",
            )

    default_priorities = [
        {"key": "P1", "value": {"zh": "紧急", "en": "Critical", "rank": 1}},
        {"key": "P2", "value": {"zh": "高", "en": "High", "rank": 2}},
        {"key": "P3", "value": {"zh": "中", "en": "Medium", "rank": 3}},
        {"key": "P4", "value": {"zh": "低", "en": "Low", "rank": 4}},
    ]

    for pri in default_priorities:
        if not get_config(db, "ticket.priority", pri["key"]):
            create_config(
                db,
                category="ticket.priority",
                key=pri["key"],
                value=pri["value"],
                description=f"工单优先级: {pri['value']['zh']}",
            )

    default_sla_policies = [
        {"key": "P1", "value": {"response_minutes": 60, "resolution_minutes": 240}},
        {"key": "P2", "value": {"response_minutes": 120, "resolution_minutes": 480}},
        {"key": "P3", "value": {"response_minutes": 240, "resolution_minutes": 1440}},
        {"key": "P4", "value": {"response_minutes": 480, "resolution_minutes": 2880}},
    ]

    for policy in default_sla_policies:
        if not get_config(db, SLA_POLICY_CATEGORY, policy["key"]):
            create_config(
                db,
                category=SLA_POLICY_CATEGORY,
                key=policy["key"],
                value=policy["value"],
                description=f"SLA policy for {policy['key']}",
            )

    if not get_config(db, TICKET_TIMEOUT_REMINDER_CATEGORY, TICKET_TIMEOUT_REMINDER_KEY):
        create_config(
            db,
            category=TICKET_TIMEOUT_REMINDER_CATEGORY,
            key=TICKET_TIMEOUT_REMINDER_KEY,
            value={
                "response_reminder_minutes": 5,
                "resolution_reminder_minutes": 30,
            },
            description="工单超时前提醒时间（分钟）",
        )
