from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from ...auth import ActorContext
from ...enums import RefreshTokenStatus, RoleCode, SessionStatus, UserStatus
from ...models import (
    AuthSecurityEvent,
    AuthSession,
    RefreshToken,
    ReportTemplate,
    Role,
    TicketReport,
    User,
    UserRole,
)
from ...security import hash_password, utcnow
from ..events.models import Event, EventRule
from ..knowledge.models import KnowledgeArticle, KnowledgeArticleLike
from ..realtime.models import UserNotification
from ..templates.models import Template
from ..tickets.models import Ticket, TicketAction, TicketComment
from .models import UserAdminAuditLog, UserGroup, UserGroupMember


class UserManagementOperationError(Exception):
    status_code: int
    detail: str | dict[str, object]

    def __init__(self, status_code: int, detail: str | dict[str, object]):
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _require_admin_actor(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise UserManagementOperationError(403, "Admin role required")


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_required_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise UserManagementOperationError(422, "Required field cannot be blank")
    return normalized


def _normalize_role_codes(role_codes: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for role_code in role_codes:
        code = role_code.strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        normalized.append(code)
    if not normalized:
        raise UserManagementOperationError(422, "At least one role is required")
    return normalized


def _normalize_group_ids(group_ids: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for group_id in group_ids or []:
        value = group_id.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _serialize_group_reference(group: UserGroup) -> dict[str, str]:
    return {"id": group.id, "name": group.name}


def _serialize_group(group: UserGroup, *, member_count: int) -> dict[str, object]:
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "member_count": member_count,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


def _serialize_user(user: User, *, groups: list[dict[str, str]]) -> dict[str, object]:
    active_roles = [
        role.role_code
        for role in sorted(
            user.roles,
            key=lambda item: ((item.role.sort_order if item.role else 9999), item.role_code),
        )
        if role.is_active and (role.expires_at is None or role.expires_at > utcnow())
    ]
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "status": user.status,
        "roles": active_roles,
        "groups": groups,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "disabled_at": user.disabled_at,
        "disabled_reason": user.disabled_reason,
    }


def _serialize_user_group_member(
    user: User, *, added_at, groups: list[dict[str, str]] | None = None
) -> dict[str, object]:
    payload = _serialize_user(user, groups=groups or [])
    return {
        "user_id": payload["id"],
        "username": payload["username"],
        "display_name": payload["display_name"],
        "email": payload["email"],
        "status": payload["status"],
        "roles": payload["roles"],
        "added_at": added_at,
    }


def _record_audit_log(
    db: Session,
    *,
    actor: ActorContext,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict[str, object] | None = None,
    after: dict[str, object] | None = None,
    meta: dict[str, object] | None = None,
) -> None:
    def to_jsonable(value: Any) -> Any:
        if isinstance(value, dict):
            return {key: to_jsonable(item) for key, item in value.items()}
        if isinstance(value, list):
            return [to_jsonable(item) for item in value]
        if isinstance(value, tuple):
            return [to_jsonable(item) for item in value]
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat()
            except TypeError:
                pass
        return value

    db.add(
        UserAdminAuditLog(
            actor_user_id=actor.user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_json=to_jsonable(before or {}),
            after_json=to_jsonable(after or {}),
            meta_json=to_jsonable(meta or {}),
        )
    )


def _get_user_or_error(db: Session, user_id: str) -> User:
    user = db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.roles).joinedload(UserRole.role))
    )
    if user is None:
        raise UserManagementOperationError(404, "User not found")
    return user


def _get_group_or_error(db: Session, group_id: str) -> UserGroup:
    group = db.scalar(select(UserGroup).where(UserGroup.id == group_id))
    if group is None:
        raise UserManagementOperationError(404, "User group not found")
    return group


def _load_groups_by_ids(db: Session, group_ids: list[str]) -> list[UserGroup]:
    if not group_ids:
        return []
    groups = list(
        db.scalars(select(UserGroup).where(UserGroup.id.in_(group_ids))).all()
    )
    found = {group.id for group in groups}
    missing = [group_id for group_id in group_ids if group_id not in found]
    if missing:
        raise UserManagementOperationError(422, "One or more user groups do not exist")
    groups.sort(key=lambda group: group_ids.index(group.id))
    return groups


