from __future__ import annotations

from enum import Enum


class EventQueueType(str, Enum):
    INSTANT = "instant"
    TIMED = "timed"


class EventQueueStatus(str, Enum):
    PENDING = "pending"
    TRIGGERED = "triggered"
    CANCELLED = "cancelled"


class EventRuleType(str, Enum):
    NORMAL = "normal"
    TIMER = "timer"


class EventRuleStatus(str, Enum):
    DRAFT = "draft"
    ENABLED = "enabled"
    DISABLED = "disabled"
    DELETED = "deleted"
