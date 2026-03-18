from __future__ import annotations

from .conftest import login


def switch_role(client, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def test_admin_can_list_ticket_audit_and_view_ticket_logs(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    listing = client.get("/api/v1/audit/tickets", params={"limit": 3, "offset": 0})
    assert listing.status_code == 200, listing.text

    payload = listing.json()
    assert payload["total_count"] == 5
    assert payload["filtered_count"] >= 3
    assert len(payload["items"]) == 3

    first = payload["items"][0]
    assert isinstance(first["ticket_id"], int)
    assert "log_count" in first
    assert "last_event_at" in first

    detail = client.get("/api/v1/audit/tickets/100182/logs", params={"limit": 50})
    assert detail.status_code == 200, detail.text

    detail_payload = detail.json()
    assert detail_payload["ticket"]["id"] == 100182
    assert detail_payload["total_count"] >= 3
    assert detail_payload["filtered_count"] >= 3
    assert len(detail_payload["items"]) >= 3
    assert {item["action_type"] for item in detail_payload["items"]} >= {"comment"}


def test_non_admin_roles_cannot_access_audit_api(client):
    login(client, "analyst", "AnalystPass123")

    denied_t1 = client.get("/api/v1/audit/tickets")
    assert denied_t1.status_code == 403

    switch_role(client, "T2")
    denied_t2 = client.get("/api/v1/audit/tickets")
    assert denied_t2.status_code == 403

    denied_logs = client.get("/api/v1/audit/tickets/100182/logs")
    assert denied_logs.status_code == 403



def test_audit_api_filters_and_pagination(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    search_filtered = client.get("/api/v1/audit/tickets", params={"search": "100182"})
    assert search_filtered.status_code == 200, search_filtered.text
    search_payload = search_filtered.json()
    assert search_payload["filtered_count"] == 1
    assert search_payload["items"][0]["ticket_id"] == 100182

    status_filtered = client.get("/api/v1/audit/tickets", params={"main_status": "CLOSED"})
    assert status_filtered.status_code == 200, status_filtered.text
    status_payload = status_filtered.json()
    assert status_payload["filtered_count"] == 1
    assert status_payload["items"][0]["ticket_id"] == 100161

    comment_filtered = client.get("/api/v1/audit/tickets", params={"action_type": "comment"})
    assert comment_filtered.status_code == 200, comment_filtered.text
    comment_payload = comment_filtered.json()
    assert comment_payload["filtered_count"] == 3
    assert {item["ticket_id"] for item in comment_payload["items"]} == {100177, 100181, 100182}

    internal_filtered = client.get("/api/v1/audit/tickets", params={"visibility": "INTERNAL"})
    assert internal_filtered.status_code == 200, internal_filtered.text
    internal_payload = internal_filtered.json()
    assert internal_payload["filtered_count"] == 1
    assert internal_payload["items"][0]["ticket_id"] == 100182

    logs_comment = client.get(
        "/api/v1/audit/tickets/100182/logs",
        params={"action_type": "comment", "limit": 50},
    )
    assert logs_comment.status_code == 200, logs_comment.text
    logs_comment_payload = logs_comment.json()
    assert logs_comment_payload["filtered_count"] == 1
    assert len(logs_comment_payload["items"]) == 1
    assert logs_comment_payload["items"][0]["action_type"] == "comment"

    logs_paged = client.get(
        "/api/v1/audit/tickets/100182/logs",
        params={"limit": 1, "offset": 1},
    )
    assert logs_paged.status_code == 200, logs_paged.text
    logs_paged_payload = logs_paged.json()
    assert logs_paged_payload["total_count"] == 3
    assert logs_paged_payload["filtered_count"] == 3
    assert len(logs_paged_payload["items"]) == 1
    assert logs_paged_payload["has_more"] is True
    assert logs_paged_payload["next_offset"] == 2


def test_audit_api_validates_inputs(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    invalid_visibility = client.get("/api/v1/audit/tickets", params={"visibility": "SECRET"})
    assert invalid_visibility.status_code == 422

    invalid_sort = client.get("/api/v1/audit/tickets", params={"sort_by": "unsupported"})
    assert invalid_sort.status_code == 422

    invalid_range = client.get(
        "/api/v1/audit/tickets/100182/logs",
        params={"created_from": "2026-03-18", "created_to": "2026-03-01"},
    )
    assert invalid_range.status_code == 422