def _load_roles_by_codes(db: Session, role_codes: list[str]) -> list[Role]:
    roles = list(db.scalars(select(Role).where(Role.code.in_(role_codes))).all())
    found = {role.code for role in roles}
    missing = [code for code in role_codes if code not in found]
    if missing:
        raise UserManagementOperationError(422, "One or more roles do not exist")
    roles.sort(key=lambda role: role_codes.index(role.code))
    return roles


def _group_refs_by_user_ids(db: Session, user_ids: list[str]) -> dict[str, list[dict[str, str]]]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(UserGroupMember.user_id, UserGroup)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroupMember.user_id.in_(user_ids))
        .order_by(UserGroup.name.asc())
    ).all()
    mapping: dict[str, list[dict[str, str]]] = defaultdict(list)
    for user_id, group in rows:
        mapping[user_id].append(_serialize_group_reference(group))
    return mapping


def _member_counts_by_group_ids(db: Session, group_ids: list[str]) -> dict[str, int]:
    if not group_ids:
        return {}
    rows = db.execute(
        select(UserGroupMember.group_id, func.count(UserGroupMember.id))
        .where(UserGroupMember.group_id.in_(group_ids))
        .group_by(UserGroupMember.group_id)
    ).all()
    return {group_id: int(count) for group_id, count in rows}


def _count_effective_admins(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count(func.distinct(User.id)))
            .join(UserRole, UserRole.user_id == User.id)
            .where(
                User.status == UserStatus.ACTIVE.value,
                UserRole.role_code == RoleCode.ADMIN.value,
                UserRole.is_active.is_(True),
                or_(UserRole.expires_at.is_(None), UserRole.expires_at > utcnow()),
            )
        )
        or 0
    )


def _user_is_effective_admin(user: User) -> bool:
    return (
        user.status == UserStatus.ACTIVE.value
        and any(
            role.role_code == RoleCode.ADMIN.value
            and role.is_active
            and (role.expires_at is None or role.expires_at > utcnow())
            for role in user.roles
        )
    )


def _assert_not_last_effective_admin(db: Session, user: User) -> None:
    if _user_is_effective_admin(user) and _count_effective_admins(db) <= 1:
        raise UserManagementOperationError(409, "Cannot change the last effective ADMIN")


def _set_user_group_memberships(
    db: Session, *, user_id: str, group_ids: list[str]
) -> None:
    existing = list(
        db.scalars(select(UserGroupMember).where(UserGroupMember.user_id == user_id)).all()
    )
    desired = set(group_ids)
    for membership in existing:
        if membership.group_id not in desired:
            db.delete(membership)
    existing_group_ids = {membership.group_id for membership in existing}
    for group_id in group_ids:
        if group_id not in existing_group_ids:
            db.add(UserGroupMember(user_id=user_id, group_id=group_id))


def _revoke_user_sessions(db: Session, *, user_id: str, reason: str) -> None:
    active_sessions = list(
        db.scalars(
            select(AuthSession).where(
                AuthSession.user_id == user_id,
                AuthSession.status == SessionStatus.ACTIVE.value,
            )
        ).all()
    )
    for session_record in active_sessions:
        session_record.status = SessionStatus.REVOKED.value
        session_record.revoked_at = utcnow()
        session_record.revoke_reason = reason
        refresh_rows = list(
            db.scalars(
                select(RefreshToken).where(
                    RefreshToken.session_id == session_record.id,
                    RefreshToken.status.in_(
                        [
                            RefreshTokenStatus.ACTIVE.value,
                            RefreshTokenStatus.ROTATED.value,
                        ]
                    ),
                )
            ).all()
        )
        for row in refresh_rows:
            row.status = RefreshTokenStatus.REVOKED.value
            row.revoked_at = utcnow()
            row.revoke_reason = reason


