from __future__ import annotations

from sqlalchemy import select

from app.modules.events.tasks import sweep_due_events
from app.modules.tasks.models import TaskTemplate

from .conftest import issue_csrf, login


def switch_role(client, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def auth_headers(client) -> dict[str, str]:
    csrf = client.cookies.get("XSRF-TOKEN")
    assert csrf
    return {"X-CSRF-Token": csrf, "Origin": "https://testserver"}


def create_active_render_template(
    client,
    *,
    template_type: str,
    code: str,
) -> dict:
    if template_type == "EMAIL":
        payload = {
            "name": "任务邮件模板",
            "code": code,
            "template_type": "EMAIL",
            "fields": {
                "subject": "[{{ ticket.priority }}] {{ ticket.id }} 通知",
                "body": "工单标题：{{ ticket.title }}",
            },
        }
    else:
        payload = {
            "name": "任务回调模板",
            "code": code,
            "template_type": "WEBHOOK",
            "fields": {
                "url": "https://hooks.partner.local/tickets/{{ ticket.id }}",
                "method": "POST",
                "headers": [{"key": "Content-Type", "value": "application/json"}],
                "body": "{\"ticket_id\": \"{{ ticket.id }}\"}",
            },
        }

    create_response = client.post("/api/v1/templates", json=payload, headers=auth_headers(client))
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()

    activate_response = client.post(
        f"/api/v1/templates/{created['template']['id']}/status",
        json={"status": "ACTIVE"},
        headers=auth_headers(client),
    )
    assert activate_response.status_code == 200, activate_response.text
    return activate_response.json()["template"]


def create_task_template(
    client,
    *,
    name: str,
    task_type: str,
    reference_template_id: str,
    recipient_config: dict | None = None,
    target_config: dict | None = None,
) -> dict:
    response = client.post(
        "/api/v1/task-templates",
        json={
            "name": name,
            "task_type": task_type,
            "reference_template_id": reference_template_id,
            "status": "ACTIVE",
            "recipient_config": recipient_config
            or {"to": [{"source_type": "CUSTOM_EMAIL", "value": "soc@example.com"}], "cc": [], "bcc": []},
            "target_config": target_config or {},
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_mail_sender(
    client,
    *,
    status: str = "ENABLED",
    sender_email: str = "sender.task@example.com",
) -> dict:
    response = client.post(
        "/api/v1/mail-senders",
        json={
            "sender_name": "任务发送者",
            "sender_email": sender_email,
            "auth_account": "smtp.account@example.com",
            "auth_password": "SenderForTask123!",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "security_type": "STARTTLS",
            "status": status,
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_event_rule(client, *, task_template_ids: list[str]) -> dict:
    response = client.post(
        "/api/v1/events",
        json={
            "name": "工单创建时触发任务",
            "code": "evt_task_dispatch_on_create",
            "event_type": "normal",
            "status": "enabled",
            "trigger_point": "ticket.created",
            "filters": [{"field": "priority", "operator": "in", "values": ["P1"]}],
            "time_rule": {"mode": "immediate"},
            "task_template_ids": task_template_ids,
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_ticket(client) -> int:
    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "任务模块联调工单",
            "description": "用于验证任务实例创建与执行",
            "category_id": "network",
            "priority": "P1",
            "risk_score": 91,
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["ticket"]["id"]


def test_admin_can_create_email_task_template_and_event_reads_real_bindable_templates(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    render_template = create_active_render_template(
        client,
        template_type="EMAIL",
        code="task_email_template",
    )

    create_response = client.post(
        "/api/v1/task-templates",
        json={
            "name": "P1 邮件通知任务",
            "task_type": "EMAIL",
            "reference_template_id": render_template["id"],
            "status": "ACTIVE",
            "recipient_config": {
                "to": [
                    {"source_type": "CUSTOM_EMAIL", "value": "soc@example.com"},
                    {"source_type": "CURRENT_HANDLER"},
                ],
                "cc": [{"source_type": "ROLE_MEMBERS", "value": "T2"}],
                "bcc": [],
            },
            "target_config": {},
        },
        headers=auth_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    assert created["task_type"] == "EMAIL"
    assert created["status"] == "ACTIVE"
    assert created["reference_template_id"] == render_template["id"]
    assert len(created["recipient_config"]["to"]) == 2

    list_response = client.get("/api/v1/task-templates")
    assert list_response.status_code == 200, list_response.text
    listed = list_response.json()["items"]
    assert any(item["id"] == created["id"] for item in listed)

    bindable_response = client.get("/api/v1/events/task-templates")
    assert bindable_response.status_code == 200, bindable_response.text
    bindable_items = bindable_response.json()["items"]
    bindable = next(item for item in bindable_items if item["id"] == created["id"])
    assert bindable["name"] == "P1 邮件通知任务"
    assert bindable["group"] == "email"


def test_non_admin_cannot_manage_task_templates(client):
    login(client, "analyst", "AnalystPass123")

    denied = client.get("/api/v1/task-templates")
    assert denied.status_code == 403

    csrf = issue_csrf(client)
    create_response = client.post(
        "/api/v1/task-templates",
        json={
            "name": "未授权任务模板",
            "task_type": "WEBHOOK",
            "reference_template_id": "tpl-any",
            "status": "ACTIVE",
            "recipient_config": {"to": [], "cc": [], "bcc": []},
            "target_config": {},
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 403


def test_webhook_task_template_rejects_payload_override_fields(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    render_template = create_active_render_template(
        client,
        template_type="WEBHOOK",
        code="task_webhook_template",
    )

    response = client.post(
        "/api/v1/task-templates",
        json={
            "name": "非法覆盖 Webhook 任务",
            "task_type": "WEBHOOK",
            "reference_template_id": render_template["id"],
            "status": "ACTIVE",
            "recipient_config": {"to": [], "cc": [], "bcc": []},
            "target_config": {
                "url": "https://override.local",
                "method": "DELETE",
            },
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["message"] == "Validation failed"
    assert "target_config" in detail["field_errors"]


def test_event_dispatch_creates_task_instances_and_tasks_api_lists_successes(
    client, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    email_template = create_active_render_template(
        client,
        template_type="EMAIL",
        code="dispatch_email_template",
    )
    webhook_template = create_active_render_template(
        client,
        template_type="WEBHOOK",
        code="dispatch_webhook_template",
    )
    email_task = create_task_template(
        client,
        name="创建即发邮件",
        task_type="EMAIL",
        reference_template_id=email_template["id"],
    )
    webhook_task = create_task_template(
        client,
        name="创建即发回调",
        task_type="WEBHOOK",
        reference_template_id=webhook_template["id"],
        recipient_config={"to": [], "cc": [], "bcc": []},
    )

    delivery_calls: dict[str, list[dict]] = {"email": [], "webhook": []}

    def fake_email_delivery(*, recipients, rendered, **_kwargs):
        delivery_calls["email"].append({"recipients": recipients, "rendered": rendered})
        return {"provider": "stub-email", "accepted": len(recipients)}

    def fake_webhook_delivery(*, request_payload, **_kwargs):
        delivery_calls["webhook"].append(request_payload)
        return {"provider": "stub-webhook", "status_code": 204}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        fake_email_delivery,
        raising=False,
    )
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_webhook",
        fake_webhook_delivery,
        raising=False,
    )

    create_event_rule(client, task_template_ids=[email_task["id"], webhook_task["id"]])
    create_ticket(client)
    sweep_due_events()

    task_list = client.get("/api/v1/tasks")
    assert task_list.status_code == 200, task_list.text
    payload = task_list.json()
    assert payload["total_count"] >= 2
    items = [item for item in payload["items"] if item["task_template_id"] in {email_task["id"], webhook_task["id"]}]
    assert len(items) == 2
    assert {item["status"] for item in items} == {"SUCCESS"}

    email_item = next(item for item in items if item["task_type"] == "EMAIL")
    detail = client.get(f"/api/v1/tasks/{email_item['id']}")
    assert detail.status_code == 200, detail.text
    detail_payload = detail.json()
    assert detail_payload["status"] == "SUCCESS"
    assert detail_payload["source_event_id"]
    assert len(detail_payload["logs"]) >= 2
    assert delivery_calls["email"]
    assert delivery_calls["webhook"]


def test_failed_task_can_retry_and_duplicate_retry_is_blocked_when_pending(
    client, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    email_template = create_active_render_template(
        client,
        template_type="EMAIL",
        code="retry_email_template",
    )
    task_template = create_task_template(
        client,
        name="失败后允许重试的邮件任务",
        task_type="EMAIL",
        reference_template_id=email_template["id"],
    )

    def failing_email_delivery(**_kwargs):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        failing_email_delivery,
        raising=False,
    )

    create_event_rule(client, task_template_ids=[task_template["id"]])
    create_ticket(client)
    sweep_due_events()

    failed_list = client.get("/api/v1/tasks", params={"status": "FAILED"})
    assert failed_list.status_code == 200, failed_list.text
    failed_task = next(
        item for item in failed_list.json()["items"] if item["task_template_id"] == task_template["id"]
    )
    assert failed_task["status"] == "FAILED"

    monkeypatch.setattr(
        "app.modules.tasks.service.enqueue_task_instance_execution",
        lambda *_args, **_kwargs: None,
        raising=False,
    )

    retry_response = client.post(
        f"/api/v1/tasks/{failed_task['id']}/retry",
        headers=auth_headers(client),
    )
    assert retry_response.status_code == 200, retry_response.text
    retry_payload = retry_response.json()
    assert retry_payload["id"] != failed_task["id"]
    assert retry_payload["status"] == "PENDING"
    assert retry_payload["retry_of_task_id"] == failed_task["id"]

    duplicate_retry = client.post(
        f"/api/v1/tasks/{failed_task['id']}/retry",
        headers=auth_headers(client),
    )
    assert duplicate_retry.status_code == 409, duplicate_retry.text


def test_retry_creates_new_successful_instance_without_overwriting_original(
    client, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    email_template = create_active_render_template(
        client,
        template_type="EMAIL",
        code="retry_success_email_template",
    )
    task_template = create_task_template(
        client,
        name="失败后再次发送邮件",
        task_type="EMAIL",
        reference_template_id=email_template["id"],
    )

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("temporary failure")),
        raising=False,
    )

    create_event_rule(client, task_template_ids=[task_template["id"]])
    create_ticket(client)
    sweep_due_events()

    failed_task = next(
        item
        for item in client.get("/api/v1/tasks", params={"status": "FAILED"}).json()["items"]
        if item["task_template_id"] == task_template["id"]
    )

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **_kwargs: {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    retry_response = client.post(
        f"/api/v1/tasks/{failed_task['id']}/retry",
        headers=auth_headers(client),
    )
    assert retry_response.status_code == 200, retry_response.text
    retry_payload = retry_response.json()
    assert retry_payload["status"] == "SUCCESS"
    assert retry_payload["id"] != failed_task["id"]

    original_detail = client.get(f"/api/v1/tasks/{failed_task['id']}")
    assert original_detail.status_code == 200, original_detail.text
    assert original_detail.json()["status"] == "FAILED"


def test_webhook_invalid_url_marks_task_failed(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    create_response = client.post(
        "/api/v1/templates",
        json={
            "name": "非法 URL 回调模板",
            "code": "invalid_url_webhook_template",
            "template_type": "WEBHOOK",
            "fields": {
                "url": "{{ ticket.title }}",
                "method": "POST",
                "headers": [],
                "body": "{\"ticket_id\": \"{{ ticket.id }}\"}",
            },
        },
        headers=auth_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    template_id = create_response.json()["template"]["id"]
    activate_response = client.post(
        f"/api/v1/templates/{template_id}/status",
        json={"status": "ACTIVE"},
        headers=auth_headers(client),
    )
    assert activate_response.status_code == 200, activate_response.text

    task_template = create_task_template(
        client,
        name="非法 URL Webhook 任务",
        task_type="WEBHOOK",
        reference_template_id=template_id,
        recipient_config={"to": [], "cc": [], "bcc": []},
    )

    create_event_rule(client, task_template_ids=[task_template["id"]])
    create_ticket(client)
    sweep_due_events()

    failed_task = next(
        item
        for item in client.get("/api/v1/tasks", params={"status": "FAILED"}).json()["items"]
        if item["task_template_id"] == task_template["id"]
    )
    assert failed_task["error_message"] == "Template render failed"

    detail = client.get(f"/api/v1/tasks/{failed_task['id']}")
    assert detail.status_code == 200, detail.text
    assert any(log["rendered_summary"].get("field_errors") for log in detail.json()["logs"])


def test_webhook_get_ignores_body_on_delivery(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    create_response = client.post(
        "/api/v1/templates",
        json={
            "name": "GET 回调模板",
            "code": "get_webhook_template",
            "template_type": "WEBHOOK",
            "fields": {
                "url": "https://hooks.partner.local/tickets/{{ ticket.id }}",
                "method": "GET",
                "headers": [{"key": "Accept", "value": "application/json"}],
                "body": "{\"ignored\": true, \"ticket_id\": \"{{ ticket.id }}\"}",
            },
        },
        headers=auth_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    template_id = create_response.json()["template"]["id"]
    activate_response = client.post(
        f"/api/v1/templates/{template_id}/status",
        json={"status": "ACTIVE"},
        headers=auth_headers(client),
    )
    assert activate_response.status_code == 200, activate_response.text

    task_template = create_task_template(
        client,
        name="GET Webhook 任务",
        task_type="WEBHOOK",
        reference_template_id=template_id,
        recipient_config={"to": [], "cc": [], "bcc": []},
    )

    captured_request: dict[str, object] = {}

    def fake_webhook_delivery(*, request_payload, **_kwargs):
        captured_request.update(request_payload)
        return {"provider": "stub-webhook", "status_code": 200}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_webhook",
        fake_webhook_delivery,
        raising=False,
    )

    create_event_rule(client, task_template_ids=[task_template["id"]])
    create_ticket(client)
    sweep_due_events()

    assert captured_request["method"] == "GET"
    assert captured_request["body"] is None


def test_task_execution_rejects_disabled_mail_sender(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    sender = create_mail_sender(client, status="ENABLED")
    email_template = create_active_render_template(
        client,
        template_type="EMAIL",
        code="task_email_sender_disabled_template",
    )
    task_template = create_task_template(
        client,
        name="停用发送者任务",
        task_type="EMAIL",
        reference_template_id=email_template["id"],
        target_config={"sender_config_id": sender["id"]},
    )

    disable_sender = client.post(
        f"/api/v1/mail-senders/{sender['id']}/status",
        json={"status": "DISABLED"},
        headers=auth_headers(client),
    )
    assert disable_sender.status_code == 200, disable_sender.text

    delivery_calls = {"count": 0}

    def fake_email_delivery(**_kwargs):
        delivery_calls["count"] += 1
        return {"provider": "stub-email", "accepted": 1}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        fake_email_delivery,
        raising=False,
    )

    create_event_rule(client, task_template_ids=[task_template["id"]])
    create_ticket(client)
    sweep_due_events()

    failed_task = next(
        item
        for item in client.get("/api/v1/tasks", params={"status": "FAILED"}).json()["items"]
        if item["task_template_id"] == task_template["id"]
    )
    assert "sender" in failed_task["error_message"].lower()
    assert "disabled" in failed_task["error_message"].lower()
    assert delivery_calls["count"] == 0


def test_task_execution_rejects_missing_mail_sender(client, db_session_factory, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    sender = create_mail_sender(client, status="ENABLED")
    email_template = create_active_render_template(
        client,
        template_type="EMAIL",
        code="task_email_sender_missing_template",
    )
    task_template = create_task_template(
        client,
        name="缺失发送者任务",
        task_type="EMAIL",
        reference_template_id=email_template["id"],
        target_config={"sender_config_id": sender["id"]},
    )

    with db_session_factory() as db:
        record = db.scalar(select(TaskTemplate).where(TaskTemplate.id == task_template["id"]))
        assert record is not None
        updated_target = dict(record.target_config or {})
        updated_target["sender_config_id"] = "sender-missing-id"
        record.target_config = updated_target
        db.commit()

    delivery_calls = {"count": 0}

    def fake_email_delivery(**_kwargs):
        delivery_calls["count"] += 1
        return {"provider": "stub-email", "accepted": 1}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        fake_email_delivery,
        raising=False,
    )

    create_event_rule(client, task_template_ids=[task_template["id"]])
    create_ticket(client)
    sweep_due_events()

    failed_task = next(
        item
        for item in client.get("/api/v1/tasks", params={"status": "FAILED"}).json()["items"]
        if item["task_template_id"] == task_template["id"]
    )
    assert "sender" in failed_task["error_message"].lower()
    assert "not found" in failed_task["error_message"].lower()
    assert delivery_calls["count"] == 0
