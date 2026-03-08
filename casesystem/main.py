from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response

from casesystem.auth import ActorContext
from casesystem.bootstrap import seed_roles
from casesystem.config import Settings, get_settings
from casesystem.database import SessionLocal, init_db
from casesystem.dependencies import get_auth_service, require_auth, require_csrf
from casesystem.enums import RoleCode
from casesystem.policies import ObjectScope
from casesystem.schemas import (
    AdminOverviewResponse,
    AuthResponse,
    CsrfTokenResponse,
    LoginRequest,
    MessageResponse,
    ObjectAccessResponse,
    PasswordChangeRequest,
    SwitchRoleRequest,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        del app
        init_db()
        db = SessionLocal()
        try:
            seed_roles(db)
        finally:
            db.close()
        yield

    app = FastAPI(title=settings.app_name if settings else "CaseSystem Identity and Authorization", lifespan=lifespan)

    @app.get("/healthz")
    def healthz() -> MessageResponse:
        return MessageResponse(message="ok")

    @app.get("/auth/csrf", response_model=CsrfTokenResponse)
    def issue_csrf(response: Response, auth_service=Depends(get_auth_service)) -> CsrfTokenResponse:
        token = auth_service.issue_anonymous_csrf(response)
        return CsrfTokenResponse(csrf_token=token)

    @app.post("/auth/login", response_model=AuthResponse, dependencies=[Depends(require_csrf)])
    def login(payload: LoginRequest, request: Request, response: Response, auth_service=Depends(get_auth_service)) -> AuthResponse:
        return auth_service.login(request=request, response=response, username=payload.username, password=payload.password)

    @app.post("/auth/refresh", response_model=AuthResponse, dependencies=[Depends(require_csrf)])
    def refresh(request: Request, response: Response, auth_service=Depends(get_auth_service)) -> AuthResponse:
        return auth_service.refresh(request=request, response=response)

    @app.post("/auth/logout", response_model=MessageResponse, dependencies=[Depends(require_csrf)])
    def logout(
        response: Response,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> MessageResponse:
        auth_service.logout(actor=actor, response=response)
        return MessageResponse(message="Logged out")

    @app.post("/auth/change-password", response_model=MessageResponse, dependencies=[Depends(require_csrf)])
    def change_password(
        payload: PasswordChangeRequest,
        response: Response,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> MessageResponse:
        auth_service.change_password(
            actor=actor,
            current_password=payload.current_password,
            new_password=payload.new_password,
            response=response,
        )
        return MessageResponse(message="Password updated")

    @app.post("/auth/switch-role", response_model=AuthResponse, dependencies=[Depends(require_csrf)])
    def switch_role(
        payload: SwitchRoleRequest,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> AuthResponse:
        return auth_service.switch_role(actor=actor, active_role_code=payload.active_role_code)

    @app.get("/auth/me", response_model=AuthResponse)
    def me(actor: Annotated[ActorContext, Depends(require_auth)]) -> AuthResponse:
        return AuthResponse(user=actor.to_user_schema(), session_id=actor.session_id)

    @app.get("/admin/overview", response_model=AdminOverviewResponse)
    def admin_overview(
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> AdminOverviewResponse:
        auth_service.require_permission(actor, "config:manage")
        return AdminOverviewResponse(actor=actor.to_user_schema(), permissions=["config:manage", "security:read"])

    @app.get("/objects/internal/{owner_user_id}", response_model=ObjectAccessResponse)
    def internal_object(
        owner_user_id: str,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> ObjectAccessResponse:
        scope = ObjectScope(owner_user_id=owner_user_id, allowed_roles=(RoleCode.T2, RoleCode.T3))
        auth_service.require_object_access(actor, scope)
        return ObjectAccessResponse(
            actor_id=actor.user_id,
            active_role=actor.active_role,
            object_scope={"owner_user_id": owner_user_id, "allowed_roles": [RoleCode.T2.value, RoleCode.T3.value]},
        )

    @app.get("/objects/customer/{customer_user_id}", response_model=ObjectAccessResponse)
    def customer_object(
        customer_user_id: str,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> ObjectAccessResponse:
        scope = ObjectScope(customer_user_id=customer_user_id, allowed_roles=(RoleCode.ADMIN,))
        auth_service.require_object_access(actor, scope)
        return ObjectAccessResponse(
            actor_id=actor.user_id,
            active_role=actor.active_role,
            object_scope={"customer_user_id": customer_user_id, "allowed_roles": [RoleCode.ADMIN.value]},
        )

    return app


app = create_app()