def has_business_participation(db: Session, *, user_id: str) -> bool:
    checks = (
        select(Ticket.id).where(
            or_(
                Ticket.created_by_user_id == user_id,
                Ticket.customer_user_id == user_id,
                Ticket.assigned_to_user_id == user_id,
            )
        ),
        select(TicketComment.id).where(TicketComment.actor_user_id == user_id),
        select(TicketAction.id).where(TicketAction.actor_user_id == user_id),
        select(KnowledgeArticle.id).where(
            or_(
                KnowledgeArticle.created_by_user_id == user_id,
                KnowledgeArticle.updated_by_user_id == user_id,
            )
        ),
        select(KnowledgeArticleLike.id).where(KnowledgeArticleLike.user_id == user_id),
        select(Event.id).where(Event.created_by_user_id == user_id),
        select(EventRule.id).where(
            or_(
                EventRule.created_by_user_id == user_id,
                EventRule.updated_by_user_id == user_id,
            )
        ),
        select(Template.id).where(
            or_(
                Template.created_by_user_id == user_id,
                Template.updated_by_user_id == user_id,
            )
        ),
        select(UserNotification.id).where(UserNotification.user_id == user_id),
        select(ReportTemplate.id).where(
            or_(
                ReportTemplate.created_by_user_id == user_id,
                ReportTemplate.updated_by_user_id == user_id,
            )
        ),
        select(TicketReport.id).where(TicketReport.uploaded_by_user_id == user_id),
        select(AuthSecurityEvent.id).where(AuthSecurityEvent.user_id == user_id),
        select(AuthSession.id).where(AuthSession.user_id == user_id),
    )
    for statement in checks:
        if db.scalar(statement.limit(1)) is not None:
            return True
    return False


def list_users(
    db: Session,
    actor: ActorContext,
    *,
    search: str | None = None,
    status: str | None = None,
    role_code: str | None = None,
    group_id: str | None = None,
) -> tuple[list[dict[str, object]], int]:
    _require_admin_actor(actor)

    statement = select(User).options(selectinload(User.roles).joinedload(UserRole.role))
    if search and search.strip():
        query = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                User.username.ilike(query),
                User.display_name.ilike(query),
                User.email.ilike(query),
            )
        )
    if status and status.strip():
        statement = statement.where(User.status == status.strip().lower())
    if role_code and role_code.strip():
        statement = statement.join(UserRole, UserRole.user_id == User.id).where(
            UserRole.role_code == role_code.strip().upper(),
            UserRole.is_active.is_(True),
        )
    if group_id and group_id.strip():
        statement = statement.join(
            UserGroupMember, UserGroupMember.user_id == User.id
        ).where(UserGroupMember.group_id == group_id.strip())

    users = list(
        db.scalars(statement.distinct().order_by(User.updated_at.desc(), User.username.asc())).all()
    )
    group_refs = _group_refs_by_user_ids(db, [user.id for user in users])
    items = [_serialize_user(user, groups=group_refs.get(user.id, [])) for user in users]
    return items, len(items)


def get_user_detail(db: Session, actor: ActorContext, user_id: str) -> dict[str, object]:
    _require_admin_actor(actor)
    user = _get_user_or_error(db, user_id)
    group_refs = _group_refs_by_user_ids(db, [user.id])
    return {"user": _serialize_user(user, groups=group_refs.get(user.id, []))}


