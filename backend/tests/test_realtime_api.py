from __future__ import annotations

from app.security import decode_access_token

from .conftest import issue_csrf, login


def switch_to_admin_role(client) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": "ADMIN"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def test_authenticated_user_can_issue_socket_token(client, test_settings):
    auth_payload = login(client, "admin", "AdminPass123")

    response = client.get("/auth/socket-token")

    assert response.status_code == 200, response.text
    token = response.json()["token"]
    claims = decode_access_token(token, test_settings)
    assert claims["sub"] == auth_payload["user"]["id"]
    assert claims["sid"] == auth_payload["session_id"]


def test_admin_can_create_list_and_read_notifications(client):
    auth_payload = login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)
    csrf = issue_csrf(client)

    create_response = client.post(
        "/api/v1/notifications",
        json={
            "user_id": auth_payload["user"]["id"],
            "category": "ticket_upgrade",
            "title": "工单已升级",
            "content": "工单 #100177 已升级给你处理",
            "related_resource_type": "ticket",
            "related_resource_id": 100177,
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert create_response.status_code == 200, create_response.text
    create_payload = create_response.json()
    notification_id = create_payload["notification"]["id"]
    assert create_payload["notification"]["status"] == "pending"
    assert create_payload["unread_count"] == 1

    list_response = client.get("/api/v1/notifications")

    assert list_response.status_code == 200, list_response.text
    list_payload = list_response.json()
    assert list_payload["unread_count"] == 1
    assert [item["id"] for item in list_payload["items"]] == [notification_id]

    read_response = client.post(
        f"/api/v1/notifications/{notification_id}/read",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert read_response.status_code == 200, read_response.text
    read_payload = read_response.json()
    assert read_payload["notification"]["status"] == "read"
    assert read_payload["unread_count"] == 0


def test_ticket_update_rejects_stale_version(client):
    login(client, "admin", "AdminPass123")
    ticket_detail = client.get("/api/v1/tickets/100177/detail")
    assert ticket_detail.status_code == 200, ticket_detail.text
    version = ticket_detail.json()["ticket"]["version"]
    csrf = issue_csrf(client)

    update_response = client.patch(
        "/api/v1/tickets/100177",
        json={"version": version, "title": "已更新的工单标题"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["ticket"]["version"] == version + 1

    stale_response = client.patch(
        "/api/v1/tickets/100177",
        json={"version": version, "title": "过期版本提交"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert stale_response.status_code == 409, stale_response.text
    assert stale_response.json()["detail"] == "数据已变更，请刷新后重试"


def test_comment_bumps_ticket_version_and_stale_action_is_rejected(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    create_response = client.post(
        "/api/v1/tickets",
        json={
            "title": "版本控制验证",
            "description": "验证评论写入后版本递增，并拒绝旧版本动作。",
            "category_id": "network",
            "priority": "P3",
            "risk_score": 40,
            "assignment_mode": "self",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 200, create_response.text
    ticket_payload = create_response.json()["ticket"]
    ticket_id = ticket_payload["id"]
    version = ticket_payload["version"]

    comment_response = client.post(
        f"/api/v1/tickets/{ticket_id}/comments",
        json={
            "version": version,
            "content": "先写一条评论，推动版本递增。",
            "visibility": "PUBLIC",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert comment_response.status_code == 200, comment_response.text
    assert comment_response.json()["ticket"]["version"] == version + 1

    stale_action_response = client.post(
        f"/api/v1/tickets/{ticket_id}/actions/respond",
        json={"version": version, "note": "使用旧版本提交动作"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert stale_action_response.status_code == 409, stale_action_response.text
    assert stale_action_response.json()["detail"] == "数据已变更，请刷新后重试"
