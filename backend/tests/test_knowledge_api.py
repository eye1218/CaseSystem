from __future__ import annotations

from .conftest import issue_csrf, login


def switch_role(client, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def create_article(
    client,
    *,
    title: str,
    category_id: str = "endpoint",
    content_markdown: str = "# 标题\n\n正文",
) -> dict:
    csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/knowledge/articles",
        json={
            "title": title,
            "category_id": category_id,
            "content_markdown": content_markdown,
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def find_item(items: list[dict], article_id: str) -> dict:
    for item in items:
        if item["id"] == article_id:
            return item
    raise AssertionError(f"article {article_id} not found")


def item_index(items: list[dict], article_id: str) -> int:
    for index, item in enumerate(items):
        if item["id"] == article_id:
            return index
    raise AssertionError(f"article {article_id} not found")


def test_internal_user_can_list_knowledge_articles_sorted_by_pin_likes_and_updated_at(client):
    login(client, "analyst", "AnalystPass123")
    low = create_article(client, title="终端响应手册 A", category_id="endpoint")
    high = create_article(client, title="终端响应手册 B", category_id="endpoint")
    pinned = create_article(client, title="终端响应手册 C", category_id="endpoint")

    analyst_like_csrf = issue_csrf(client)
    analyst_like_response = client.post(
        f"/api/v1/knowledge/articles/{high['id']}/like",
        headers={"X-CSRF-Token": analyst_like_csrf, "Origin": "https://testserver"},
    )
    assert analyst_like_response.status_code == 200, analyst_like_response.text

    login(client, "admin", "AdminPass123")

    admin_like_csrf = issue_csrf(client)
    admin_like_response = client.post(
        f"/api/v1/knowledge/articles/{high['id']}/like",
        headers={"X-CSRF-Token": admin_like_csrf, "Origin": "https://testserver"},
    )
    assert admin_like_response.status_code == 200, admin_like_response.text

    switch_role(client, "ADMIN")

    pin_csrf = issue_csrf(client)
    pin_response = client.post(
        f"/api/v1/knowledge/articles/{pinned['id']}/pin",
        headers={"X-CSRF-Token": pin_csrf, "Origin": "https://testserver"},
    )
    assert pin_response.status_code == 200, pin_response.text

    listing = client.get("/api/v1/knowledge/articles", params={"category_id": "endpoint"})
    assert listing.status_code == 200, listing.text
    items = listing.json()["items"]

    assert find_item(items, pinned["id"])["is_pinned"] is True
    assert find_item(items, high["id"])["likes_count"] == 2
    assert item_index(items, pinned["id"]) < item_index(items, high["id"]) < item_index(items, low["id"])


def test_customer_cannot_access_knowledge_routes(client):
    login(client, "analyst", "AnalystPass123")
    article = create_article(client, title="客户不可见知识", category_id="phishing")

    login(client, "customer", "CustomerPass123")

    listing = client.get("/api/v1/knowledge/articles")
    assert listing.status_code == 403

    detail = client.get(f"/api/v1/knowledge/articles/{article['id']}")
    assert detail.status_code == 403


def test_author_like_and_admin_permission_flow(client):
    login(client, "analyst", "AnalystPass123")
    article = create_article(client, title="作者权限验证", category_id="data")

    detail = client.get(f"/api/v1/knowledge/articles/{article['id']}")
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert payload["permissions"] == {"can_edit": True, "can_delete": True, "can_pin": False}
    assert payload["viewer_has_liked"] is False

    like_csrf = issue_csrf(client)
    liked = client.post(
        f"/api/v1/knowledge/articles/{article['id']}/like",
        headers={"X-CSRF-Token": like_csrf, "Origin": "https://testserver"},
    )
    assert liked.status_code == 200, liked.text
    assert liked.json()["viewer_has_liked"] is True
    assert liked.json()["likes_count"] == 1

    unlike_csrf = issue_csrf(client)
    unliked = client.delete(
        f"/api/v1/knowledge/articles/{article['id']}/like",
        headers={"X-CSRF-Token": unlike_csrf, "Origin": "https://testserver"},
    )
    assert unliked.status_code == 200, unliked.text
    assert unliked.json()["viewer_has_liked"] is False
    assert unliked.json()["likes_count"] == 0

    login(client, "admin", "AdminPass123")

    forbidden_csrf = issue_csrf(client)
    forbidden_update = client.patch(
        f"/api/v1/knowledge/articles/{article['id']}",
        json={"title": "不应允许的修改"},
        headers={"X-CSRF-Token": forbidden_csrf, "Origin": "https://testserver"},
    )
    assert forbidden_update.status_code == 403

    switch_role(client, "ADMIN")

    admin_detail = client.get(f"/api/v1/knowledge/articles/{article['id']}")
    assert admin_detail.status_code == 200, admin_detail.text
    assert admin_detail.json()["permissions"] == {"can_edit": True, "can_delete": True, "can_pin": True}

    update_csrf = issue_csrf(client)
    updated = client.patch(
        f"/api/v1/knowledge/articles/{article['id']}",
        json={
            "title": "管理员修改后的标题",
            "category_id": "endpoint",
            "content_markdown": "# 管理员修改\n\n内容已更新。",
        },
        headers={"X-CSRF-Token": update_csrf, "Origin": "https://testserver"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "管理员修改后的标题"
    assert updated.json()["category_id"] == "endpoint"


def test_delete_returns_not_found_message_and_ticket_detail_uses_related_knowledge(client):
    login(client, "analyst", "AnalystPass123")
    article = create_article(client, title="钓鱼排查说明", category_id="phishing")

    internal_ticket = client.get("/api/v1/tickets/100181/detail")
    assert internal_ticket.status_code == 200, internal_ticket.text
    related = internal_ticket.json()["related_knowledge"]
    assert any(item["id"] == article["id"] for item in related)
    assert all(item["category_id"] == "phishing" for item in related)

    delete_csrf = issue_csrf(client)
    deleted = client.delete(
        f"/api/v1/knowledge/articles/{article['id']}",
        headers={"X-CSRF-Token": delete_csrf, "Origin": "https://testserver"},
    )
    assert deleted.status_code == 204, deleted.text

    missing = client.get(f"/api/v1/knowledge/articles/{article['id']}")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "知识库不存在或已删除"

    login(client, "customer", "CustomerPass123")
    customer_ticket = client.get("/api/v1/tickets/100181/detail")
    assert customer_ticket.status_code == 200, customer_ticket.text
    assert customer_ticket.json()["related_knowledge"] == []
