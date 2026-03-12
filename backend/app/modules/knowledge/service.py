from __future__ import annotations

import re
import uuid
from collections.abc import Iterable
from datetime import timedelta

from sqlalchemy import Select, delete, func, select
from sqlalchemy.orm import Session

from ...auth import ActorContext
from ...enums import RoleCode
from ...security import utcnow
from ..tickets.seed_data import CATEGORY_NAMES
from .models import KnowledgeArticle, KnowledgeArticleLike


class KnowledgeOperationError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


KNOWLEDGE_SEED_DATA = [
    {
        "title": "域账号横向移动初判手册",
        "category_id": "intrusion",
        "content_markdown": "# 域账号横向移动初判\n\n## 适用场景\n\n用于排查同一账号短时间访问多台终端的异常登录行为。\n\n## 核查步骤\n\n1. 复核登录来源与时间窗口。\n2. 对比账号平时访问画像。\n3. 拉取终端侧认证与进程日志。\n",
        "created_by_user_id": "user-admin",
        "created_by_name": "Admin",
    },
    {
        "title": "边界网络攻击告警研判基线",
        "category_id": "network",
        "content_markdown": "# 边界网络攻击告警研判基线\n\n## 目标\n\n统一网络攻击类工单的研判路径与输出格式。\n\n## 关注点\n\n- 攻击面\n- 资产暴露\n- 受影响范围\n",
        "created_by_user_id": "user-analyst",
        "created_by_name": "Analyst",
    },
    {
        "title": "数据安全事件影响面评估模板",
        "category_id": "data",
        "content_markdown": "# 数据安全事件影响面评估模板\n\n## 评估思路\n\n先确认数据类型，再确认数据流向，最后评估潜在影响对象。\n",
        "created_by_user_id": "user-admin",
        "created_by_name": "Admin",
    },
    {
        "title": "终端恶意软件排查 SOP",
        "category_id": "endpoint",
        "content_markdown": "# 终端恶意软件排查 SOP\n\n## 处置步骤\n\n1. 隔离受感染终端。\n2. 固定 IOC。\n3. 采集关键样本。\n4. 生成结案建议。\n",
        "created_by_user_id": "user-analyst",
        "created_by_name": "Analyst",
    },
    {
        "title": "邮件钓鱼事件沟通话术与处置建议",
        "category_id": "phishing",
        "content_markdown": "# 邮件钓鱼事件沟通话术与处置建议\n\n## 对外沟通\n\n- 说明受影响范围\n- 提醒修改密码\n- 给出处置时序\n",
        "created_by_user_id": "user-admin",
        "created_by_name": "Admin",
    },
]


def _assert_internal_actor(actor: ActorContext) -> None:
    if actor.active_role == RoleCode.CUSTOMER.value:
        raise KnowledgeOperationError(403, "Current role cannot access the knowledge base")


def _assert_admin(actor: ActorContext) -> None:
    if actor.active_role != RoleCode.ADMIN.value:
        raise KnowledgeOperationError(403, "Current role cannot pin knowledge articles")


def _validate_category(category_id: str) -> None:
    if category_id not in CATEGORY_NAMES:
        raise KnowledgeOperationError(422, "Unsupported ticket category")


def _strip_markdown(content: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", content)
    text = re.sub(r"`[^`]+`", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[[^\]]+\]\([^)]+\)", " ", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*>|]\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_~]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _excerpt(content: str, limit: int = 120) -> str:
    text = _strip_markdown(content)
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def _can_edit(article: KnowledgeArticle, actor: ActorContext) -> bool:
    return actor.active_role == RoleCode.ADMIN.value or article.created_by_user_id == actor.user_id


def _permissions_payload(article: KnowledgeArticle, actor: ActorContext) -> dict[str, bool]:
    can_manage = _can_edit(article, actor)
    return {
        "can_edit": can_manage,
        "can_delete": can_manage,
        "can_pin": actor.active_role == RoleCode.ADMIN.value,
    }


