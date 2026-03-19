from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...security import utcnow
from ..tickets.models import Ticket
from .models import SystemConfig
from .schemas import SystemConfigCreate, SystemConfigUpdate


class ConfigOperationError(Exception):
    status_code: int
    detail: str

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


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
