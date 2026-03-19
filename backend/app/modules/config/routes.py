from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...dependencies import require_auth
from ...database import get_db
from .schemas import (
    SystemConfigCreate,
    SystemConfigListResponse,
    SystemConfigResponse,
    SystemConfigUpdate,
)
from .service import (
    ConfigOperationError,
    create_config,
    delete_config,
    get_config,
    get_configs_by_category,
    list_categories,
    update_config,
)

config_router = APIRouter(prefix="/api/v1/config", tags=["config"])


@config_router.get("/categories", response_model=list[str])
def config_categories(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> list[str]:
    return list_categories(db)


@config_router.get("/{category}", response_model=SystemConfigListResponse)
def config_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Path(description="Config category")],
) -> SystemConfigListResponse:
    items = get_configs_by_category(db, category)
    return SystemConfigListResponse(items=items, total_count=len(items))


@config_router.get("/{category}/{key}", response_model=SystemConfigResponse)
def config_get(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Path(description="Config category")],
    key: Annotated[str, Path(description="Config key")],
) -> SystemConfigResponse:
    try:
        config = get_config(db, category, key)
        if not config:
            raise ConfigOperationError(status_code=404, detail="Config not found")
        return config
    except ConfigOperationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e


@config_router.post(
    "/{category}/{key}",
    response_model=SystemConfigResponse,
    status_code=status.HTTP_201_CREATED,
)
def config_create(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Path(description="Config category")],
    key: Annotated[str, Path(description="Config key")],
    payload: SystemConfigCreate,
) -> SystemConfigResponse:
    try:
        if payload.category != category or payload.key != key:
            raise ConfigOperationError(422, "Path category/key must match payload category/key")
        config = create_config(
            db,
            category=category,
            key=key,
            value=payload.value,
            description=payload.description,
        )
        db.commit()
        return config
    except ConfigOperationError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e


@config_router.put("/{category}/{key}", response_model=SystemConfigResponse)
def config_update(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Path(description="Config category")],
    key: Annotated[str, Path(description="Config key")],
    payload: SystemConfigUpdate,
) -> SystemConfigResponse:
    try:
        config = update_config(
            db,
            category=category,
            key=key,
            value=payload.value,
            description=payload.description,
            is_active=payload.is_active,
        )
        db.commit()
        return config
    except ConfigOperationError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e


@config_router.patch("/{category}/{key}", response_model=SystemConfigResponse)
def config_update_patch(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Path(description="Config category")],
    key: Annotated[str, Path(description="Config key")],
    payload: SystemConfigUpdate,
) -> SystemConfigResponse:
    try:
        config = update_config(
            db,
            category=category,
            key=key,
            value=payload.value,
            description=payload.description,
            is_active=payload.is_active,
        )
        db.commit()
        return config
    except ConfigOperationError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e


@config_router.delete("/{category}/{key}", status_code=status.HTTP_204_NO_CONTENT)
def config_delete(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category: Annotated[str, Path(description="Config category")],
    key: Annotated[str, Path(description="Config key")],
) -> None:
    try:
        delete_config(db, category, key)
        db.commit()
    except ConfigOperationError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e
