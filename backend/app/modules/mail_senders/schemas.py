from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MailSenderCreateRequest(BaseModel):
    sender_name: str
    sender_email: str
    auth_account: str
    auth_password: str
    smtp_host: str
    smtp_port: int
    security_type: str
    status: str = "ENABLED"


class MailSenderUpdateRequest(BaseModel):
    sender_name: str | None = None
    sender_email: str | None = None
    auth_account: str | None = None
    auth_password: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    security_type: str | None = None
    status: str | None = None


class MailSenderStatusRequest(BaseModel):
    status: str


class MailSenderTestRequest(BaseModel):
    test_email: str


class MailSenderSummaryResponse(BaseModel):
    id: str
    sender_name: str
    sender_email: str
    auth_account: str
    smtp_host: str
    smtp_port: int
    security_type: str
    status: str
    latest_test_status: str | None = None
    latest_test_at: datetime | None = None
    latest_test_error_summary: str | None = None
    password_configured: bool
    created_at: datetime
    updated_at: datetime


class MailSenderListResponse(BaseModel):
    items: list[MailSenderSummaryResponse]
    total_count: int


class MailSenderTestResponse(BaseModel):
    sender_id: str
    result: str
    tested_at: datetime
    error_summary: str | None = None
