from __future__ import annotations

from datetime import timedelta

from app.modules.tickets.models import Ticket
from app.security import utcnow

from .conftest import login


def switch_role(client, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def test_t1_cannot_access_kpi_overview_and_t2_can_view_personal_only(client):
    login(client, "analyst", "AnalystPass123")

    denied = client.get("/api/v1/kpi/overview")
    assert denied.status_code == 403

    switch_role(client, "T2")
    response = client.get("/api/v1/kpi/overview", params={"window_days": 30})
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["window_days"] == 30
    assert payload["global"] is None
    assert payload["personal"]["summary"]["handled_count"] == 0
    assert payload["personal"]["summary"]["avg_response_seconds"] is None
    assert payload["personal"]["summary"]["avg_resolution_seconds"] is None
    assert payload["personal"]["summary"]["sla_attainment_rate"] is None
    assert payload["personal"]["summary"]["weighted_sla_attainment_rate"] is None
    assert len(payload["personal"]["trend"]) == 30


def test_admin_overview_includes_personal_and_global_metrics(client, db_session_factory):
    with db_session_factory() as db:
        now = utcnow()

        ticket_100182 = db.get(Ticket, 100182)
        ticket_100181 = db.get(Ticket, 100181)
        ticket_100161 = db.get(Ticket, 100161)
        assert ticket_100182 is not None
        assert ticket_100181 is not None
        assert ticket_100161 is not None

        ticket_100182.created_at = now - timedelta(days=1)
        ticket_100182.responded_at = ticket_100182.created_at + timedelta(hours=2)
        ticket_100182.response_deadline_at = ticket_100182.created_at + timedelta(hours=5)

        ticket_100181.created_at = now - timedelta(days=3)
        ticket_100181.responded_at = ticket_100181.created_at + timedelta(hours=3)
        ticket_100181.response_deadline_at = ticket_100181.created_at + timedelta(hours=5)
        ticket_100181.resolved_at = ticket_100181.created_at + timedelta(hours=20)
        ticket_100181.resolution_deadline_at = ticket_100181.created_at + timedelta(hours=18)
        ticket_100181.closed_at = None

        ticket_100161.created_at = now - timedelta(days=5)
        ticket_100161.responded_at = ticket_100161.created_at + timedelta(hours=4)
        ticket_100161.response_deadline_at = ticket_100161.created_at + timedelta(hours=5)
        ticket_100161.closed_at = ticket_100161.created_at + timedelta(hours=30)
        ticket_100161.resolved_at = ticket_100161.closed_at - timedelta(hours=1)
        ticket_100161.resolution_deadline_at = ticket_100161.closed_at
        db.commit()

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    response = client.get("/api/v1/kpi/overview", params={"window_days": 30})
    assert response.status_code == 200, response.text

    payload = response.json()
    personal = payload["personal"]
    global_block = payload["global"]

    assert global_block is not None

    assert personal["summary"]["handled_count"] == 2
    assert personal["summary"]["avg_response_seconds"] == 10800.0
    assert personal["summary"]["avg_resolution_seconds"] == 90000.0
    assert personal["summary"]["sla_attainment_rate"] == 50.0
    assert personal["summary"]["weighted_sla_attainment_rate"] == 39.42

    assert global_block["summary"]["handled_count"] == 2
    assert global_block["summary"]["avg_response_seconds"] == 10800.0
    assert global_block["summary"]["avg_resolution_seconds"] == 90000.0
    assert global_block["summary"]["sla_attainment_rate"] == 50.0
    assert global_block["summary"]["weighted_sla_attainment_rate"] == 39.42

    assert len(personal["trend"]) == 30
    assert len(global_block["trend"]) == 30
    assert sum(item["handled_count"] for item in personal["trend"]) == 2
    assert sum(item["handled_count"] for item in global_block["trend"]) == 2


def test_admin_can_list_kpi_users_with_filters_sort_and_pagination(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    listing = client.get("/api/v1/kpi/users", params={"window_days": 30})
    assert listing.status_code == 200, listing.text

    payload = listing.json()
    assert payload["total_count"] == 2
    assert payload["filtered_count"] == 2
    assert len(payload["items"]) == 2
    assert payload["items"][0]["username"] == "admin"
    assert payload["items"][0]["handled_count"] == 2

    role_filtered = client.get(
        "/api/v1/kpi/users",
        params={"window_days": 30, "role_code": "T1"},
    )
    assert role_filtered.status_code == 200, role_filtered.text
    role_payload = role_filtered.json()
    assert role_payload["filtered_count"] == 1
    assert role_payload["items"][0]["username"] == "analyst"

    search_filtered = client.get(
        "/api/v1/kpi/users",
        params={"window_days": 30, "search": "admin"},
    )
    assert search_filtered.status_code == 200, search_filtered.text
    search_payload = search_filtered.json()
    assert search_payload["filtered_count"] == 1
    assert search_payload["items"][0]["username"] == "admin"

    paged = client.get(
        "/api/v1/kpi/users",
        params={"window_days": 30, "limit": 1, "offset": 1},
    )
    assert paged.status_code == 200, paged.text
    paged_payload = paged.json()
    assert len(paged_payload["items"]) == 1
    assert paged_payload["items"][0]["username"] == "analyst"
    assert paged_payload["has_more"] is False
    assert paged_payload["next_offset"] is None


def test_non_admin_roles_cannot_list_kpi_users(client):
    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")

    internal_denied = client.get("/api/v1/kpi/users")
    assert internal_denied.status_code == 403

    login(client, "customer", "CustomerPass123")
    customer_denied = client.get("/api/v1/kpi/users")
    assert customer_denied.status_code == 403


def test_kpi_api_validates_window_and_sort_inputs(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    invalid_window = client.get("/api/v1/kpi/overview", params={"window_days": 15})
    assert invalid_window.status_code == 422

    invalid_sort = client.get("/api/v1/kpi/users", params={"sort_by": "unsupported"})
    assert invalid_sort.status_code == 422
