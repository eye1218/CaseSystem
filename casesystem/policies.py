from __future__ import annotations

from dataclasses import dataclass

from casesystem.enums import RoleCode


ROLE_PERMISSIONS: dict[RoleCode, set[str]] = {
    RoleCode.ADMIN: {"config:manage", "security:read", "auth:self"},
    RoleCode.T1: {"auth:self"},
    RoleCode.T2: {"auth:self"},
    RoleCode.T3: {"auth:self"},
    RoleCode.CUSTOMER: {"auth:self"},
}


@dataclass(frozen=True)
class ObjectScope:
    owner_user_id: str | None = None
    customer_user_id: str | None = None
    allowed_roles: tuple[RoleCode, ...] = ()


def has_permission(active_role: str, permission: str) -> bool:
    try:
        return permission in ROLE_PERMISSIONS[RoleCode(active_role)]
    except ValueError:
        return False


def has_object_access(*, user_id: str, active_role: str, scope: ObjectScope) -> bool:
    role = RoleCode(active_role)
    if role == RoleCode.CUSTOMER:
        return scope.customer_user_id == user_id
    if scope.owner_user_id and scope.owner_user_id == user_id:
        return True
    return role in scope.allowed_roles

