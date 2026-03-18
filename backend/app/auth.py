from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import timedelta

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session, joinedload

from app.config import Settings
from app.enums import CounterType, RefreshTokenStatus, RoleCode, SecurityEventType, SessionStatus, UserStatus
from app.models import ApiToken, AuthLoginCounter, AuthSecurityEvent, AuthSession, CsrfToken, RefreshToken, User, UserRole, UserRoleSession
from app.policies import ObjectScope, has_object_access, has_permission
from app.schemas import AuthResponse, AuthenticatedUser
from app.security import (
    coerce_utc_datetime,
    create_access_token,
    decode_access_token,
    generate_csrf_token,
    generate_refresh_token,
    hash_opaque_token,
    hash_password,
    maybe_rehash_password,
    utcnow,
    verify_password,
)

GENERIC_LOGIN_FAILURE_MESSAGE = "用户名或密码错误，或当前登录暂不可用"


@dataclass
class ActorContext:
    user_id: str
    username: str
    display_name: str
    session_id: str
    active_role: str
    roles: list[str]
    token_version: int
    role_version: int

    def to_user_schema(self) -> AuthenticatedUser:
        return AuthenticatedUser(
            id=self.user_id,
            username=self.username,
            display_name=self.display_name,
            status=UserStatus.ACTIVE.value,
            token_version=self.token_version,
            role_version=self.role_version,
            active_role=self.active_role,
            roles=self.roles,
        )


