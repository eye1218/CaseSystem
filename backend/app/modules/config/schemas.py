from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class SystemConfigBase(BaseModel):
    category: str
    key: str
    value: dict[str, Any]
    description: Optional[str] = None
    is_active: bool = True


class SystemConfigCreate(SystemConfigBase):
    pass


class SystemConfigUpdate(BaseModel):
    value: Optional[dict[str, Any]] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SystemConfigResponse(SystemConfigBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class SystemConfigListResponse(BaseModel):
    items: list[SystemConfigResponse]
    total_count: int
