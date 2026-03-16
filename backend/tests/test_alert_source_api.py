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


def admin_headers(client) -> dict[str, str]:
    csrf = client.cookies.get("XSRF-TOKEN")
    assert csrf
    return {"X-CSRF-Token": csrf, "Origin": "https://testserver"}


def create_alert_source(client, **overrides) -> dict:
    payload = {
        "name": "StarRocks 告警库",
        "host": "10.20.100.35",
        "port": 9030,
        "username": "viewer",
        "password": "viewer-pass",
        "database_name": "db_scis",
        "table_name": "alert",
        "ticket_match_field": "alert_id",
        "status": "ENABLED",
    }
    payload.update(overrides)
    response = client.post("/api/v1/alert-sources", json=payload, headers=admin_headers(client))
    assert response.status_code == 200, response.text
    return response.json()


def test_alert_source_management_requires_admin(client):
    login(client, "admin", "AdminPass123")

    denied_list = client.get("/api/v1/alert-sources")
    assert denied_list.status_code == 403

    csrf = issue_csrf(client)
    denied_create = client.post(
        "/api/v1/alert-sources",
        json={
            "name": "unauthorized",
            "host": "10.0.0.1",
            "port": 9030,
            "username": "viewer",
            "password": "secret",
            "database_name": "db_scis",
            "table_name": "alert",
            "ticket_match_field": "alert_id",
            "status": "ENABLED",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert denied_create.status_code == 403


def test_admin_can_create_list_and_update_alert_source_without_password_exposure(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    created = create_alert_source(client)
    assert created["name"] == "StarRocks 告警库"
    assert created["host"] == "10.20.100.35"
    assert created["database_name"] == "db_scis"
    assert created["password_configured"] is True
    assert "password" not in created

    listed = client.get("/api/v1/alert-sources")
    assert listed.status_code == 200, listed.text
    payload = listed.json()
    assert payload["total_count"] >= 1
    item = next(item for item in payload["items"] if item["id"] == created["id"])
    assert item["ticket_match_field"] == "alert_id"
    assert "password" not in item

    updated = client.patch(
        f"/api/v1/alert-sources/{created['id']}",
        json={"name": "StarRocks 告警库-更新", "table_name": "alert_history"},
        headers=admin_headers(client),
    )
    assert updated.status_code == 200, updated.text
    update_payload = updated.json()
    assert update_payload["name"] == "StarRocks 告警库-更新"
    assert update_payload["table_name"] == "alert_history"
    assert update_payload["password_configured"] is True


def test_alert_source_create_validation_errors(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    response = client.post(
        "/api/v1/alert-sources",
        json={
            "name": " ",
            "host": "",
            "port": 70000,
            "username": "",
            "password": "",
            "database_name": "db-scis",
            "table_name": "bad-table",
            "ticket_match_field": "bad-field",
            "status": "UNKNOWN",
        },
        headers=admin_headers(client),
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["message"] == "Validation failed"
    assert "name" in detail["field_errors"]
    assert "host" in detail["field_errors"]
    assert "port" in detail["field_errors"]
    assert "username" in detail["field_errors"]
    assert "password" in detail["field_errors"]
    assert "database_name" in detail["field_errors"]
    assert "table_name" in detail["field_errors"]
    assert "ticket_match_field" in detail["field_errors"]
    assert "status" in detail["field_errors"]


def test_alert_source_test_and_query_paths(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    created = create_alert_source(client)

    monkeypatch.setattr(
        "app.modules.alert_sources.service._probe_alert_source",
        lambda _source: ["alert_id", "alert_name", "severity"],
    )
    success = client.post(
        f"/api/v1/alert-sources/{created['id']}/test",
        json={},
        headers=admin_headers(client),
    )
    assert success.status_code == 200, success.text
    success_payload = success.json()
    assert success_payload["result"] == "SUCCESS"
    assert "alert_id" in success_payload["sample_columns"]

    monkeypatch.setattr(
        "app.modules.alert_sources.service._query_alert_rows",
        lambda _source, keys: [
            {"alert_id": keys[0], "alert_name": "test-a", "severity": "high"},
            {"alert_id": keys[0], "alert_name": "test-b", "severity": "medium"},
            {"alert_id": keys[1], "alert_name": "test-c", "severity": "low"},
        ],
    )
    queried = client.post(
        f"/api/v1/alert-sources/{created['id']}/query",
        json={"ticket_keys": ["INC-1", "INC-2", "INC-404"]},
        headers=admin_headers(client),
    )
    assert queried.status_code == 200, queried.text
    payload = queried.json()
    assert payload["ticket_match_field"] == "alert_id"
    assert payload["total_rows"] == 3
    assert payload["matched_ticket_keys"] == ["INC-1", "INC-2"]
    assert payload["unmatched_ticket_keys"] == ["INC-404"]
    assert payload["items"][0]["row_count"] == 2
    assert payload["items"][1]["rows"][0]["severity"] == "low"


def test_alert_source_query_requires_enabled_status(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    created = create_alert_source(client, status="DISABLED")

    monkeypatch.setattr(
        "app.modules.alert_sources.service._query_alert_rows",
        lambda _source, _keys: [],
    )
    queried = client.post(
        f"/api/v1/alert-sources/{created['id']}/query",
        json={"ticket_keys": ["INC-1"]},
        headers=admin_headers(client),
    )
    assert queried.status_code == 422, queried.text
    assert "enabled" in queried.json()["detail"].lower()

