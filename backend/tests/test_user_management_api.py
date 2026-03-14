from __future__ import annotations

from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.models import User, UserRole
from app.security import hash_password

from .conftest import login


def switch_role(client: TestClient, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    assert csrf
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def admin_headers(client: TestClient) -> dict[str, str]:
    csrf = client.cookies.get("XSRF-TOKEN")
    assert csrf
    return {"X-CSRF-Token": csrf, "Origin": "https://testserver"}


def create_user_payload(**overrides):
    payload = {
        "username": "operator.alpha",
        "display_name": "Operator Alpha",
        "email": "operator.alpha@example.com",
        "password": "OperatorAlpha123",
        "role_codes": ["T1"],
        "group_ids": [],
    }
    payload.update(overrides)
    return payload


def create_group_payload(**overrides):
    payload = {
        "name": "Blue Team",
        "description": "SOC analysts",
    }
    payload.update(overrides)
    return payload


@contextmanager
def additional_client(app):
    with TestClient(app, base_url="https://testserver") as client:
        yield client


def test_user_management_requires_admin_role(client: TestClient):
    login(client, "admin", "AdminPass123")

    users_denied = client.get("/api/v1/users")
    assert users_denied.status_code == 403

    groups_denied = client.get("/api/v1/user-groups")
    assert groups_denied.status_code == 403


def test_admin_can_create_list_get_update_disable_and_enable_user(client: TestClient):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    group_response = client.post(
        "/api/v1/user-groups",
        json=create_group_payload(),
        headers=admin_headers(client),
    )
    assert group_response.status_code == 200, group_response.text
    group_id = group_response.json()["group"]["id"]

    create_response = client.post(
        "/api/v1/users",
        json=create_user_payload(group_ids=[group_id]),
        headers=admin_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()["user"]
    user_id = created["id"]
    assert created["status"] == "active"
    assert created["roles"] == ["T1"]
    assert [group["id"] for group in created["groups"]] == [group_id]

    duplicate_response = client.post(
        "/api/v1/users",
        json=create_user_payload(email="operator.dup@example.com"),
        headers=admin_headers(client),
    )
    assert duplicate_response.status_code == 409

    list_response = client.get("/api/v1/users?search=operator.alpha&status=active&role_code=T1")
    assert list_response.status_code == 200, list_response.text
    listed = list_response.json()
    assert listed["total_count"] == 1
    assert listed["items"][0]["username"] == "operator.alpha"

    detail_response = client.get(f"/api/v1/users/{user_id}")
    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["user"]["username"] == "operator.alpha"

    second_group_response = client.post(
        "/api/v1/user-groups",
        json=create_group_payload(name="Shift B"),
        headers=admin_headers(client),
    )
    assert second_group_response.status_code == 200, second_group_response.text
    second_group_id = second_group_response.json()["group"]["id"]

    update_response = client.patch(
        f"/api/v1/users/{user_id}",
        json={
            "display_name": "Operator Alpha Prime",
            "email": "operator.alpha.prime@example.com",
            "group_ids": [group_id, second_group_id],
        },
        headers=admin_headers(client),
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()["user"]
    assert updated["display_name"] == "Operator Alpha Prime"
    assert updated["email"] == "operator.alpha.prime@example.com"
    assert {group["id"] for group in updated["groups"]} == {group_id, second_group_id}

    disable_response = client.post(
        f"/api/v1/users/{user_id}/status",
        json={"status": "disabled", "reason": "Offboarded"},
        headers=admin_headers(client),
    )
    assert disable_response.status_code == 200, disable_response.text
    disabled = disable_response.json()["user"]
    assert disabled["status"] == "disabled"
    assert disabled["disabled_reason"] == "Offboarded"

    repeated_disable = client.post(
        f"/api/v1/users/{user_id}/status",
        json={"status": "disabled", "reason": "Offboarded"},
        headers=admin_headers(client),
    )
    assert repeated_disable.status_code == 409

    enable_response = client.post(
        f"/api/v1/users/{user_id}/status",
        json={"status": "active"},
        headers=admin_headers(client),
    )
    assert enable_response.status_code == 200, enable_response.text
    enabled = enable_response.json()["user"]
    assert enabled["status"] == "active"
    assert enabled["disabled_at"] is None
    assert enabled["disabled_reason"] is None


def test_cannot_disable_or_delete_last_effective_admin(client: TestClient):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    disable_response = client.post(
        "/api/v1/users/user-admin/status",
        json={"status": "disabled", "reason": "maintenance"},
        headers=admin_headers(client),
    )
    assert disable_response.status_code == 409

    delete_response = client.delete(
        "/api/v1/users/user-admin",
        headers=admin_headers(client),
    )
    assert delete_response.status_code == 409


def test_delete_user_requires_no_business_participation_and_existing_target(
    client: TestClient, db_session_factory
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    with db_session_factory() as db:
        db.add(
            User(
                id="user-clean-delete",
                username="clean.delete",
                email="clean.delete@example.com",
                display_name="Clean Delete",
                password_hash=hash_password("CleanDelete123"),
                status="active",
            )
        )
        db.add(UserRole(user_id="user-clean-delete", role_code="T1", is_primary=True))
        db.commit()

    delete_clean = client.delete("/api/v1/users/user-clean-delete", headers=admin_headers(client))
    assert delete_clean.status_code == 200, delete_clean.text
    assert delete_clean.json()["message"] == "User deleted"

    delete_participated = client.delete("/api/v1/users/user-customer", headers=admin_headers(client))
    assert delete_participated.status_code == 409

    delete_missing = client.delete("/api/v1/users/user-missing", headers=admin_headers(client))
    assert delete_missing.status_code == 404


def test_group_management_and_membership_constraints(client: TestClient):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    create_group = client.post(
        "/api/v1/user-groups",
        json=create_group_payload(),
        headers=admin_headers(client),
    )
    assert create_group.status_code == 200, create_group.text
    group_id = create_group.json()["group"]["id"]

    duplicate_group = client.post(
        "/api/v1/user-groups",
        json=create_group_payload(description="duplicate"),
        headers=admin_headers(client),
    )
    assert duplicate_group.status_code == 409

    update_group = client.patch(
        f"/api/v1/user-groups/{group_id}",
        json={"name": "Blue Team Prime", "description": "Primary analysts"},
        headers=admin_headers(client),
    )
    assert update_group.status_code == 200, update_group.text
    assert update_group.json()["group"]["name"] == "Blue Team Prime"

    second_group = client.post(
        "/api/v1/user-groups",
        json=create_group_payload(name="Night Shift"),
        headers=admin_headers(client),
    )
    assert second_group.status_code == 200, second_group.text
    second_group_id = second_group.json()["group"]["id"]

    add_member = client.post(
        f"/api/v1/user-groups/{group_id}/members",
        json={"user_ids": ["user-analyst"]},
        headers=admin_headers(client),
    )
    assert add_member.status_code == 200, add_member.text
    assert add_member.json()["group"]["member_count"] == 1

    add_member_to_second = client.post(
        f"/api/v1/user-groups/{second_group_id}/members",
        json={"user_ids": ["user-analyst"]},
        headers=admin_headers(client),
    )
    assert add_member_to_second.status_code == 200, add_member_to_second.text
    assert add_member_to_second.json()["group"]["member_count"] == 1

    duplicate_member = client.post(
        f"/api/v1/user-groups/{group_id}/members",
        json={"user_ids": ["user-analyst"]},
        headers=admin_headers(client),
    )
    assert duplicate_member.status_code == 409

    detail_response = client.get(f"/api/v1/user-groups/{group_id}")
    assert detail_response.status_code == 200, detail_response.text
    members = detail_response.json()["members"]
    assert len(members) == 1
    assert members[0]["user_id"] == "user-analyst"

    delete_non_empty = client.delete(
        f"/api/v1/user-groups/{group_id}",
        headers=admin_headers(client),
    )
    assert delete_non_empty.status_code == 409

    remove_member = client.delete(
        f"/api/v1/user-groups/{group_id}/members/user-analyst",
        headers=admin_headers(client),
    )
    assert remove_member.status_code == 200, remove_member.text
    assert remove_member.json()["group"]["member_count"] == 0

    remove_missing_relation = client.delete(
        f"/api/v1/user-groups/{group_id}/members/user-analyst",
        headers=admin_headers(client),
    )
    assert remove_missing_relation.status_code == 404

    delete_empty = client.delete(
        f"/api/v1/user-groups/{group_id}",
        headers=admin_headers(client),
    )
    assert delete_empty.status_code == 200, delete_empty.text
    assert delete_empty.json()["message"] == "User group deleted"


def test_disabled_user_cannot_login_after_status_change(app: TestClient, client: TestClient):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    create_response = client.post(
        "/api/v1/users",
        json=create_user_payload(username="disabled.login", email="disabled.login@example.com"),
        headers=admin_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    user_id = create_response.json()["user"]["id"]

    disable_response = client.post(
        f"/api/v1/users/{user_id}/status",
        json={"status": "disabled", "reason": "Disabled for test"},
        headers=admin_headers(client),
    )
    assert disable_response.status_code == 200, disable_response.text

    with additional_client(app) as disabled_client:
        csrf = disabled_client.get("/auth/csrf").json()["csrf_token"]
        login_response = disabled_client.post(
            "/auth/login",
            json={"username": "disabled.login", "password": "OperatorAlpha123"},
            headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
        )
        assert login_response.status_code == 401


def test_disabled_user_session_is_rejected_on_followup_requests(app):
    with additional_client(app) as analyst_client:
        login(analyst_client, "analyst", "AnalystPass123")

        with additional_client(app) as admin_client:
            login(admin_client, "admin", "AdminPass123")
            switch_role(admin_client, "ADMIN")
            disable_response = admin_client.post(
                "/api/v1/users/user-analyst/status",
                json={"status": "disabled", "reason": "Incident review"},
                headers=admin_headers(admin_client),
            )
            assert disable_response.status_code == 200, disable_response.text

        followup_response = analyst_client.get("/auth/me")
        assert followup_response.status_code == 401
