from __future__ import annotations

import smtplib

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


def create_mail_sender(client, **overrides) -> dict:
    payload = {
        "sender_name": "SOC 通知发送者",
        "sender_email": "soc.sender@example.com",
        "auth_account": "smtp-account@example.com",
        "auth_password": "SenderPass123!",
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "security_type": "STARTTLS",
        "status": "ENABLED",
    }
    payload.update(overrides)
    response = client.post(
        "/api/v1/mail-senders",
        json=payload,
        headers=admin_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_mail_sender_management_requires_admin(client):
    login(client, "admin", "AdminPass123")

    denied_list = client.get("/api/v1/mail-senders")
    assert denied_list.status_code == 403

    csrf = issue_csrf(client)
    denied_create = client.post(
        "/api/v1/mail-senders",
        json={
            "sender_name": "Unauthorized",
            "sender_email": "unauthorized@example.com",
            "auth_account": "unauthorized@example.com",
            "auth_password": "Unauthorized123!",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "security_type": "STARTTLS",
            "status": "ENABLED",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert denied_create.status_code == 403


def test_admin_can_create_list_and_edit_mail_sender_without_password_exposure(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    created = create_mail_sender(client)
    assert created["sender_name"] == "SOC 通知发送者"
    assert created["sender_email"] == "soc.sender@example.com"
    assert created["status"] == "ENABLED"
    assert created["password_configured"] is True
    assert "auth_password" not in created

    listed = client.get("/api/v1/mail-senders")
    assert listed.status_code == 200, listed.text
    payload = listed.json()
    assert payload["total_count"] >= 1
    item = next(item for item in payload["items"] if item["id"] == created["id"])
    assert item["latest_test_status"] is None
    assert item["latest_test_at"] is None
    assert "auth_password" not in item

    updated = client.patch(
        f"/api/v1/mail-senders/{created['id']}",
        json={
            "sender_name": "SOC 通知发送者-更新",
            "smtp_port": 465,
            "security_type": "SSL",
        },
        headers=admin_headers(client),
    )
    assert updated.status_code == 200, updated.text
    update_payload = updated.json()
    assert update_payload["sender_name"] == "SOC 通知发送者-更新"
    assert update_payload["smtp_port"] == 465
    assert update_payload["security_type"] == "SSL"
    assert update_payload["password_configured"] is True
    assert "auth_password" not in update_payload

    detail = client.get(f"/api/v1/mail-senders/{created['id']}")
    assert detail.status_code == 200, detail.text
    detail_payload = detail.json()
    assert detail_payload["sender_name"] == "SOC 通知发送者-更新"
    assert detail_payload["password_configured"] is True
    assert "auth_password" not in detail_payload


def test_mail_sender_create_validation_errors(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    response = client.post(
        "/api/v1/mail-senders",
        json={
            "sender_name": " ",
            "sender_email": "not-an-email",
            "auth_account": "",
            "auth_password": "",
            "smtp_host": "",
            "smtp_port": 70000,
            "security_type": "INVALID",
            "status": "ENABLED",
        },
        headers=admin_headers(client),
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["message"] == "Validation failed"
    assert "sender_name" in detail["field_errors"]
    assert "sender_email" in detail["field_errors"]
    assert "auth_account" in detail["field_errors"]
    assert "auth_password" in detail["field_errors"]
    assert "smtp_host" in detail["field_errors"]
    assert "smtp_port" in detail["field_errors"]
    assert "security_type" in detail["field_errors"]


def test_mail_sender_test_send_success_and_failure_paths(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    created = create_mail_sender(client)

    monkeypatch.setattr(
        "app.modules.mail_senders.service.send_mail_sender_test_email",
        lambda **_kwargs: None,
        raising=False,
    )
    success = client.post(
        f"/api/v1/mail-senders/{created['id']}/test",
        json={"test_email": "receiver@example.com"},
        headers=admin_headers(client),
    )
    assert success.status_code == 200, success.text
    success_payload = success.json()
    assert success_payload["result"] == "SUCCESS"
    assert success_payload["error_summary"] is None

    detail_after_success = client.get(f"/api/v1/mail-senders/{created['id']}")
    assert detail_after_success.status_code == 200, detail_after_success.text
    assert detail_after_success.json()["latest_test_status"] == "SUCCESS"
    assert detail_after_success.json()["latest_test_at"] is not None

    monkeypatch.setattr(
        "app.modules.mail_senders.service.send_mail_sender_test_email",
        lambda **_kwargs: (_ for _ in ()).throw(
            smtplib.SMTPAuthenticationError(535, b"Authentication failed")
        ),
        raising=False,
    )
    auth_failed = client.post(
        f"/api/v1/mail-senders/{created['id']}/test",
        json={"test_email": "receiver@example.com"},
        headers=admin_headers(client),
    )
    assert auth_failed.status_code == 200, auth_failed.text
    auth_failed_payload = auth_failed.json()
    assert auth_failed_payload["result"] == "FAILED"
    assert "authentication" in auth_failed_payload["error_summary"].lower()

    monkeypatch.setattr(
        "app.modules.mail_senders.service.send_mail_sender_test_email",
        lambda **_kwargs: (_ for _ in ()).throw(OSError("Connection refused")),
        raising=False,
    )
    conn_failed = client.post(
        f"/api/v1/mail-senders/{created['id']}/test",
        json={"test_email": "receiver@example.com"},
        headers=admin_headers(client),
    )
    assert conn_failed.status_code == 200, conn_failed.text
    conn_failed_payload = conn_failed.json()
    assert conn_failed_payload["result"] == "FAILED"
    assert "connection" in conn_failed_payload["error_summary"].lower()

    monkeypatch.setattr(
        "app.modules.mail_senders.service.send_mail_sender_test_email",
        lambda **_kwargs: (_ for _ in ()).throw(smtplib.SMTPDataError(550, b"Rejected")),
        raising=False,
    )
    send_failed = client.post(
        f"/api/v1/mail-senders/{created['id']}/test",
        json={"test_email": "receiver@example.com"},
        headers=admin_headers(client),
    )
    assert send_failed.status_code == 200, send_failed.text
    send_failed_payload = send_failed.json()
    assert send_failed_payload["result"] == "FAILED"
    assert "send" in send_failed_payload["error_summary"].lower()

    detail_after_failures = client.get(f"/api/v1/mail-senders/{created['id']}")
    assert detail_after_failures.status_code == 200, detail_after_failures.text
    latest = detail_after_failures.json()
    assert latest["latest_test_status"] == "FAILED"
    assert latest["latest_test_at"] is not None
    assert "send" in (latest["latest_test_error_summary"] or "").lower()
    assert "SenderPass123!" not in (latest["latest_test_error_summary"] or "")


def test_mail_sender_test_send_validates_target_email(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    created = create_mail_sender(client)

    call_count = {"value": 0}

    def should_not_call(**_kwargs):
        call_count["value"] += 1

    monkeypatch.setattr(
        "app.modules.mail_senders.service.send_mail_sender_test_email",
        should_not_call,
        raising=False,
    )

    response = client.post(
        f"/api/v1/mail-senders/{created['id']}/test",
        json={"test_email": "invalid-email"},
        headers=admin_headers(client),
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["message"] == "Validation failed"
    assert "test_email" in detail["field_errors"]
    assert call_count["value"] == 0