def _summary_payload(article: KnowledgeArticle, *, likes_count: int) -> dict[str, object]:
    return {
        "id": article.id,
        "title": article.title,
        "category_id": article.category_id,
        "category_name": CATEGORY_NAMES[article.category_id],
        "excerpt": _excerpt(article.content_markdown),
        "author_name": article.created_by_name,
        "updated_at": article.updated_at,
        "likes_count": likes_count,
        "is_pinned": article.is_pinned,
    }


def _detail_payload(
    article: KnowledgeArticle,
    actor: ActorContext,
    *,
    likes_count: int,
    viewer_has_liked: bool,
) -> dict[str, object]:
    payload = _summary_payload(article, likes_count=likes_count)
    payload.update(
        {
            "content_markdown": article.content_markdown,
            "viewer_has_liked": viewer_has_liked,
            "permissions": _permissions_payload(article, actor),
        }
    )
    return payload


def _likes_count(db: Session, article_id: str) -> int:
    return (
        db.scalar(select(func.count(KnowledgeArticleLike.id)).where(KnowledgeArticleLike.article_id == article_id))
        or 0
    )


def _viewer_has_liked(db: Session, article_id: str, actor: ActorContext) -> bool:
    return (
        db.scalar(
            select(func.count(KnowledgeArticleLike.id)).where(
                KnowledgeArticleLike.article_id == article_id,
                KnowledgeArticleLike.user_id == actor.user_id,
            )
        )
        or 0
    ) > 0


def _article_statement(*, category_id: str | None = None) -> Select[tuple[KnowledgeArticle, int]]:
    likes_count = func.count(KnowledgeArticleLike.id).label("likes_count")
    statement = (
        select(KnowledgeArticle, likes_count)
        .outerjoin(KnowledgeArticleLike, KnowledgeArticleLike.article_id == KnowledgeArticle.id)
        .group_by(KnowledgeArticle.id)
        .order_by(KnowledgeArticle.is_pinned.desc(), likes_count.desc(), KnowledgeArticle.updated_at.desc())
    )
    if category_id:
        statement = statement.where(KnowledgeArticle.category_id == category_id)
    return statement


def _fetch_article(db: Session, article_id: str) -> KnowledgeArticle:
    article = db.scalar(select(KnowledgeArticle).where(KnowledgeArticle.id == article_id))
    if article is None:
        raise KnowledgeOperationError(404, "知识库不存在或已删除")
    return article


def seed_knowledge(db: Session) -> None:
    existing_titles = set(db.scalars(select(KnowledgeArticle.title)).all())
    now = utcnow()
    for offset, payload in enumerate(KNOWLEDGE_SEED_DATA):
        if payload["title"] in existing_titles:
            continue
        db.add(
            KnowledgeArticle(
                id=str(uuid.uuid4()),
                title=payload["title"],
                category_id=payload["category_id"],
                content_markdown=payload["content_markdown"],
                is_pinned=False,
                created_by_user_id=payload["created_by_user_id"],
                created_by_name=payload["created_by_name"],
                updated_by_user_id=payload["created_by_user_id"],
                updated_by_name=payload["created_by_name"],
                created_at=now - timedelta(days=offset + 1),
                updated_at=now - timedelta(days=offset + 1),
            )
        )
    db.commit()


def list_articles(db: Session, actor: ActorContext, *, category_id: str | None = None) -> dict[str, object]:
    _assert_internal_actor(actor)
    if category_id is not None:
        _validate_category(category_id)
    rows = db.execute(_article_statement(category_id=category_id)).all()
    items = [_summary_payload(article, likes_count=likes_count) for article, likes_count in rows]
    return {"items": items, "total_count": len(items)}


def get_article_detail(db: Session, actor: ActorContext, article_id: str) -> dict[str, object]:
    _assert_internal_actor(actor)
    article = _fetch_article(db, article_id)
    return _detail_payload(
        article,
        actor,
        likes_count=_likes_count(db, article.id),
        viewer_has_liked=_viewer_has_liked(db, article.id, actor),
    )


