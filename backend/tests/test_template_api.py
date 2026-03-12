from __future__ import annotations

from .conftest import login


def switch_role(client, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    assert csrf
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


def test_template_management_requires_admin_role(client):
    login(client, "admin", "AdminPass123")

    denied = client.get("/api/v1/templates")
    assert denied.status_code == 403

    switch_role(client, "ADMIN")
    allowed = client.get("/api/v1/template-types")
    assert allowed.status_code == 200, allowed.text

    payload = allowed.json()
    assert [item["template_type"] for item in payload["items"]] == ["EMAIL", "WEBHOOK"]
    assert [field["key"] for field in payload["items"][0]["fields"]] == ["subject", "body"]
    assert [field["key"] for field in payload["items"][1]["fields"]] == ["url", "method", "headers", "body"]


def test_admin_can_create_preview_activate_and_render_webhook_template(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    create_payload = {
        "name": "闭环回调 Webhook",
        "code": "ticket_closeout_webhook",
        "template_type": "WEBHOOK",
        "description": "用于工单闭环回调。",
        "fields": {
            "url": "https://hooks.partner.local/cases/{{ ticket.id }}/closeout",
            "method": "GET",
            "headers": [
                {"key": "Content-Type", "value": "application/json"},
                {"key": "X-Case-ID", "value": "{{ ticket.id }}"},
            ],
            "body": "{\"ticket_id\": \"{{ ticket.id }}\", \"status\": \"{{ ticket.status }}\"}",
        },
    }
    create_response = client.post(
        "/api/v1/templates",
        json=create_payload,
        headers=admin_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    template_id = created["template"]["id"]
    assert created["template"]["status"] == "DRAFT"
    assert created["fields"]["method"] == "GET"

    preview_response = client.post(
        "/api/v1/templates/preview",
        json={
            "template_type": "WEBHOOK",
            "fields": create_payload["fields"],
            "context": {"ticket": {"id": "INC-20260311-001", "status": "RESOLVED"}},
        },
    )
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview["field_errors"] == []
    assert preview["rendered"]["url"] == "https://hooks.partner.local/cases/INC-20260311-001/closeout"
    assert preview["rendered"]["method"] == "GET"
    assert preview["rendered"]["headers"][1]["value"] == "INC-20260311-001"
    assert "INC-20260311-001" in preview["rendered"]["body"]

    status_response = client.post(
        f"/api/v1/templates/{template_id}/status",
        json={"status": "ACTIVE"},
        headers=admin_headers(client),
    )
    assert status_response.status_code == 200, status_response.text
    assert status_response.json()["template"]["status"] == "ACTIVE"

    render_response = client.post(
        "/api/v1/templates/render",
        json={
            "template_code": "ticket_closeout_webhook",
            "context": {"ticket": {"id": "INC-20260311-001", "status": "RESOLVED"}},
        },
    )
    assert render_response.status_code == 200, render_response.text
    rendered = render_response.json()
    assert rendered["template_type"] == "WEBHOOK"
    assert rendered["rendered"]["method"] == "GET"
    assert rendered["rendered"]["url"] == "https://hooks.partner.local/cases/INC-20260311-001/closeout"
    assert rendered["rendered"]["headers"]["X-Case-ID"] == "INC-20260311-001"
    assert "RESOLVED" in rendered["rendered"]["body"]


def test_template_render_requires_active_status_and_internal_role(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    create_response = client.post(
        "/api/v1/templates",
        json={
            "name": "工单升级邮件",
            "code": "ticket_escalation_email",
            "template_type": "EMAIL",
            "fields": {
                "subject": "[{{ ticket.priority }}] {{ ticket.id }} 已升级",
                "body": "标题：{{ ticket.title }}",
            },
        },
        headers=admin_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    template_id = create_response.json()["template"]["id"]

    inactive_render = client.post(
        "/api/v1/templates/render",
        json={"template_id": template_id, "context": {"ticket": {"id": "INC-1", "priority": "P1", "title": "告警"}}},
    )
    assert inactive_render.status_code == 409
    assert inactive_render.json()["detail"] == "Template is not active"

    activate = client.post(
        f"/api/v1/templates/{template_id}/status",
        json={"status": "ACTIVE"},
        headers=admin_headers(client),
    )
    assert activate.status_code == 200, activate.text

    login(client, "customer", "CustomerPass123")
    forbidden = client.post(
        "/api/v1/templates/render",
        json={"template_id": template_id, "context": {"ticket": {"id": "INC-1", "priority": "P1", "title": "告警"}}},
    )
    assert forbidden.status_code == 403


def test_preview_and_render_return_field_level_errors(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    preview_response = client.post(
        "/api/v1/templates/preview",
        json={
            "template_type": "EMAIL",
            "fields": {
                "subject": "{{ ticket.id }} / {{ missing.value }}",
                "body": "工单标题：{{ ticket.title }}",
            },
            "context": {"ticket": {"id": "INC-ERR-1", "title": "异常模板"}},
        },
    )
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview["rendered"]["body"] == "工单标题：异常模板"
    assert any(item["field"] == "subject" for item in preview["field_errors"])

    create_response = client.post(
        "/api/v1/templates",
        json={
            "name": "缺失变量邮件",
            "code": "missing_variable_email",
            "template_type": "EMAIL",
            "fields": {
                "subject": "{{ ticket.id }} / {{ missing.value }}",
                "body": "工单标题：{{ ticket.title }}",
            },
        },
        headers=admin_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    template_id = create_response.json()["template"]["id"]

    activate = client.post(
        f"/api/v1/templates/{template_id}/status",
        json={"status": "ACTIVE"},
        headers=admin_headers(client),
    )
    assert activate.status_code == 200, activate.text

    render_response = client.post(
        "/api/v1/templates/render",
        json={
            "template_id": template_id,
            "context": {"ticket": {"id": "INC-ERR-1", "title": "异常模板"}},
        },
    )
    assert render_response.status_code == 422
    detail = render_response.json()["detail"]
    assert detail["message"] == "Template render failed"
    assert any(item["field"] == "subject" for item in detail["field_errors"])
