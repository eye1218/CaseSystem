from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AlertSourceCreateRequest(BaseModel):
    name: str
    host: str
    port: int
    username: str
    password: str
    database_name: str
    table_name: str
    ticket_match_field: str = "alert_id"
    status: str = "ENABLED"


class AlertSourceUpdateRequest(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    username: str | None = None
    password: str | None = None
    database_name: str | None = None
    table_name: str | None = None
    ticket_match_field: str | None = None
    status: str | None = None


class AlertSourceStatusRequest(BaseModel):
    status: str


class AlertSourceQueryRequest(BaseModel):
    ticket_keys: list[str] = Field(min_length=1, max_length=500)


class AlertSourceSummaryResponse(BaseModel):
    id: str
    name: str
    host: str
    port: int
    username: str
    database_name: str
    table_name: str
    ticket_match_field: str
    status: str
    latest_test_status: str | None = None
    latest_test_at: datetime | None = None
    latest_test_error_summary: str | None = None
    password_configured: bool
    created_at: datetime
    updated_at: datetime


class AlertSourceListResponse(BaseModel):
    items: list[AlertSourceSummaryResponse]
    total_count: int


class AlertSourceTestResponse(BaseModel):
    source_id: str
    result: str
    tested_at: datetime
    message: str
    sample_columns: list[str] = []
    error_summary: str | None = None


class AlertSourceQueryItemResponse(BaseModel):
    ticket_key: str
    row_count: int
    rows: list[dict[str, Any]]


class AlertSourceQueryResponse(BaseModel):
    source_id: str
    table_name: str
    ticket_match_field: str
    queried_ticket_keys: list[str]
    matched_ticket_keys: list[str]
    unmatched_ticket_keys: list[str]
    total_rows: int
    items: list[AlertSourceQueryItemResponse]

