from __future__ import annotations

from .conftest import issue_csrf, login


def test_sla_policy_crud_and_patch_update(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    create_response = client.post(
        "/api/v1/config/ticket.sla_policy/SEV0",
        json={
            "category": "ticket.sla_policy",
            "key": "SEV0",
            "value": {"response_minutes": 15, "resolution_minutes": 45},
            "description": "SEV0 policy",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 201, create_response.text
    assert create_response.json()["value"] == {"response_minutes": 15, "resolution_minutes": 45}

    patch_response = client.patch(
        "/api/v1/config/ticket.sla_policy/SEV0",
        json={
            "value": {"response_minutes": 20, "resolution_minutes": 80},
            "description": "SEV0 policy updated",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert patch_response.status_code == 200, patch_response.text
    assert patch_response.json()["value"] == {"response_minutes": 20, "resolution_minutes": 80}

    list_response = client.get("/api/v1/config/ticket.sla_policy")
    assert list_response.status_code == 200, list_response.text
    items = list_response.json()["items"]
    sev0 = next(item for item in items if item["key"] == "SEV0")
    assert sev0["value"] == {"response_minutes": 20, "resolution_minutes": 80}

    delete_response = client.delete(
        "/api/v1/config/ticket.sla_policy/SEV0",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert delete_response.status_code == 204, delete_response.text

    list_after_delete = client.get("/api/v1/config/ticket.sla_policy")
    assert list_after_delete.status_code == 200, list_after_delete.text
    keys = {item["key"] for item in list_after_delete.json()["items"]}
    assert "SEV0" not in keys


def test_sla_policy_validation_rejects_invalid_payload(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/config/ticket.sla_policy/invalid",
        json={
            "category": "ticket.sla_policy",
            "key": "invalid",
            "value": {"response_minutes": 30, "resolution_minutes": 20},
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 422, response.text
    assert "resolution_minutes cannot be less than response_minutes" in response.json()["detail"]


def test_ticket_timeout_reminder_config_default_and_update(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    list_response = client.get("/api/v1/config/ticket.timeout_reminder")
    assert list_response.status_code == 200, list_response.text
    items = list_response.json()["items"]
    assert len(items) >= 1
    default_item = next(item for item in items if item["key"] == "DEFAULT")
    assert default_item["value"] == {
        "response_reminder_minutes": 5,
        "resolution_reminder_minutes": 30,
    }

    patch_response = client.patch(
        "/api/v1/config/ticket.timeout_reminder/DEFAULT",
        json={
            "value": {
                "response_reminder_minutes": 8,
                "resolution_reminder_minutes": 40,
            }
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert patch_response.status_code == 200, patch_response.text
    assert patch_response.json()["value"] == {
        "response_reminder_minutes": 8,
        "resolution_reminder_minutes": 40,
    }


def test_ticket_timeout_reminder_config_validation(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/config/ticket.timeout_reminder/custom",
        json={
            "category": "ticket.timeout_reminder",
            "key": "custom",
            "value": {
                "response_reminder_minutes": 5,
                "resolution_reminder_minutes": 30,
            },
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 422, response.text
    assert "only supports key `DEFAULT`" in response.json()["detail"]

    patch_response = client.patch(
        "/api/v1/config/ticket.timeout_reminder/DEFAULT",
        json={
            "value": {
                "response_reminder_minutes": 0,
                "resolution_reminder_minutes": 30,
            }
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert patch_response.status_code == 422, patch_response.text
    assert "response_reminder_minutes must be a positive integer" in patch_response.json()["detail"]
