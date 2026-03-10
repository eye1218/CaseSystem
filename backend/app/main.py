from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth import ActorContext
from app.bootstrap import seed_roles
from app.config import Settings
from app.database import SessionLocal, get_db, init_db
from app.dependencies import get_auth_service, require_auth, require_csrf
from app.enums import RoleCode
from app.policies import ObjectScope
from app.schemas import (
    AdminOverviewResponse,
    AuthResponse,
    CsrfTokenResponse,
    LoginRequest,
    MessageResponse,
    ObjectAccessResponse,
    PasswordChangeRequest,
    SwitchRoleRequest,
    TicketActionCommandRequest,
    TicketCommentCreateRequest,
    TicketCreateRequest,
    TicketDetailResponse,
    TicketListResponse,
    TicketSummaryResponse,
    TicketUpdateRequest,
)
from app.ticketing import (
    TicketOperationError,
    add_ticket_comment,
    create_ticket,
    execute_ticket_action,
    get_report_download,
    get_ticket,
    get_ticket_detail,
    list_tickets,
    update_ticket_detail,
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

    resolved_settings = settings or Settings()
    app = FastAPI(title=resolved_settings.app_name, lifespan=lifespan)
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

    def parse_created_range(value: str | None, *, end_of_day: bool = False) -> datetime | None:
        if not value:
            return None
        if len(value) == 10:
            suffix = "23:59:59" if end_of_day else "00:00:00"
            return datetime.fromisoformat(f"{value}T{suffix}")
        return datetime.fromisoformat(value)

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

    @app.get("/api/v1/tickets", response_model=TicketListResponse)
    def ticket_list(
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
        ticket_id: str | None = None,
        category_id: str | None = None,
        priority: str | None = None,
        main_status: str | None = None,
        sub_status: str | None = None,
        created_from: str | None = None,
        created_to: str | None = None,
        sort_by: str = "id",
        sort_dir: str = "desc",
    ) -> TicketListResponse:
        items, total_count = list_tickets(
            db,
            actor,
            ticket_id=ticket_id,
            category_id=category_id,
            priority=priority,
            main_status=main_status,
            sub_status=sub_status,
            created_from=parse_created_range(created_from),
            created_to=parse_created_range(created_to, end_of_day=True),
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        return TicketListResponse(items=[TicketSummaryResponse.model_validate(item) for item in items], total_count=total_count)

    @app.post("/api/v1/tickets", response_model=TicketDetailResponse, dependencies=[Depends(require_csrf)])
    def ticket_create(
        payload: TicketCreateRequest,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
    ) -> TicketDetailResponse:
        try:
            detail = create_ticket(
                db,
                actor,
                title=payload.title,
                description=payload.description,
                category_id=payload.category_id,
                priority=payload.priority,
                risk_score=payload.risk_score,
                assignment_mode=payload.assignment_mode,
                pool_code=payload.pool_code,
            )
        except TicketOperationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        return TicketDetailResponse.model_validate(detail)

    @app.get("/api/v1/tickets/{ticket_id}", response_model=TicketSummaryResponse)
    def ticket_detail(
        ticket_id: int,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
    ) -> TicketSummaryResponse:
        ticket = get_ticket(db, actor, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return TicketSummaryResponse.model_validate(ticket)

    @app.get("/api/v1/tickets/{ticket_id}/detail", response_model=TicketDetailResponse)
    def ticket_detail_rich(
        ticket_id: int,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
    ) -> TicketDetailResponse:
        detail = get_ticket_detail(db, actor, ticket_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return TicketDetailResponse.model_validate(detail)

    @app.post("/api/v1/tickets/{ticket_id}/comments", response_model=TicketDetailResponse, dependencies=[Depends(require_csrf)])
    def ticket_add_comment(
        ticket_id: int,
        payload: TicketCommentCreateRequest,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
    ) -> TicketDetailResponse:
        try:
            detail = add_ticket_comment(db, actor, ticket_id, payload.content, payload.visibility)
        except TicketOperationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        return TicketDetailResponse.model_validate(detail)

    @app.patch("/api/v1/tickets/{ticket_id}", response_model=TicketDetailResponse, dependencies=[Depends(require_csrf)])
    def ticket_update(
        ticket_id: int,
        payload: TicketUpdateRequest,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
    ) -> TicketDetailResponse:
        try:
            detail = update_ticket_detail(
                db,
                actor,
                ticket_id,
                title=payload.title,
                description=payload.description,
                category_id=payload.category_id,
                priority=payload.priority,
                risk_score=payload.risk_score,
            )
        except TicketOperationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        return TicketDetailResponse.model_validate(detail)

    @app.post(
        "/api/v1/tickets/{ticket_id}/actions/{action}",
        response_model=TicketDetailResponse,
        dependencies=[Depends(require_csrf)],
    )
    def ticket_action(
        ticket_id: int,
        action: str,
        payload: TicketActionCommandRequest,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
    ) -> TicketDetailResponse:
        try:
            detail = execute_ticket_action(db, actor, ticket_id, action, payload.note)
        except TicketOperationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        return TicketDetailResponse.model_validate(detail)

    @app.get("/api/v1/tickets/{ticket_id}/reports/{report_id}/download")
    def ticket_report_download(
        ticket_id: int,
        report_id: str,
        actor: Annotated[ActorContext, Depends(require_auth)],
        db: Annotated[Session, Depends(get_db)],
        lang: str = "zh",
    ) -> Response:
        report = get_report_download(db, actor, ticket_id, report_id, lang)
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")
        filename, content = report
        return Response(
            content,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if frontend_dist.exists():
        app.mount("/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend")

    return app


app = create_app()
