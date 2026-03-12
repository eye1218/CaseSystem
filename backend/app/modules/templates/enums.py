from __future__ import annotations

from enum import Enum


class TemplateStatus(str, Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class TemplateType(str, Enum):
    EMAIL = "EMAIL"
    WEBHOOK = "WEBHOOK"

