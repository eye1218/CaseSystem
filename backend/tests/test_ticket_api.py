from __future__ import annotations

from app.modules.tickets.cache import (
    InMemoryTicketCacheBackend,
    set_ticket_cache_backend,
)
from app.modules.tickets.models import Ticket, TicketComment

from .conftest import issue_csrf, login


def test_internal_user_can_list_tickets_and_filter(client):
    login(client, "admin", "AdminPass123")

    response = client.get("/api/v1/tickets")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 5
    assert len(payload["items"]) == 5

    filtered = client.get(
        "/api/v1/tickets",
        params=[
            ("priority", "P1"),
            ("main_status", "IN_PROGRESS"),
            ("claim_status", "claimed"),
        ],
    )
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert filtered_payload["total_count"] == 5
    assert [item["id"] for item in filtered_payload["items"]] == [100182]


def test_internal_user_can_filter_only_assigned_to_self(client):
    login(client, "admin", "AdminPass123")

    response = client.get("/api/v1/tickets", params={"assigned_to_me": True})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 5
    assert payload["filtered_count"] == 3
    assert [item["id"] for item in payload["items"]] == [100182, 100181, 100161]
    assert all(item["assigned_to_user_id"] == "user-admin" for item in payload["items"])


def test_non_admin_internal_user_can_list_all_tickets_by_default(client):
    login(client, "analyst", "AnalystPass123")

    response = client.get("/api/v1/tickets")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 5
    assert payload["filtered_count"] == 5
    assert [item["id"] for item in payload["items"]] == [100182, 100181, 100177, 100169, 100161]


def test_ticket_list_supports_limit_offset_and_filtered_metadata(client):
    login(client, "admin", "AdminPass123")

    first_page = client.get("/api/v1/tickets", params={"limit": 2, "offset": 0})
    assert first_page.status_code == 200
    first_payload = first_page.json()
    assert first_payload["total_count"] == 5
    assert first_payload["filtered_count"] == 5
    assert first_payload["has_more"] is True
    assert first_payload["next_offset"] == 2
    assert [item["id"] for item in first_payload["items"]] == [100182, 100181]

    second_page = client.get("/api/v1/tickets", params={"limit": 2, "offset": 2})
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert second_payload["total_count"] == 5
    assert second_payload["filtered_count"] == 5
    assert second_payload["has_more"] is True
    assert second_payload["next_offset"] == 4
    assert [item["id"] for item in second_payload["items"]] == [100177, 100169]

    last_page = client.get("/api/v1/tickets", params={"limit": 2, "offset": 4})
    assert last_page.status_code == 200
    last_payload = last_page.json()
    assert last_payload["total_count"] == 5
    assert last_payload["filtered_count"] == 5
    assert last_payload["has_more"] is False
    assert last_payload["next_offset"] is None
    assert [item["id"] for item in last_payload["items"]] == [100161]

    filtered_page = client.get(
        "/api/v1/tickets",
        params=[
            ("priority", "P1"),
            ("priority", "P2"),
            ("main_status", "IN_PROGRESS"),
            ("main_status", "WAITING_RESPONSE"),
            ("claim_status", "unclaimed"),
            ("pool_code", "T2_POOL"),
            ("limit", "2"),
            ("offset", "0"),
        ],
    )
    assert filtered_page.status_code == 200
    filtered_page_payload = filtered_page.json()
    assert filtered_page_payload["total_count"] == 5
    assert filtered_page_payload["filtered_count"] == 1
    assert filtered_page_payload["has_more"] is False
    assert filtered_page_payload["next_offset"] is None
    assert [item["id"] for item in filtered_page_payload["items"]] == [100177]


def test_customer_can_list_all_tickets_in_single_tenant_mode(client):
    login(client, "customer", "CustomerPass123")

    response = client.get("/api/v1/tickets")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 5
    assert {item["id"] for item in payload["items"]} == {100182, 100181, 100177, 100169, 100161}

    detail = client.get("/api/v1/tickets/100182")
    assert detail.status_code == 200


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
    assert payload["related_knowledge"] == []
    assert payload["reports"]
    assert "report_templates" in payload
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


def test_customer_can_create_ticket_and_see_global_ticket_list(client):
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


def test_ticket_live_response_returns_only_volatile_sections(client, db_session_factory):
    set_ticket_cache_backend(InMemoryTicketCacheBackend())
    with db_session_factory() as db:
        db.add(
            TicketComment(
                ticket_id=100181,
                actor_user_id="user-admin",
                actor_name="Admin",
                actor_role="ADMIN",
                visibility="INTERNAL",
                content="仅内部可见的协作记录。",
                is_system=False,
            )
        )
        db.commit()

    login(client, "customer", "CustomerPass123")
    response = client.get("/api/v1/tickets/100181/live")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert set(payload) == {
        "ticket",
        "available_actions",
        "pending_escalation",
        "activity_feed",
        "raw_alerts",
        "responsibility_summary",
        "permission_scope",
    }
    assert all(item["visibility"] == "PUBLIC" for item in payload["activity_feed"])
    assert payload["permission_scope"]["current_role"] == "CUSTOMER"


def test_ticket_detail_cache_hits_before_write_invalidation(client, db_session_factory):
    set_ticket_cache_backend(InMemoryTicketCacheBackend())
    login(client, "admin", "AdminPass123")

    first_detail = client.get("/api/v1/tickets/100177/detail")
    assert first_detail.status_code == 200, first_detail.text
    original_title = first_detail.json()["ticket"]["title"]

    with db_session_factory() as db:
        ticket = db.get(Ticket, 100177)
        assert ticket is not None
        ticket.title = "数据库已变更但缓存仍应返回旧标题"
        db.commit()
        db.refresh(ticket)
        current_version = ticket.version

    cached_detail = client.get("/api/v1/tickets/100177/detail")
    assert cached_detail.status_code == 200, cached_detail.text
    assert cached_detail.json()["ticket"]["title"] == original_title

    csrf = issue_csrf(client)
    update_response = client.patch(
        "/api/v1/tickets/100177",
        json={"version": current_version, "title": "写后失效的新标题"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert update_response.status_code == 200, update_response.text

    live_response = client.get("/api/v1/tickets/100177/live")
    assert live_response.status_code == 200, live_response.text
    assert live_response.json()["ticket"]["title"] == "写后失效的新标题"


def test_cached_detail_base_is_filtered_per_actor(client, db_session_factory):
    set_ticket_cache_backend(InMemoryTicketCacheBackend())
    with db_session_factory() as db:
        db.add(
            TicketComment(
                ticket_id=100181,
                actor_user_id="user-admin",
                actor_name="Admin",
                actor_role="ADMIN",
                visibility="INTERNAL",
                content="缓存底座中的内部评论。",
                is_system=False,
            )
        )
        db.commit()

    login(client, "admin", "AdminPass123")
    internal_detail = client.get("/api/v1/tickets/100181/detail")
    assert internal_detail.status_code == 200, internal_detail.text
    internal_payload = internal_detail.json()
    assert any(item["visibility"] == "INTERNAL" for item in internal_payload["activity_feed"])
    assert internal_payload["permission_scope"]["current_role"] == "T2"

    login(client, "customer", "CustomerPass123")
    customer_detail = client.get("/api/v1/tickets/100181/detail")
    assert customer_detail.status_code == 200, customer_detail.text
    customer_payload = customer_detail.json()
    assert all(item["visibility"] == "PUBLIC" for item in customer_payload["activity_feed"])
    assert customer_payload["permission_scope"]["current_role"] == "CUSTOMER"
