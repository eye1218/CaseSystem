from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import ActorContext
from .bootstrap import seed_roles
from .config import Settings
from .database import SessionLocal, init_db
from .dependencies import get_auth_service, require_auth, require_csrf
from .modules.events.routes import event_router
from .modules.knowledge.routes import knowledge_router
from .modules.realtime.routes import realtime_router
from .modules.realtime.socket_server import configure_realtime_gateway, create_socketio_app
from .modules.templates.routes import template_router
from .modules.tickets.cache import configure_ticket_cache
from .modules.tickets.routes import ticket_router
from .policies import ObjectScope, RoleCode
from .schemas import (
    AdminOverviewResponse,
    AuthenticatedUser,
    AuthResponse,
    CsrfTokenResponse,
    LoginRequest,
    MessageResponse,
    ObjectAccessResponse,
    PasswordChangeRequest,
    SocketTokenResponse,
    SwitchRoleRequest,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        session_factory = getattr(app.state, "session_factory", SessionLocal)
        if session_factory is SessionLocal:
            init_db()
        db = session_factory()
        try:
            seed_roles(db)
        finally:
            db.close()
        configure_realtime_gateway(
            settings=resolved_settings,
            session_factory=session_factory,
        )
        configure_ticket_cache(resolved_settings)
        yield

    app = FastAPI(title=resolved_settings.app_name, lifespan=lifespan)
    app.state.session_factory = SessionLocal
    app.state.settings = resolved_settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"

    class SPAStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code == 404:
                    return await super().get_response("index.html", scope)
                raise

    @app.get("/healthz")
    def healthz() -> MessageResponse:
        return MessageResponse(message="ok")

    @app.get("/auth/csrf", response_model=CsrfTokenResponse)
    def issue_csrf(
        response: Response, auth_service=Depends(get_auth_service)
    ) -> CsrfTokenResponse:
        token = auth_service.issue_anonymous_csrf(response)
        return CsrfTokenResponse(csrf_token=token)

    @app.post(
        "/auth/login", response_model=AuthResponse, dependencies=[Depends(require_csrf)]
    )
    def login(
        payload: LoginRequest,
        request: Request,
        response: Response,
        auth_service=Depends(get_auth_service),
    ) -> AuthResponse:
        return auth_service.login(
            request=request,
            response=response,
            username=payload.username,
            password=payload.password,
        )

    @app.post(
        "/auth/refresh",
        response_model=AuthResponse,
        dependencies=[Depends(require_csrf)],
    )
    def refresh(
        request: Request, response: Response, auth_service=Depends(get_auth_service)
    ) -> AuthResponse:
        return auth_service.refresh(request=request, response=response)

    @app.post(
        "/auth/logout",
        response_model=MessageResponse,
        dependencies=[Depends(require_csrf)],
    )
    def logout(
        response: Response,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> MessageResponse:
        auth_service.logout(actor=actor, response=response)
        return MessageResponse(message="Logged out")

    @app.post(
        "/auth/change-password",
        response_model=MessageResponse,
        dependencies=[Depends(require_csrf)],
    )
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

    @app.post(
        "/auth/switch-role",
        response_model=AuthResponse,
        dependencies=[Depends(require_csrf)],
    )
    def switch_role(
        payload: SwitchRoleRequest,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> AuthResponse:
        return auth_service.switch_role(
            actor=actor, active_role_code=payload.active_role_code
        )

    @app.get("/auth/me", response_model=AuthResponse)
    def me(actor: Annotated[ActorContext, Depends(require_auth)]) -> AuthResponse:
        user = AuthenticatedUser(
            id=actor.user_id,
            username=actor.username,
            display_name=actor.display_name,
            status="active",
            token_version=actor.token_version,
            role_version=actor.role_version,
            active_role=actor.active_role,
            roles=actor.roles,
        )
        return AuthResponse(user=user, session_id=actor.session_id)

    @app.get("/auth/socket-token", response_model=SocketTokenResponse)
    def issue_socket_token(
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> SocketTokenResponse:
        return SocketTokenResponse(token=auth_service.issue_socket_token(actor))

    @app.get("/admin/overview", response_model=AdminOverviewResponse)
    def admin_overview(
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> AdminOverviewResponse:
        auth_service.require_permission(actor, "config:manage")
        actor_user = AuthenticatedUser(
            id=actor.user_id,
            username=actor.username,
            display_name=actor.display_name,
            status="active",
            token_version=actor.token_version,
            role_version=actor.role_version,
            active_role=actor.active_role,
            roles=actor.roles,
        )
        return AdminOverviewResponse(
            actor=actor_user, permissions=["config:manage", "security:read"]
        )

    @app.get("/objects/internal/{owner_user_id}", response_model=ObjectAccessResponse)
    def internal_object(
        owner_user_id: str,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> ObjectAccessResponse:
        scope = ObjectScope(
            owner_user_id=owner_user_id, allowed_roles=(RoleCode.T2, RoleCode.T3)
        )
        auth_service.require_object_access(actor, scope)
        return ObjectAccessResponse(
            actor_id=actor.user_id,
            active_role=actor.active_role,
            object_scope={
                "owner_user_id": owner_user_id,
                "allowed_roles": [RoleCode.T2.value, RoleCode.T3.value],
            },
        )

    @app.get(
        "/objects/customer/{customer_user_id}", response_model=ObjectAccessResponse
    )
    def customer_object(
        customer_user_id: str,
        actor: Annotated[ActorContext, Depends(require_auth)],
        auth_service=Depends(get_auth_service),
    ) -> ObjectAccessResponse:
        scope = ObjectScope(
            customer_user_id=customer_user_id, allowed_roles=(RoleCode.ADMIN,)
        )
        auth_service.require_object_access(actor, scope)
        return ObjectAccessResponse(
            actor_id=actor.user_id,
            active_role=actor.active_role,
            object_scope={
                "customer_user_id": customer_user_id,
                "allowed_roles": [RoleCode.ADMIN.value],
            },
        )

    app.include_router(ticket_router)
    app.include_router(event_router)
    app.include_router(realtime_router)
    app.include_router(knowledge_router)
    app.include_router(template_router)

    if frontend_dist.exists():
        app.mount(
            "/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend"
        )

    return app


http_app = create_app()
app = create_socketio_app(http_app)
