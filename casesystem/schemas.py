from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class SwitchRoleRequest(BaseModel):
    active_role_code: str = Field(min_length=2, max_length=32)


class AuthenticatedUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    display_name: str
    status: str
    token_version: int
    role_version: int
    active_role: str
    roles: list[str]


class AuthResponse(BaseModel):
    user: AuthenticatedUser
    session_id: str


class MessageResponse(BaseModel):
    message: str


class AdminOverviewResponse(BaseModel):
    actor: AuthenticatedUser
    permissions: list[str]


class ObjectAccessResponse(BaseModel):
    actor_id: str
    active_role: str
    object_scope: dict[str, Any]
    access_granted: bool = True


class CsrfTokenResponse(BaseModel):
    csrf_token: str

