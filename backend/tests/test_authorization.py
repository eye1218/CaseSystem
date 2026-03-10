from __future__ import annotations

from .conftest import issue_csrf, login


def test_admin_endpoint_requires_matching_active_role(client):
    login_response = login(client, "admin", "AdminPass123")
    assert login_response["user"]["active_role"] == "T2"

    denied = client.get("/admin/overview")
    assert denied.status_code == 403

    csrf = client.cookies.get("XSRF-TOKEN")
    switched = client.post(
        "/auth/switch-role",
        json={"active_role_code": "ADMIN"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert switched.status_code == 200
    assert switched.json()["user"]["active_role"] == "ADMIN"

    allowed = client.get("/admin/overview")
    assert allowed.status_code == 200


def test_customer_object_access_is_scoped_to_self(client):
    login(client, "customer", "CustomerPass123")
    own_object = client.get("/objects/customer/user-customer")
    assert own_object.status_code == 200

    other_object = client.get("/objects/customer/user-admin")
    assert other_object.status_code == 403


def test_internal_object_access_uses_active_role_or_ownership(client):
    login(client, "analyst", "AnalystPass123")

    as_owner = client.get("/objects/internal/user-analyst")
    assert as_owner.status_code == 200

    denied = client.get("/objects/internal/user-admin")
    assert denied.status_code == 403

    csrf = client.cookies.get("XSRF-TOKEN")
    switched = client.post(
        "/auth/switch-role",
        json={"active_role_code": "T2"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert switched.status_code == 200

    allowed = client.get("/objects/internal/user-admin")
    assert allowed.status_code == 200


def test_state_changing_endpoints_require_csrf(client):
    issue_csrf(client)
    login_without_header = client.post("/auth/login", json={"username": "admin", "password": "AdminPass123"})
    assert login_without_header.status_code == 403