def create_user(
    db: Session,
    actor: ActorContext,
    *,
    username: str,
    display_name: str,
    email: str | None,
    password: str,
    role_codes: list[str],
    group_ids: list[str],
) -> dict[str, object]:
    _require_admin_actor(actor)

    normalized_username = _normalize_required_text(username)
    normalized_display_name = _normalize_required_text(display_name)
    normalized_email = _normalize_optional_text(email)
    normalized_role_codes = _normalize_role_codes(role_codes)
    normalized_group_ids = _normalize_group_ids(group_ids)

    if db.scalar(select(User).where(func.lower(User.username) == normalized_username.lower())) is not None:
        raise UserManagementOperationError(409, "Username already exists")
    if normalized_email and db.scalar(
        select(User).where(func.lower(User.email) == normalized_email.lower())
    ) is not None:
        raise UserManagementOperationError(409, "Email already exists")

    _load_roles_by_codes(db, normalized_role_codes)
    groups = _load_groups_by_ids(db, normalized_group_ids)

    user = User(
        username=normalized_username,
        display_name=normalized_display_name,
        email=normalized_email,
        password_hash=hash_password(password),
        status=UserStatus.ACTIVE.value,
        created_by=actor.user_id,
        updated_by=actor.user_id,
    )
    db.add(user)
    db.flush()

    for index, role_code in enumerate(normalized_role_codes):
        db.add(
            UserRole(
                user_id=user.id,
                role_code=role_code,
                is_primary=index == 0,
                assigned_by=actor.user_id,
            )
        )

    for group in groups:
        db.add(UserGroupMember(user_id=user.id, group_id=group.id))

    db.flush()
    refreshed = _get_user_or_error(db, user.id)
    after_payload = _serialize_user(
        refreshed, groups=[_serialize_group_reference(group) for group in groups]
    )
    _record_audit_log(
        db,
        actor=actor,
        action="user.create",
        entity_type="user",
        entity_id=user.id,
        after=after_payload,
    )
    db.commit()
    return {"user": after_payload}


def update_user(
    db: Session,
    actor: ActorContext,
    *,
    user_id: str,
    display_name: str | None,
    email: str | None,
    group_ids: list[str] | None,
) -> dict[str, object]:
    _require_admin_actor(actor)
    user = _get_user_or_error(db, user_id)
    before_groups = _group_refs_by_user_ids(db, [user.id]).get(user.id, [])
    before_payload = _serialize_user(user, groups=before_groups)

    if display_name is not None:
        user.display_name = _normalize_required_text(display_name)
    if email is not None:
        normalized_email = _normalize_optional_text(email)
        existing = None
        if normalized_email:
            existing = db.scalar(
                select(User).where(
                    func.lower(User.email) == normalized_email.lower(),
                    User.id != user.id,
                )
            )
        if existing is not None:
            raise UserManagementOperationError(409, "Email already exists")
        user.email = normalized_email
    if group_ids is not None:
        normalized_group_ids = _normalize_group_ids(group_ids)
        _load_groups_by_ids(db, normalized_group_ids)
        _set_user_group_memberships(db, user_id=user.id, group_ids=normalized_group_ids)

    user.updated_by = actor.user_id
    db.flush()
    updated = _get_user_or_error(db, user.id)
    after_groups = _group_refs_by_user_ids(db, [updated.id]).get(updated.id, [])
    after_payload = _serialize_user(updated, groups=after_groups)
    _record_audit_log(
        db,
        actor=actor,
        action="user.update",
        entity_type="user",
        entity_id=user.id,
        before=before_payload,
        after=after_payload,
    )
    db.commit()
    return {"user": after_payload}


def update_user_status(
    db: Session,
    actor: ActorContext,
    *,
    user_id: str,
    status: str,
    reason: str | None,
) -> dict[str, object]:
    _require_admin_actor(actor)
    user = _get_user_or_error(db, user_id)
    before_groups = _group_refs_by_user_ids(db, [user.id]).get(user.id, [])
    before_payload = _serialize_user(user, groups=before_groups)
    target_status = status.strip().lower()

    if target_status not in {UserStatus.ACTIVE.value, UserStatus.DISABLED.value}:
        raise UserManagementOperationError(422, "Unsupported status")

    if target_status == user.status:
        raise UserManagementOperationError(
            409,
            "User is already in the requested status",
        )

    if target_status == UserStatus.DISABLED.value:
        _assert_not_last_effective_admin(db, user)
        user.status = UserStatus.DISABLED.value
        user.disabled_at = utcnow()
        user.disabled_reason = _normalize_optional_text(reason)
        user.token_version += 1
        _revoke_user_sessions(db, user_id=user.id, reason="user_disabled")
        action = "user.disable"
    else:
        user.status = UserStatus.ACTIVE.value
        user.disabled_at = None
        user.disabled_reason = None
        action = "user.enable"

    user.updated_by = actor.user_id
    db.flush()
    updated = _get_user_or_error(db, user.id)
    after_groups = _group_refs_by_user_ids(db, [updated.id]).get(updated.id, [])
    after_payload = _serialize_user(updated, groups=after_groups)
    _record_audit_log(
        db,
        actor=actor,
        action=action,
        entity_type="user",
        entity_id=user.id,
        before=before_payload,
        after=after_payload,
        meta={"reason": _normalize_optional_text(reason)},
    )
    db.commit()
    return {"user": after_payload}