def create_article(
    db: Session,
    actor: ActorContext,
    *,
    title: str,
    category_id: str,
    content_markdown: str,
) -> dict[str, object]:
    _assert_internal_actor(actor)
    _validate_category(category_id)
    now = utcnow()
    article = KnowledgeArticle(
        id=str(uuid.uuid4()),
        title=title.strip(),
        category_id=category_id,
        content_markdown=content_markdown,
        is_pinned=False,
        created_by_user_id=actor.user_id,
        created_by_name=actor.display_name,
        updated_by_user_id=actor.user_id,
        updated_by_name=actor.display_name,
        created_at=now,
        updated_at=now,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return _detail_payload(article, actor, likes_count=0, viewer_has_liked=False)


def update_article(
    db: Session,
    actor: ActorContext,
    article_id: str,
    *,
    title: str | None = None,
    category_id: str | None = None,
    content_markdown: str | None = None,
) -> dict[str, object]:
    _assert_internal_actor(actor)
    article = _fetch_article(db, article_id)
    if not _can_edit(article, actor):
        raise KnowledgeOperationError(403, "Current role cannot edit this knowledge article")
    if title is not None:
        article.title = title.strip()
    if category_id is not None:
        _validate_category(category_id)
        article.category_id = category_id
    if content_markdown is not None:
        article.content_markdown = content_markdown
    article.updated_by_user_id = actor.user_id
    article.updated_by_name = actor.display_name
    article.updated_at = utcnow()
    db.commit()
    db.refresh(article)
    return _detail_payload(
        article,
        actor,
        likes_count=_likes_count(db, article.id),
        viewer_has_liked=_viewer_has_liked(db, article.id, actor),
    )


def delete_article(db: Session, actor: ActorContext, article_id: str) -> None:
    _assert_internal_actor(actor)
    article = _fetch_article(db, article_id)
    if not _can_edit(article, actor):
        raise KnowledgeOperationError(403, "Current role cannot delete this knowledge article")
    db.execute(delete(KnowledgeArticleLike).where(KnowledgeArticleLike.article_id == article.id))
    db.delete(article)
    db.commit()


def like_article(db: Session, actor: ActorContext, article_id: str) -> dict[str, object]:
    _assert_internal_actor(actor)
    article = _fetch_article(db, article_id)
    existing = db.scalar(
        select(KnowledgeArticleLike).where(
            KnowledgeArticleLike.article_id == article.id,
            KnowledgeArticleLike.user_id == actor.user_id,
        )
    )
    if existing is None:
        db.add(
            KnowledgeArticleLike(
                id=str(uuid.uuid4()),
                article_id=article.id,
                user_id=actor.user_id,
                created_at=utcnow(),
            )
        )
        article.updated_at = utcnow()
        db.commit()
    return _detail_payload(article, actor, likes_count=_likes_count(db, article.id), viewer_has_liked=True)


def unlike_article(db: Session, actor: ActorContext, article_id: str) -> dict[str, object]:
    _assert_internal_actor(actor)
    article = _fetch_article(db, article_id)
    db.execute(
        delete(KnowledgeArticleLike).where(
            KnowledgeArticleLike.article_id == article.id,
            KnowledgeArticleLike.user_id == actor.user_id,
        )
    )
    db.commit()
    return _detail_payload(article, actor, likes_count=_likes_count(db, article.id), viewer_has_liked=False)


def pin_article(db: Session, actor: ActorContext, article_id: str, *, pinned: bool) -> dict[str, object]:
    _assert_internal_actor(actor)
    _assert_admin(actor)
    article = _fetch_article(db, article_id)
    article.is_pinned = pinned
    article.updated_by_user_id = actor.user_id
    article.updated_by_name = actor.display_name
    article.updated_at = utcnow()
    db.commit()
    db.refresh(article)
    return _detail_payload(
        article,
        actor,
        likes_count=_likes_count(db, article.id),
        viewer_has_liked=_viewer_has_liked(db, article.id, actor),
    )


def list_related_articles_for_ticket_detail(
    db: Session, actor: ActorContext, *, category_id: str
) -> list[dict[str, object]]:
    if actor.active_role == RoleCode.CUSTOMER.value:
        return []
    rows: Iterable[tuple[KnowledgeArticle, int]] = db.execute(
        _article_statement(category_id=category_id)
    ).all()
    return [_summary_payload(article, likes_count=likes_count) for article, likes_count in rows]
