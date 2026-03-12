from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...database import get_db
from ...dependencies import require_auth, require_csrf
from .schemas import (
    KnowledgeArticleCreateRequest,
    KnowledgeArticleDetailResponse,
    KnowledgeArticleListResponse,
    KnowledgeArticleUpdateRequest,
)
from .service import (
    KnowledgeOperationError,
    create_article,
    delete_article,
    get_article_detail,
    like_article,
    list_articles,
    pin_article,
    unlike_article,
    update_article,
)

knowledge_router = APIRouter(tags=["knowledge"])


@knowledge_router.get("/api/v1/knowledge/articles", response_model=KnowledgeArticleListResponse)
def knowledge_article_list(
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
    category_id: str | None = None,
) -> KnowledgeArticleListResponse:
    try:
        payload = list_articles(db, actor, category_id=category_id)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleListResponse.model_validate(payload)


@knowledge_router.post(
    "/api/v1/knowledge/articles",
    response_model=KnowledgeArticleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_create(
    payload: KnowledgeArticleCreateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = create_article(
            db,
            actor,
            title=payload.title,
            category_id=payload.category_id,
            content_markdown=payload.content_markdown,
        )
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)


@knowledge_router.get(
    "/api/v1/knowledge/articles/{article_id}",
    response_model=KnowledgeArticleDetailResponse,
)
def knowledge_article_detail(
    article_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = get_article_detail(db, actor, article_id)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)


@knowledge_router.patch(
    "/api/v1/knowledge/articles/{article_id}",
    response_model=KnowledgeArticleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_update(
    article_id: str,
    payload: KnowledgeArticleUpdateRequest,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = update_article(
            db,
            actor,
            article_id,
            title=payload.title,
            category_id=payload.category_id,
            content_markdown=payload.content_markdown,
        )
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)


@knowledge_router.delete(
    "/api/v1/knowledge/articles/{article_id}",
    status_code=204,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_delete(
    article_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    try:
        delete_article(db, actor, article_id)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=204)


@knowledge_router.post(
    "/api/v1/knowledge/articles/{article_id}/like",
    response_model=KnowledgeArticleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_like(
    article_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = like_article(db, actor, article_id)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)


@knowledge_router.delete(
    "/api/v1/knowledge/articles/{article_id}/like",
    response_model=KnowledgeArticleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_unlike(
    article_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = unlike_article(db, actor, article_id)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)


@knowledge_router.post(
    "/api/v1/knowledge/articles/{article_id}/pin",
    response_model=KnowledgeArticleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_pin(
    article_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = pin_article(db, actor, article_id, pinned=True)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)


@knowledge_router.delete(
    "/api/v1/knowledge/articles/{article_id}/pin",
    response_model=KnowledgeArticleDetailResponse,
    dependencies=[Depends(require_csrf)],
)
def knowledge_article_unpin(
    article_id: str,
    actor: Annotated[ActorContext, Depends(require_auth)],
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeArticleDetailResponse:
    try:
        detail = pin_article(db, actor, article_id, pinned=False)
    except KnowledgeOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return KnowledgeArticleDetailResponse.model_validate(detail)
