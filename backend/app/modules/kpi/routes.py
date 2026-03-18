from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth
from .schemas import KpiOverviewResponse, KpiUserListResponse
from .service import KpiOperationError, get_kpi_overview, list_kpi_users

kpi_router = APIRouter(tags=["kpi"])


@kpi_router.get("/api/v1/kpi/overview", response_model=KpiOverviewResponse)
def kpi_overview(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    window_days: int = Query(default=30),
) -> KpiOverviewResponse:
    try:
        payload = get_kpi_overview(
            db,
            actor,
            window_days=window_days,
        )
    except KpiOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KpiOverviewResponse.model_validate(payload)


@kpi_router.get("/api/v1/kpi/users", response_model=KpiUserListResponse)
def kpi_user_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    window_days: int = Query(default=30),
    search: str | None = None,
    role_code: str | None = None,
    sort_by: str = "handled_count",
    sort_dir: str = "desc",
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> KpiUserListResponse:
    try:
        payload = list_kpi_users(
            db,
            actor,
            window_days=window_days,
            search=search,
            role_code=role_code,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    except KpiOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KpiUserListResponse.model_validate(payload)
