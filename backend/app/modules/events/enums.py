from __future__ import annotations

from enum import Enum


class EventType(str, Enum):
    INSTANT = "instant"
    TIMED = "timed"


class EventStatus(str, Enum):
    PENDING = "pending"
    TRIGGERED = "triggered"
    CANCELLED = "cancelled"