def delete_user(db: Session, actor: ActorContext, *, user_id: str) -> dict[str, str]:
    _require_admin_actor(actor)
    user = _get_user_or_error(db, user_id)
    before_groups = _group_refs_by_user_ids(db, [user.id]).get(user.id, [])
    before_payload = _serialize_user(user, groups=before_groups)

    _assert_not_last_effective_admin(db, user)
    if has_business_participation(db, user_id=user.id):
        raise UserManagementOperationError(409, "User has business participation and cannot be deleted")

    memberships = list(
        db.scalars(select(UserGroupMember).where(UserGroupMember.user_id == user.id)).all()
    )
    for membership in memberships:
        db.delete(membership)
    db.delete(user)
    _record_audit_log(
        db,
        actor=actor,
        action="user.delete",
        entity_type="user",
        entity_id=user.id,
        before=before_payload,
    )
    db.commit()
    return {"message": "User deleted"}


def list_user_groups(
    db: Session, actor: ActorContext, *, search: str | None = None
) -> tuple[list[dict[str, object]], int]:
    _require_admin_actor(actor)
    statement = select(UserGroup)
    if search and search.strip():
        query = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                UserGroup.name.ilike(query),
                UserGroup.description.ilike(query),
            )
        )
    groups = list(
        db.scalars(statement.order_by(UserGroup.updated_at.desc(), UserGroup.name.asc())).all()
    )
    counts = _member_counts_by_group_ids(db, [group.id for group in groups])
    items = [
        _serialize_group(group, member_count=counts.get(group.id, 0)) for group in groups
    ]
    return items, len(items)


def get_user_group_detail(
    db: Session, actor: ActorContext, group_id: str
) -> dict[str, object]:
    _require_admin_actor(actor)
    group = _get_group_or_error(db, group_id)
    member_rows = db.execute(
        select(UserGroupMember, User)
        .join(
            User,
            User.id == UserGroupMember.user_id,
        )
        .where(UserGroupMember.group_id == group.id)
        .options(selectinload(User.roles).joinedload(UserRole.role))
        .order_by(User.display_name.asc(), User.username.asc())
    ).all()
    members = [
        _serialize_user_group_member(user, added_at=membership.created_at)
        for membership, user in member_rows
    ]
    return {
        "group": _serialize_group(group, member_count=len(members)),
        "members": members,
    }


def create_user_group(
    db: Session,
    actor: ActorContext,
    *,
    name: str,
    description: str | None,
) -> dict[str, object]:
    _require_admin_actor(actor)
    normalized_name = _normalize_required_text(name)
    normalized_description = _normalize_optional_text(description)

    existing = db.scalar(
        select(UserGroup).where(func.lower(UserGroup.name) == normalized_name.lower())
    )
    if existing is not None:
        raise UserManagementOperationError(409, "User group name already exists")

    group = UserGroup(
        name=normalized_name,
        description=normalized_description,
        created_by_user_id=actor.user_id,
        updated_by_user_id=actor.user_id,
    )
    db.add(group)
    db.flush()
    payload = _serialize_group(group, member_count=0)
    _record_audit_log(
        db,
        actor=actor,
        action="group.create",
        entity_type="user_group",
        entity_id=group.id,
        after=payload,
    )
    db.commit()
    return {"group": payload, "members": []}


