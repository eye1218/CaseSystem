from __future__ import annotations

from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from ...enums import RoleCode, UserStatus


class UserGroupReferenceResponse(BaseModel):
    id: str
    name: str


class UserSummaryResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: str | None
    status: str
    roles: list[str]
    groups: list[UserGroupReferenceResponse]
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserDetailPayloadResponse(UserSummaryResponse):
    disabled_at: datetime | None
    disabled_reason: str | None


class UserListResponse(BaseModel):
    items: list[UserSummaryResponse]
    total_count: int


class UserDetailResponse(BaseModel):
    user: UserDetailPayloadResponse


class UserCreateRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=128)
    email: str | None = Field(default=None, max_length=255)
    password: str = Field(min_length=8, max_length=256)
    role_codes: list[RoleCode] = Field(min_length=1)
    group_ids: list[str] = Field(default_factory=list)


class UserUpdateRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    email: str | None = Field(default=None, max_length=255)
    group_ids: list[str] | None = None


class UserStatusUpdateRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    status: UserStatus
    reason: str | None = Field(default=None, max_length=4000)


class UserGroupSummaryResponse(BaseModel):
    id: str
    name: str
    description: str | None
    member_count: int
    created_at: datetime
    updated_at: datetime


class UserGroupMemberResponse(BaseModel):
    user_id: str
    username: str
    display_name: str
    email: str | None
    status: str
    roles: list[str]
    added_at: datetime


class UserGroupListResponse(BaseModel):
    items: list[UserGroupSummaryResponse]
    total_count: int


class UserGroupDetailResponse(BaseModel):
    group: UserGroupSummaryResponse
    members: list[UserGroupMemberResponse]


class UserGroupCreateRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)


class UserGroupUpdateRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)


class UserGroupMembersUpdateRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    user_ids: list[str] = Field(min_length=1)

