from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.auth import ActorContext, AuthService
from app.config import Settings, get_settings
from app.database import get_db


def get_auth_service(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(db=db, settings=settings)


def require_auth(
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> ActorContext:
    actor = auth_service.authenticate_request(request)
    request.state.actor = actor
    return actor


def require_csrf(
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    del response
    # Bearer API token requests are self-authenticating — skip CSRF check
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer ") and auth_header.removeprefix("Bearer ").strip().startswith("csk_"):
        return
    auth_service.validate_csrf(request)
