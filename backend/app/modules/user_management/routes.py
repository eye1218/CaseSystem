from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from ...schemas import MessageResponse
from .schemas import (
    UserCreateRequest,
    UserDetailResponse,
    UserGroupCreateRequest,
    UserGroupDetailResponse,
    UserGroupListResponse,
    UserGroupMembersUpdateRequest,
    UserGroupUpdateRequest,
    UserListResponse,
    UserPasswordUpdateRequest,
    UserStatusUpdateRequest,
    UserUpdateRequest,
)
from .service import (
    UserManagementOperationError,
    add_user_group_members,
    create_user,
    create_user_group,
    delete_user,
    delete_user_group,
    get_user_detail,
    get_user_group_detail,
    list_user_groups,
    list_users,
    remove_user_group_member,
    update_user,
    update_user_group,
    update_user_password,
    update_user_status,
)

user_management_router = APIRouter(tags=["user-management"])


@user_management_router.get("/api/v1/users", response_model=UserListResponse)
def user_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    status: str | None = None,
    role_code: str | None = None,
    group_id: str | None = None,
) -> UserListResponse:
    try:
        items, total_count = list_users(
            db,
            actor,
            search=search,
            status=status,
            role_code=role_code,
            group_id=group_id,
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserListResponse(items=items, total_count=total_count)


@user_management_router.post(
    "/api/v1/users",
    response_model=UserDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_create(
    payload: UserCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserDetailResponse:
    try:
        detail = create_user(
            db,
            actor,
            username=payload.username,
            display_name=payload.display_name,
            email=payload.email,
            password=payload.password,
            role_codes=[role_code.value for role_code in payload.role_codes],
            group_ids=payload.group_ids,
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserDetailResponse.model_validate(detail)


@user_management_router.get("/api/v1/users/{user_id}", response_model=UserDetailResponse)
def user_detail(
    user_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserDetailResponse:
    try:
        detail = get_user_detail(db, actor, user_id)
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserDetailResponse.model_validate(detail)


@user_management_router.patch(
    "/api/v1/users/{user_id}",
    response_model=UserDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_update(
    user_id: str,
    payload: UserUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserDetailResponse:
    try:
        detail = update_user(
            db,
            actor,
            user_id=user_id,
            display_name=payload.display_name,
            email=payload.email,
            group_ids=payload.group_ids,
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserDetailResponse.model_validate(detail)


@user_management_router.post(
    "/api/v1/users/{user_id}/status",
    response_model=UserDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_status_update(
    user_id: str,
    payload: UserStatusUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserDetailResponse:
    try:
        detail = update_user_status(
            db,
            actor,
            user_id=user_id,
            status=payload.status.value,
            reason=payload.reason,
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserDetailResponse.model_validate(detail)


@user_management_router.post(
    "/api/v1/users/{user_id}/password",
    response_model=UserDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_password_update(
    user_id: str,
    payload: UserPasswordUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserDetailResponse:
    try:
        detail = update_user_password(
            db,
            actor,
            user_id=user_id,
            password=payload.password,
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserDetailResponse.model_validate(detail)


@user_management_router.delete(
    "/api/v1/users/{user_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
def user_delete(
    user_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    try:
        result = delete_user(db, actor, user_id=user_id)
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return MessageResponse.model_validate(result)


@user_management_router.get(
    "/api/v1/user-groups", response_model=UserGroupListResponse
)
def user_group_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
) -> UserGroupListResponse:
    try:
        items, total_count = list_user_groups(db, actor, search=search)
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserGroupListResponse(items=items, total_count=total_count)


@user_management_router.post(
    "/api/v1/user-groups",
    response_model=UserGroupDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_group_create(
    payload: UserGroupCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserGroupDetailResponse:
    try:
        detail = create_user_group(
            db, actor, name=payload.name, description=payload.description
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserGroupDetailResponse.model_validate(detail)


@user_management_router.get(
    "/api/v1/user-groups/{group_id}", response_model=UserGroupDetailResponse
)
def user_group_detail(
    group_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserGroupDetailResponse:
    try:
        detail = get_user_group_detail(db, actor, group_id)
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserGroupDetailResponse.model_validate(detail)


@user_management_router.patch(
    "/api/v1/user-groups/{group_id}",
    response_model=UserGroupDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_group_update(
    group_id: str,
    payload: UserGroupUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserGroupDetailResponse:
    try:
        detail = update_user_group(
            db,
            actor,
            group_id=group_id,
            name=payload.name,
            description=payload.description,
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserGroupDetailResponse.model_validate(detail)


@user_management_router.delete(
    "/api/v1/user-groups/{group_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
def user_group_delete(
    group_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    try:
        result = delete_user_group(db, actor, group_id=group_id)
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return MessageResponse.model_validate(result)


@user_management_router.post(
    "/api/v1/user-groups/{group_id}/members",
    response_model=UserGroupDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_group_members_add(
    group_id: str,
    payload: UserGroupMembersUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserGroupDetailResponse:
    try:
        detail = add_user_group_members(
            db, actor, group_id=group_id, user_ids=payload.user_ids
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserGroupDetailResponse.model_validate(detail)


@user_management_router.delete(
    "/api/v1/user-groups/{group_id}/members/{user_id}",
    response_model=UserGroupDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def user_group_members_remove(
    group_id: str,
    user_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> UserGroupDetailResponse:
    try:
        detail = remove_user_group_member(
            db, actor, group_id=group_id, user_id=user_id
        )
    except UserManagementOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return UserGroupDetailResponse.model_validate(detail)
