from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class KpiMetricSummary(BaseModel):
    handled_count: int
    avg_response_seconds: float | None
    avg_resolution_seconds: float | None
    sla_attainment_rate: float | None
    weighted_sla_attainment_rate: float | None


class KpiTrendPoint(BaseModel):
    date: str
    handled_count: int
    sla_attainment_rate: float | None
    weighted_sla_attainment_rate: float | None


class KpiOverviewBlock(BaseModel):
    summary: KpiMetricSummary
    trend: list[KpiTrendPoint]


class KpiOverviewResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    window_days: int
    date_from: datetime
    date_to: datetime
    personal: KpiOverviewBlock
    global_: KpiOverviewBlock | None = Field(default=None, alias="global")


class KpiUserItem(BaseModel):
    user_id: str
    username: str
    display_name: str
    highest_role_code: str
    roles: list[str]
    handled_count: int
    avg_response_seconds: float | None
    avg_resolution_seconds: float | None
    sla_attainment_rate: float | None
    weighted_sla_attainment_rate: float | None


class KpiUserListResponse(BaseModel):
    items: list[KpiUserItem]
    total_count: int
    filtered_count: int
    has_more: bool
    next_offset: int | None