def update_user_group(
    db: Session,
    actor: ActorContext,
    *,
    group_id: str,
    name: str | None,
    description: str | None,
) -> dict[str, object]:
    _require_admin_actor(actor)
    group = _get_group_or_error(db, group_id)
    before_payload = _serialize_group(
        group, member_count=_member_counts_by_group_ids(db, [group.id]).get(group.id, 0)
    )

    if name is not None:
        normalized_name = _normalize_required_text(name)
        existing = db.scalar(
            select(UserGroup).where(
                func.lower(UserGroup.name) == normalized_name.lower(),
                UserGroup.id != group.id,
            )
        )
        if existing is not None:
            raise UserManagementOperationError(409, "User group name already exists")
        group.name = normalized_name
    if description is not None:
        group.description = _normalize_optional_text(description)
    group.updated_by_user_id = actor.user_id
    db.flush()
    member_count = _member_counts_by_group_ids(db, [group.id]).get(group.id, 0)
    after_payload = _serialize_group(group, member_count=member_count)
    _record_audit_log(
        db,
        actor=actor,
        action="group.update",
        entity_type="user_group",
        entity_id=group.id,
        before=before_payload,
        after=after_payload,
    )
    db.commit()
    return {"group": after_payload, "members": []}


def delete_user_group(
    db: Session, actor: ActorContext, *, group_id: str
) -> dict[str, str]:
    _require_admin_actor(actor)
    group = _get_group_or_error(db, group_id)
    member_count = _member_counts_by_group_ids(db, [group.id]).get(group.id, 0)
    if member_count > 0:
        raise UserManagementOperationError(409, "User group still has members")
    before_payload = _serialize_group(group, member_count=0)
    db.delete(group)
    _record_audit_log(
        db,
        actor=actor,
        action="group.delete",
        entity_type="user_group",
        entity_id=group.id,
        before=before_payload,
    )
    db.commit()
    return {"message": "User group deleted"}


def add_user_group_members(
    db: Session,
    actor: ActorContext,
    *,
    group_id: str,
    user_ids: list[str],
) -> dict[str, object]:
    _require_admin_actor(actor)
    group = _get_group_or_error(db, group_id)
    normalized_user_ids = _normalize_group_ids(user_ids)
    users = list(
        db.scalars(
            select(User)
            .where(User.id.in_(normalized_user_ids))
            .options(selectinload(User.roles).joinedload(UserRole.role))
        ).all()
    )
    found_user_ids = {user.id for user in users}
    if len(found_user_ids) != len(normalized_user_ids):
        raise UserManagementOperationError(404, "One or more users do not exist")

    existing = set(
        db.scalars(
            select(UserGroupMember.user_id).where(
                UserGroupMember.group_id == group.id,
                UserGroupMember.user_id.in_(normalized_user_ids),
            )
        ).all()
    )
    if existing:
        raise UserManagementOperationError(409, "One or more users already belong to this group")

    for user_id in normalized_user_ids:
        db.add(UserGroupMember(group_id=group.id, user_id=user_id))

    db.flush()
    detail = get_user_group_detail(db, actor, group.id)
    _record_audit_log(
        db,
        actor=actor,
        action="group.members.add",
        entity_type="user_group",
        entity_id=group.id,
        after={"user_ids": normalized_user_ids},
    )
    db.commit()
    return detail


def remove_user_group_member(
    db: Session,
    actor: ActorContext,
    *,
    group_id: str,
    user_id: str,
) -> dict[str, object]:
    _require_admin_actor(actor)
    group = _get_group_or_error(db, group_id)
    membership = db.scalar(
        select(UserGroupMember).where(
            UserGroupMember.group_id == group.id,
            UserGroupMember.user_id == user_id,
        )
    )
    if membership is None:
        raise UserManagementOperationError(404, "User is not a member of the group")

    db.delete(membership)
    db.flush()
    detail = get_user_group_detail(db, actor, group.id)
    _record_audit_log(
        db,
        actor=actor,
        action="group.members.remove",
        entity_type="user_group",
        entity_id=group.id,
        before={"user_id": user_id},
    )
    db.commit()
    return detail
