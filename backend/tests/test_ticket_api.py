from __future__ import annotations

from .conftest import issue_csrf, login


def test_internal_user_can_list_tickets_and_filter(client):
    login(client, "admin", "AdminPass123")

    response = client.get("/api/v1/tickets")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 5
    assert len(payload["items"]) == 5

    filtered = client.get("/api/v1/tickets", params={"priority": "P1", "main_status": "IN_PROGRESS"})
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert filtered_payload["total_count"] == 5
    assert [item["id"] for item in filtered_payload["items"]] == [100182]


def test_customer_only_sees_owned_tickets(client):
    login(client, "customer", "CustomerPass123")

    response = client.get("/api/v1/tickets")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 2
    assert {item["id"] for item in payload["items"]} == {100181, 100161}

    detail = client.get("/api/v1/tickets/100182")
    assert detail.status_code == 404


def test_ticket_detail_returns_single_ticket(client):
    login(client, "analyst", "AnalystPass123")

    response = client.get("/api/v1/tickets/100177")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == 100177
    assert payload["current_pool_code"] == "T2_POOL"


def test_ticket_detail_hides_internal_activity_for_customer(client):
    login(client, "customer", "CustomerPass123")

    response = client.get("/api/v1/tickets/100181/detail")
    assert response.status_code == 200
    payload = response.json()

    assert payload["ticket"]["id"] == 100181
    assert payload["knowledge_articles"]
    assert payload["reports"]
    assert all(item["visibility"] == "PUBLIC" for item in payload["activity_feed"])


def test_internal_user_can_create_ticket_into_pool(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "新建工单：邮件网关批量拦截异常",
            "description": "手工创建一条需要进入 T2 池的异常告警工单。",
            "category_id": "phishing",
            "priority": "P2",
            "risk_score": 66,
            "assignment_mode": "pool",
            "pool_code": "T2_POOL",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["source"] == "INTERNAL"
    assert payload["ticket"]["current_pool_code"] == "T2_POOL"
    assert payload["ticket"]["assigned_to"] is None
    assert payload["activity_feed"][-1]["item_type"] == "created"


def test_customer_can_create_ticket_and_only_see_own_ticket(client):
    login(client, "customer", "CustomerPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "客户新建：访问异常待排查",
            "description": "客户侧提交一条新的访问异常工单。",
            "category_id": "network",
            "priority": "P3",
            "risk_score": 45,
            "assignment_mode": "self",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    created_payload = response.json()
    created_id = created_payload["ticket"]["id"]
    assert created_payload["ticket"]["source"] == "CUSTOMER"
    assert created_payload["ticket"]["assigned_to"] is None

    listing = client.get("/api/v1/tickets")
    assert listing.status_code == 200
    assert created_id in {item["id"] for item in listing.json()["items"]}