class AuthService:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings

    def issue_anonymous_csrf(self, response: Response) -> str:
        token = generate_csrf_token()
        expires_at = utcnow() + timedelta(minutes=self.settings.csrf_token_ttl_minutes)
        self.db.add(CsrfToken(token_hash=hash_opaque_token(token), expires_at=expires_at, session_id=None))
        self.db.commit()
        self._set_csrf_cookie(response, token)
        return token

    def validate_csrf(self, request: Request) -> None:
        cookie_token = request.cookies.get("XSRF-TOKEN")
        header_token = request.headers.get("X-CSRF-Token")
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        if not cookie_token or not header_token or cookie_token != header_token:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")
        if not self._allows_all_origins():
            if not origin and not referer:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin or Referer is required")
            if origin and origin not in self.settings.allowed_origins:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed")
            if referer and not any(referer.startswith(allowed) for allowed in self.settings.allowed_origins):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Referer not allowed")
        csrf_row = self.db.scalar(select(CsrfToken).where(CsrfToken.token_hash == hash_opaque_token(cookie_token)))
        expires_at = coerce_utc_datetime(csrf_row.expires_at) if csrf_row else None
        if csrf_row is None or expires_at is None or expires_at <= utcnow():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token expired")

    def _allows_all_origins(self) -> bool:
        return "*" in self.settings.allowed_origins

    def login(self, *, request: Request, response: Response, username: str, password: str) -> AuthResponse:
        ip_address = self._resolve_ip_address(request)
        user_agent = request.headers.get("user-agent")
        self._check_login_limits(username=username, ip_address=ip_address)
        user = self.db.scalar(select(User).where(User.username == username))
        if user is None:
            self._register_login_failure(
                username=username,
                ip_address=ip_address,
                user_agent=user_agent,
                event_type=SecurityEventType.USER_NOT_FOUND.value,
            )
            self._raise_login_failed()
        if user.status != UserStatus.ACTIVE.value:
            self._record_security_event(
                user=user,
                username_input=username,
                ip_address=ip_address,
                user_agent=user_agent,
                event_type=SecurityEventType.USER_DISABLED.value,
            )
            self._raise_login_failed()
        lock_until = coerce_utc_datetime(user.lock_until)
        if lock_until and lock_until > utcnow():
            self._record_security_event(
                user=user,
                username_input=username,
                ip_address=ip_address,
                user_agent=user_agent,
                event_type=SecurityEventType.ACCOUNT_TEMP_LOCKED.value,
                detail={"lock_until": lock_until.isoformat()},
            )
            self._raise_login_failed()
        if not verify_password(password, user.password_hash):
            self._register_login_failure(
                username=username,
                ip_address=ip_address,
                user=user,
                user_agent=user_agent,
                event_type=SecurityEventType.PASSWORD_MISMATCH.value,
            )
            self._raise_login_failed()
        rehashed = maybe_rehash_password(password, user.password_hash)
        if rehashed:
            user.password_hash = rehashed
        self._clear_login_counters(username=username, ip_address=ip_address)
        user.last_login_at = utcnow()
        session_record = AuthSession(
            user_id=user.id,
            session_family_id=str(uuid.uuid4()),
            status=SessionStatus.ACTIVE.value,
            client_type="web",
            user_agent=user_agent,
            ip_address=ip_address,
            last_seen_at=utcnow(),
        )
        self.db.add(session_record)
        self.db.flush()
        active_role = self._resolve_default_role(user)
        self.db.add(UserRoleSession(session_id=session_record.id, user_id=user.id, active_role_code=active_role))
        refresh_token, refresh_row = self._create_refresh_token(session_id=session_record.id)
        self.db.add(refresh_row)
        self._record_security_event(
            user=user,
            username_input=username,
            ip_address=ip_address,
            user_agent=user_agent,
            event_type=SecurityEventType.LOGIN_SUCCESS.value,
            detail={"session_id": session_record.id},
        )
        self.db.commit()
        csrf_token = self._rotate_csrf_token(session_id=session_record.id)
        access_token = create_access_token(
            settings=self.settings,
            user_id=user.id,
            session_id=session_record.id,
            token_version=user.token_version,
            role_version=user.role_version,
        )
        self._set_auth_cookies(response=response, access_token=access_token, refresh_token=refresh_token, csrf_token=csrf_token)
        actor = self._build_actor_context(session_id=session_record.id, user=user, active_role=active_role)
        return AuthResponse(user=actor.to_user_schema(), session_id=session_record.id)

    def authenticate_request(self, request: Request) -> ActorContext:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header.removeprefix("Bearer ").strip()
            if raw_token.startswith("csk_"):
                return self.authenticate_api_token(raw_token)
        token = request.cookies.get(self._access_cookie_name)
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        claims = self._decode_access_token_or_error(token)
        return self._authenticate_claims(claims)

    def authenticate_token(self, token: str) -> ActorContext:
        claims = self._decode_access_token_or_error(token)
        return self._authenticate_claims(claims)

    def authenticate_api_token(self, raw_token: str) -> ActorContext:
        token_hash = hash_opaque_token(raw_token)
        token_row = self.db.scalar(select(ApiToken).where(ApiToken.token_hash == token_hash))
        if token_row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API token")
        if token_row.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API token revoked")
        expires_at = coerce_utc_datetime(token_row.expires_at)
        if expires_at is not None and expires_at <= utcnow():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API token expired")
        user = self.db.scalar(select(User).where(User.id == token_row.user_id))
        if user is None or user.status != UserStatus.ACTIVE.value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
        token_row.last_used_at = utcnow()
        self.db.commit()
        return self._build_actor_context(
            session_id=f"token:{token_row.id}",
            user=user,
            active_role=token_row.active_role_code,
        )

    def create_api_token(
        self, *, user_id: str, name: str, active_role_code: str, created_by: str
    ) -> tuple[str, ApiToken]:
        user_role = self.db.scalar(
            select(UserRole).where(
                UserRole.user_id == user_id,
                UserRole.role_code == active_role_code,
                UserRole.is_active.is_(True),
            )
        )
        if user_role is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role is not assigned to the user")
        raw_token = "csk_" + generate_refresh_token()
        token_row = ApiToken(
            user_id=user_id,
            name=name,
            token_hash=hash_opaque_token(raw_token),
            active_role_code=active_role_code,
            status="active",
            created_by=created_by,
        )
        self.db.add(token_row)
        self.db.commit()
        self.db.refresh(token_row)
        return raw_token, token_row

    def revoke_api_token(self, *, token_id: str, actor: ActorContext) -> None:
        token_row = self.db.scalar(select(ApiToken).where(ApiToken.id == token_id))
        if token_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        if token_row.user_id != actor.user_id and not has_permission(actor.active_role, "config:manage"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        token_row.status = "revoked"
        token_row.revoked_at = utcnow()
        self.db.commit()

    def delete_api_token(self, *, token_id: str, actor: ActorContext) -> None:
        token_row = self.db.scalar(select(ApiToken).where(ApiToken.id == token_id))
        if token_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
        if token_row.user_id != actor.user_id and not has_permission(actor.active_role, "config:manage"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        if token_row.status == "active":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete an active token; revoke it first")
        self.db.delete(token_row)
        self.db.commit()

    def list_api_tokens(self, *, user_id: str) -> list[ApiToken]:
        return list(self.db.scalars(select(ApiToken).where(ApiToken.user_id == user_id)).all())

    def issue_socket_token(self, actor: ActorContext) -> str:
        user = self.db.scalar(select(User).where(User.id == actor.user_id))
        if user is None or user.status != UserStatus.ACTIVE.value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
        session_record = self.db.scalar(select(AuthSession).where(AuthSession.id == actor.session_id))
        if session_record is None or session_record.status != SessionStatus.ACTIVE.value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is not active")
        return create_access_token(
            settings=self.settings,
            user_id=user.id,
            session_id=session_record.id,
            token_version=user.token_version,
            role_version=user.role_version,
            ttl_minutes=self.settings.realtime_socket_token_ttl_minutes,
        )

    def refresh(self, *, request: Request, response: Response) -> AuthResponse:
        refresh_token = request.cookies.get(self._refresh_cookie_name)
        if not refresh_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")
        token_hash = hash_opaque_token(refresh_token)
        token_row = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        if token_row is None:
            self._clear_auth_cookies(response)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid")
        session_record = self.db.scalar(select(AuthSession).where(AuthSession.id == token_row.session_id))
        if session_record is None:
            self._clear_auth_cookies(response)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session missing")
        user = self.db.scalar(select(User).where(User.id == session_record.user_id))
        if token_row.status != RefreshTokenStatus.ACTIVE.value or token_row.used_at is not None:
            self._handle_refresh_reuse(token_row=token_row, session_record=session_record, user=user, response=response, request=request)
        token_expires_at = coerce_utc_datetime(token_row.expires_at)
        if (
            token_expires_at is None
            or token_expires_at <= utcnow()
            or session_record.status != SessionStatus.ACTIVE.value
            or user is None
        ):
            self._clear_auth_cookies(response)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
        token_row.status = RefreshTokenStatus.ROTATED.value
        token_row.used_at = utcnow()
        new_refresh_token, new_row = self._create_refresh_token(
            session_id=session_record.id,
            token_family_id=token_row.token_family_id,
            rotated_from_id=token_row.id,
        )
        self.db.add(new_row)
        session_record.last_seen_at = utcnow()
        self.db.commit()
        csrf_token = self._rotate_csrf_token(session_id=session_record.id)
        access_token = create_access_token(
            settings=self.settings,
            user_id=user.id,
            session_id=session_record.id,
            token_version=user.token_version,
            role_version=user.role_version,
        )
        self._set_auth_cookies(response=response, access_token=access_token, refresh_token=new_refresh_token, csrf_token=csrf_token)
        role_session = self.db.scalar(select(UserRoleSession).where(UserRoleSession.session_id == session_record.id))
        actor = self._build_actor_context(session_id=session_record.id, user=user, active_role=role_session.active_role_code)
        return AuthResponse(user=actor.to_user_schema(), session_id=session_record.id)

    def logout(self, *, actor: ActorContext, response: Response) -> None:
        session_record = self.db.scalar(select(AuthSession).where(AuthSession.id == actor.session_id))
        if session_record:
            self._revoke_session(session_record=session_record, reason="logout", compromised=False)
            self._record_security_event(
                user=self.db.scalar(select(User).where(User.id == actor.user_id)),
                username_input=actor.username,
                ip_address=None,
                user_agent=None,
                event_type=SecurityEventType.SESSION_REVOKED.value,
                detail={"session_id": actor.session_id, "reason": "logout"},
            )
        self.db.execute(delete(CsrfToken).where(CsrfToken.session_id == actor.session_id))
        self.db.commit()
        self._clear_auth_cookies(response)

    def change_password(self, *, actor: ActorContext, current_password: str, new_password: str, response: Response) -> None:
        user = self.db.scalar(select(User).where(User.id == actor.user_id))
        if user is None or not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is invalid")
        user.password_hash = hash_password(new_password)
        user.token_version += 1
        user.password_changed_at = utcnow()
        active_sessions = self.db.scalars(
            select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.status == SessionStatus.ACTIVE.value)
        ).all()
        for session_record in active_sessions:
            self._revoke_session(session_record=session_record, reason="password_changed", compromised=False)
        self.db.execute(delete(CsrfToken).where(or_(CsrfToken.session_id == actor.session_id, CsrfToken.session_id.is_(None))))
        self._record_security_event(
            user=user,
            username_input=user.username,
            ip_address=None,
            user_agent=None,
            event_type=SecurityEventType.PASSWORD_CHANGED.value,
        )
        self.db.commit()
        self._clear_auth_cookies(response)

    def switch_role(self, *, actor: ActorContext, active_role_code: str) -> AuthResponse:
        user_role = self.db.scalar(
            select(UserRole).where(
                UserRole.user_id == actor.user_id,
                UserRole.role_code == active_role_code,
                UserRole.is_active.is_(True),
            )
        )
        if user_role is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role is not assigned to the user")
        role_session = self.db.scalar(select(UserRoleSession).where(UserRoleSession.session_id == actor.session_id))
        role_session.active_role_code = active_role_code
        role_session.switched_at = utcnow()
        self._record_security_event(
            user=self.db.scalar(select(User).where(User.id == actor.user_id)),
            username_input=actor.username,
            ip_address=None,
            user_agent=None,
            event_type=SecurityEventType.ROLE_SWITCHED.value,
            detail={"session_id": actor.session_id, "active_role_code": active_role_code},
        )
        self.db.commit()
        user = self.db.scalar(select(User).where(User.id == actor.user_id))
        updated_actor = self._build_actor_context(session_id=actor.session_id, user=user, active_role=active_role_code)
        return AuthResponse(user=updated_actor.to_user_schema(), session_id=actor.session_id)

    def require_permission(self, actor: ActorContext, permission: str) -> None:
        if not has_permission(actor.active_role, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    def require_object_access(self, actor: ActorContext, scope: ObjectScope) -> None:
        if not has_object_access(user_id=actor.user_id, active_role=actor.active_role, scope=scope):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Object access denied")

    def _decode_access_token_or_error(self, token: str) -> dict[str, object]:
        from jwt import ExpiredSignatureError, InvalidTokenError

        try:
            return decode_access_token(token, self.settings)
        except ExpiredSignatureError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token expired") from exc
        except InvalidTokenError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from exc

    def _authenticate_claims(self, claims: dict[str, object]) -> ActorContext:
        user_id = claims.get("sub")
        session_id = claims.get("sid")
        token_version = claims.get("tv")
        role_version = claims.get("rv")
        if not isinstance(user_id, str) or not isinstance(session_id, str):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")

        user = self.db.scalar(select(User).where(User.id == user_id))
        if user is None or user.status != UserStatus.ACTIVE.value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
        session_record = self.db.scalar(select(AuthSession).where(AuthSession.id == session_id))
        if session_record is None or session_record.status != SessionStatus.ACTIVE.value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is not active")
        if user.token_version != token_version or user.role_version != role_version:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token version mismatch")
        session_record.last_seen_at = utcnow()
        role_session = self.db.scalar(select(UserRoleSession).where(UserRoleSession.session_id == session_record.id))
        if role_session is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Role session missing")
        self.db.commit()
        return self._build_actor_context(
            session_id=session_record.id,
            user=user,
            active_role=role_session.active_role_code,
        )

    def _build_actor_context(self, *, session_id: str, user: User, active_role: str) -> ActorContext:
        roles = sorted(
            {
                role.role_code
                for role in user.roles
                if role.is_active
                and (
                    role.expires_at is None
                    or (
                        coerce_utc_datetime(role.expires_at) is not None
                        and coerce_utc_datetime(role.expires_at) > utcnow()
                    )
                )
            }
        )
        return ActorContext(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            session_id=session_id,
            active_role=active_role,
            roles=roles,
            token_version=user.token_version,
            role_version=user.role_version,
        )

    def _resolve_default_role(self, user: User) -> str:
        active_roles = [
            role
            for role in user.roles
            if role.is_active
            and (
                role.expires_at is None
                or (
                    coerce_utc_datetime(role.expires_at) is not None
                    and coerce_utc_datetime(role.expires_at) > utcnow()
                )
            )
        ]
        if not active_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User has no active roles")
        primary = next((role for role in active_roles if role.is_primary), None)
        if primary:
            return primary.role_code
        ordered = sorted(active_roles, key=lambda item: (item.role.sort_order, item.role_code))
        return ordered[0].role_code

    def _create_refresh_token(
        self, *, session_id: str, token_family_id: str | None = None, rotated_from_id: str | None = None
    ) -> tuple[str, RefreshToken]:
        token = generate_refresh_token()
        family_id = token_family_id or str(uuid.uuid4())
        refresh_row = RefreshToken(
            session_id=session_id,
            token_family_id=family_id,
            token_hash=hash_opaque_token(token),
            rotated_from_id=rotated_from_id,
            status=RefreshTokenStatus.ACTIVE.value,
            expires_at=utcnow() + timedelta(days=self.settings.refresh_token_ttl_days),
        )
        return token, refresh_row

    def _rotate_csrf_token(self, *, session_id: str) -> str:
        self.db.execute(delete(CsrfToken).where(or_(CsrfToken.session_id == session_id, CsrfToken.session_id.is_(None))))
        token = generate_csrf_token()
        self.db.add(
            CsrfToken(
                session_id=session_id,
                token_hash=hash_opaque_token(token),
                expires_at=utcnow() + timedelta(minutes=self.settings.csrf_token_ttl_minutes),
            )
        )
        self.db.commit()
        return token

    def _handle_refresh_reuse(
        self,
        *,
        token_row: RefreshToken,
        session_record: AuthSession,
        user: User | None,
        response: Response,
        request: Request,
    ) -> None:
        family_rows = self.db.scalars(
            select(RefreshToken).where(RefreshToken.token_family_id == token_row.token_family_id)
        ).all()
        self._revoke_session(session_record=session_record, reason="refresh_token_reused", compromised=True)
        for row in family_rows:
            row.status = RefreshTokenStatus.REUSED_DETECTED.value
            row.revoked_at = utcnow()
            row.revoke_reason = "refresh_token_reused"
        self._record_security_event(
            user=user,
            username_input=user.username if user else None,
            ip_address=self._resolve_ip_address(request),
            user_agent=request.headers.get("user-agent"),
            event_type=SecurityEventType.REFRESH_TOKEN_REUSED.value,
            detail={"session_id": session_record.id},
        )
        self.db.execute(delete(CsrfToken).where(CsrfToken.session_id == session_record.id))
        self.db.commit()
        self._clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token reuse detected")

    def _revoke_session(self, *, session_record: AuthSession, reason: str, compromised: bool) -> None:
        session_record.status = SessionStatus.COMPROMISED.value if compromised else SessionStatus.REVOKED.value
        session_record.revoked_at = utcnow()
        session_record.revoke_reason = reason
        refresh_rows = self.db.scalars(
            select(RefreshToken).where(
                RefreshToken.session_id == session_record.id,
                RefreshToken.status.in_(
                    [RefreshTokenStatus.ACTIVE.value, RefreshTokenStatus.ROTATED.value]
                ),
            )
        ).all()
        for row in refresh_rows:
            row.status = RefreshTokenStatus.REVOKED.value
            row.revoked_at = utcnow()
            row.revoke_reason = reason

    def _record_security_event(
        self,
        *,
        user: User | None,
        username_input: str | None,
        ip_address: str | None,
        user_agent: str | None,
        event_type: str,
        detail: dict | None = None,
    ) -> None:
        self.db.add(
            AuthSecurityEvent(
                user_id=user.id if user else None,
                username_input=username_input,
                event_type=event_type,
                ip_address=ip_address,
                user_agent=user_agent,
                detail=detail or {},
            )
        )

    def _check_login_limits(self, *, username: str, ip_address: str) -> None:
        now = utcnow()
        ip_counter = self._get_counter(counter_type=CounterType.IP.value, counter_key=f"ip:{ip_address}")
        ip_blocked_until = coerce_utc_datetime(
            ip_counter.blocked_until if ip_counter else None
        )
        if ip_counter and ip_blocked_until and ip_blocked_until > now:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")
        account_ip_counter = self._get_counter(
            counter_type=CounterType.ACCOUNT_IP.value,
            counter_key=f"account_ip:{username}:{ip_address}",
        )
        account_ip_blocked_until = coerce_utc_datetime(
            account_ip_counter.blocked_until if account_ip_counter else None
        )
        if (
            account_ip_counter
            and account_ip_blocked_until
            and account_ip_blocked_until > now
        ):
            self._raise_login_failed()

    def _register_login_failure(
        self,
        *,
        username: str,
        ip_address: str,
        user_agent: str | None,
        event_type: str,
        user: User | None = None,
    ) -> None:
        now = utcnow()
        account_ip = self._increment_counter(
            counter_type=CounterType.ACCOUNT_IP.value,
            counter_key=f"account_ip:{username}:{ip_address}",
            now=now,
            window_minutes=10,
            block_after=5,
            block_minutes=15,
        )
        account_counter = self._increment_counter(
            counter_type=CounterType.ACCOUNT.value,
            counter_key=f"account:{username}",
            now=now,
            window_minutes=15,
            block_after=10,
            block_minutes=30,
        )
        ip_counter = self._increment_counter(
            counter_type=CounterType.IP.value,
            counter_key=f"ip:{ip_address}",
            now=now,
            window_minutes=5,
            block_after=50,
            block_minutes=60,
        )
        if ip_counter.fail_count >= 20 and self.settings.throttle_sleep_enabled:
            delay_seconds = min(5, max(3, 1 + ip_counter.fail_count // 10))
            time.sleep(delay_seconds)
        if user and account_counter.fail_count >= 10:
            user.lock_until = now + timedelta(minutes=30)
        self._record_security_event(
            user=user,
            username_input=username,
            ip_address=ip_address,
            user_agent=user_agent,
            event_type=event_type,
            detail={
                "account_ip_fail_count": account_ip.fail_count,
                "account_fail_count": account_counter.fail_count,
                "ip_fail_count": ip_counter.fail_count,
            },
        )
        self.db.commit()

    def _clear_login_counters(self, *, username: str, ip_address: str) -> None:
        for counter_type, counter_key in [
            (CounterType.ACCOUNT.value, f"account:{username}"),
            (CounterType.ACCOUNT_IP.value, f"account_ip:{username}:{ip_address}"),
        ]:
            counter = self._get_counter(counter_type=counter_type, counter_key=counter_key)
            if counter:
                self.db.delete(counter)
        self.db.flush()

    def _increment_counter(
        self,
        *,
        counter_type: str,
        counter_key: str,
        now,
        window_minutes: int,
        block_after: int,
        block_minutes: int,
    ) -> AuthLoginCounter:
        counter = self._get_counter(counter_type=counter_type, counter_key=counter_key)
        if counter is None:
            counter = AuthLoginCounter(
                counter_type=counter_type,
                counter_key=counter_key,
                fail_count=0,
                first_failed_at=now,
                last_failed_at=now,
            )
            self.db.add(counter)
        first_failed_at = coerce_utc_datetime(counter.first_failed_at)
        if first_failed_at is None or first_failed_at + timedelta(minutes=window_minutes) < now:
            counter.fail_count = 0
            counter.first_failed_at = now
            counter.blocked_until = None
        counter.fail_count += 1
        counter.last_failed_at = now
        if counter.fail_count >= block_after:
            counter.blocked_until = now + timedelta(minutes=block_minutes)
        return counter

    def _get_counter(self, *, counter_type: str, counter_key: str) -> AuthLoginCounter | None:
        return self.db.scalar(
            select(AuthLoginCounter).where(
                AuthLoginCounter.counter_type == counter_type,
                AuthLoginCounter.counter_key == counter_key,
            )
        )

    def _raise_login_failed(self) -> None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_FAILURE_MESSAGE)

    def _resolve_ip_address(self, request: Request) -> str:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _set_auth_cookies(self, *, response: Response, access_token: str, refresh_token: str, csrf_token: str) -> None:
        response.set_cookie(
            key=self._access_cookie_name,
            value=access_token,
            httponly=True,
            secure=self.settings.cookie_secure,
            samesite="strict",
            path="/",
            domain=self.settings.cookie_domain,
        )
        response.set_cookie(
            key=self._refresh_cookie_name,
            value=refresh_token,
            httponly=True,
            secure=self.settings.cookie_secure,
            samesite="strict",
            path="/auth/refresh",
            domain=self.settings.cookie_domain,
        )
        self._set_csrf_cookie(response, csrf_token)

    def _set_csrf_cookie(self, response: Response, csrf_token: str) -> None:
        response.set_cookie(
            key="XSRF-TOKEN",
            value=csrf_token,
            httponly=False,
            secure=self.settings.cookie_secure,
            samesite="strict",
            path="/",
            domain=self.settings.cookie_domain,
        )

    def _clear_auth_cookies(self, response: Response) -> None:
        response.delete_cookie(self._access_cookie_name, path="/", domain=self.settings.cookie_domain)
        response.delete_cookie(self._refresh_cookie_name, path="/auth/refresh", domain=self.settings.cookie_domain)
        response.delete_cookie("XSRF-TOKEN", path="/", domain=self.settings.cookie_domain)

    @property
    def _access_cookie_name(self) -> str:
        return "__Host-access_token" if self.settings.cookie_secure else "access_token"

    @property
    def _refresh_cookie_name(self) -> str:
        return "__Secure-refresh_token" if self.settings.cookie_secure else "refresh_token"
