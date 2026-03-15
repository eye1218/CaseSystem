from __future__ import annotations

import smtplib
from datetime import timedelta

from sqlalchemy import select

from app.models import User, UserRole
from app.modules.events.models import Event
from app.modules.events.tasks import sweep_due_events
from app.modules.tasks.models import TaskInstance
from app.security import hash_password, utcnow

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


def create_email_template(
    client,
    *,
    code: str,
    broken: bool = False,
    body: str = "工单标题：{{ ticket.title }}；状态：{{ ticket.status }}",
) -> str:
    subject = "{{ ticket.id }} / {{ missing.value }}" if broken else "[{{ ticket.priority }}] {{ ticket.id }}"
    create_response = client.post(
        "/api/v1/templates",
        json={
            "name": code,
            "code": code,
            "template_type": "EMAIL",
            "fields": {
                "subject": subject,
                "body": body,
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
    return template_id


def create_task_template(
    client,
    *,
    name: str,
    reference_template_id: str,
    recipient_config: dict,
    sender_config_id: str | None = None,
) -> str:
    payload = {
        "name": name,
        "task_type": "EMAIL",
        "reference_template_id": reference_template_id,
        "status": "ACTIVE",
        "recipient_config": recipient_config,
        "target_config": {},
    }
    if sender_config_id is not None:
        payload["sender_config_id"] = sender_config_id
    response = client.post(
        "/api/v1/task-templates",
        json=payload,
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def create_mail_sender(client, *, status: str = "ENABLED") -> str:
    response = client.post(
        "/api/v1/mail-senders",
        json={
            "sender_name": "文档测试发送者",
            "sender_email": "doc.sender@example.com",
            "auth_account": "smtp-account@example.com",
            "auth_password": "SenderPass123!",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "security_type": "STARTTLS",
            "status": status,
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def create_event_rule(
    client,
    *,
    code: str,
    trigger_point: str,
    task_template_id: str,
    event_type: str = "normal",
    time_rule: dict | None = None,
) -> str:
    response = client.post(
        "/api/v1/events",
        json={
            "name": code,
            "code": code,
            "event_type": event_type,
            "status": "enabled",
            "trigger_point": trigger_point,
            "filters": [],
            "time_rule": time_rule or {"mode": "immediate"},
            "task_template_ids": [task_template_id],
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def create_ticket(client, *, title: str) -> int:
    response = client.post(
        "/api/v1/tickets",
        json={
            "title": title,
            "description": "流程测试工单",
            "category_id": "network",
            "priority": "P1",
            "risk_score": 90,
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["ticket"]["id"]


def get_ticket_version(client, ticket_id: int) -> int:
    detail = client.get(f"/api/v1/tickets/{ticket_id}/detail")
    assert detail.status_code == 200, detail.text
    return detail.json()["ticket"]["version"]


def execute_ticket_action(client, ticket_id: int, action: str, note: str) -> None:
    response = client.post(
        f"/api/v1/tickets/{ticket_id}/actions/{action}",
        json={"note": note, "version": get_ticket_version(client, ticket_id)},
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text


def list_ticket_tasks(client, *, ticket_id: int, task_template_id: str) -> list[dict]:
    response = client.get("/api/v1/tasks", params={"ticket_id": ticket_id})
    assert response.status_code == 200, response.text
    return [
        item
        for item in response.json()["items"]
        if item["task_template_id"] == task_template_id
    ]


def get_task_detail(client, task_id: str) -> dict:
    response = client.get(f"/api/v1/tasks/{task_id}")
    assert response.status_code == 200, response.text
    return response.json()


def latest_event_dispatch_for_ticket(db_session_factory, *, ticket_id: int, rule_code: str) -> Event:
    with db_session_factory() as db:
        return next(
            event
            for event in db.scalars(select(Event).order_by(Event.created_at.asc())).all()
            if event.payload.get("kind") == "event_rule_dispatch"
            and event.payload.get("ticket_id") == ticket_id
            and event.payload.get("rule_code") == rule_code
        )


def latest_timeout_signal_for_ticket(db_session_factory, *, ticket_id: int, trigger_point: str) -> Event:
    with db_session_factory() as db:
        return next(
            event
            for event in db.scalars(select(Event).order_by(Event.created_at.asc())).all()
            if event.payload.get("kind") == "ticket_timeout_signal"
            and event.payload.get("ticket_id") == ticket_id
            and event.payload.get("trigger_point") == trigger_point
        )


def force_event_due(db_session_factory, *, event_id: str) -> None:
    with db_session_factory() as db:
        event = db.scalar(select(Event).where(Event.id == event_id))
        assert event is not None
        event.trigger_time = utcnow() - timedelta(seconds=1)
        db.commit()


def create_active_user_with_role(
    db_session_factory,
    *,
    user_id: str,
    username: str,
    display_name: str,
    email: str | None,
    role_code: str,
) -> None:
    with db_session_factory() as db:
        db.add(
            User(
                id=user_id,
                username=username,
                email=email,
                display_name=display_name,
                password_hash=hash_password("RoleUserPass123"),
                status="active",
            )
        )
        db.add(
            UserRole(
                user_id=user_id,
                role_code=role_code,
                is_primary=True,
            )
        )
        db.commit()


def test_tc_001_create_ticket_triggers_email_success(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    template_id = create_email_template(client, code="tc001_ticket_created")
    task_template_id = create_task_template(
        client,
        name="TC001 创建通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "receiver1@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc001_event_created",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-001 创建工单")

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    detail = get_task_detail(client, tasks[0]["id"])
    assert [log["stage"] for log in detail["logs"]] == [
        "created",
        "running",
        "recipients_resolved",
        "success",
    ]
    assert captures[0]["recipients"]["to"] == ["receiver1@example.com"]
    assert str(ticket_id) in captures[0]["rendered"]["subject"]


def test_tc_002_close_ticket_triggers_email_success(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    template_id = create_email_template(client, code="tc002_ticket_closed")
    task_template_id = create_task_template(
        client,
        name="TC002 关闭通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "close@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc002_event_closed",
        trigger_point="ticket.closed",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-002 关闭工单")
    execute_ticket_action(client, ticket_id, "respond", "respond")
    execute_ticket_action(client, ticket_id, "resolve", "resolve")
    execute_ticket_action(client, ticket_id, "close", "close")

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    assert captures[0]["recipients"]["to"] == ["close@example.com"]


def test_tc_003_reopen_ticket_triggers_email_success(client, monkeypatch):
    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    template_id = create_email_template(client, code="tc003_ticket_reopened")
    task_template_id = create_task_template(
        client,
        name="TC003 重开通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "reopen@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc003_event_reopened",
        trigger_point="ticket.reopened",
        task_template_id=task_template_id,
    )

    login(client, "customer", "CustomerPass123")
    ticket_id = create_ticket(client, title="TC-003 客户重开工单")
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    execute_ticket_action(client, ticket_id, "respond", "respond")
    execute_ticket_action(client, ticket_id, "resolve", "resolve")
    execute_ticket_action(client, ticket_id, "close", "close")
    login(client, "customer", "CustomerPass123")
    execute_ticket_action(client, ticket_id, "reopen", "reopen")

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    assert captures[0]["recipients"]["to"] == ["reopen@example.com"]


def test_tc_004_response_timeout_triggers_email_success(
    client, db_session_factory, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    template_id = create_email_template(client, code="tc004_response_timeout")
    task_template_id = create_task_template(
        client,
        name="TC004 响应超时通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "timeout@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc004_event_timeout",
        trigger_point="ticket.response.timeout",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-004 响应超时")
    timeout_signal = latest_timeout_signal_for_ticket(
        db_session_factory,
        ticket_id=ticket_id,
        trigger_point="ticket.response.timeout",
    )
    force_event_due(db_session_factory, event_id=timeout_signal.id)
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    detail = get_task_detail(client, tasks[0]["id"])
    assert detail["source_event_id"]
    assert captures[0]["recipients"]["to"] == ["timeout@example.com"]


def test_tc_005_event_triggers_before_baseline_time(
    client, db_session_factory, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    template_id = create_email_template(client, code="tc005_timer_before")
    task_template_id = create_task_template(
        client,
        name="TC005 提前触发通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "before@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc005_event_before",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
        event_type="timer",
        time_rule={
            "target_offset_amount": 30,
            "target_offset_unit": "minutes",
            "adjustment_direction": "before",
            "adjustment_amount": 5,
            "adjustment_unit": "minutes",
        },
    )

    ticket_id = create_ticket(client, title="TC-005 提前触发")
    event = latest_event_dispatch_for_ticket(
        db_session_factory,
        ticket_id=ticket_id,
        rule_code="tc005_event_before",
    )
    assert event.trigger_time is not None
    force_event_due(db_session_factory, event_id=event.id)
    sweep_due_events()
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    assert captures[0]["recipients"]["to"] == ["before@example.com"]


def test_tc_006_event_triggers_after_baseline_time(
    client, db_session_factory, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 1},
        raising=False,
    )

    template_id = create_email_template(client, code="tc006_delayed_after")
    task_template_id = create_task_template(
        client,
        name="TC006 延后触发通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "after@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc006_event_after",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
        time_rule={"mode": "delayed", "delay_amount": 5, "delay_unit": "minutes"},
    )

    ticket_id = create_ticket(client, title="TC-006 延后触发")
    event = latest_event_dispatch_for_ticket(
        db_session_factory,
        ticket_id=ticket_id,
        rule_code="tc006_event_after",
    )
    assert event.trigger_time is not None
    force_event_due(db_session_factory, event_id=event.id)
    sweep_due_events()
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    assert captures[0]["recipients"]["to"] == ["after@example.com"]


def test_tc_007_multi_recipients_send_success(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 3},
        raising=False,
    )

    template_id = create_email_template(client, code="tc007_multi_recipients")
    task_template_id = create_task_template(
        client,
        name="TC007 多收件人通知",
        reference_template_id=template_id,
        recipient_config={
            "to": [
                {"source_type": "CUSTOM_EMAIL", "value": "receiver1@example.com"},
                {"source_type": "CUSTOM_EMAIL", "value": "receiver2@example.com"},
                {"source_type": "CUSTOM_EMAIL", "value": "receiver3@example.com"},
            ],
            "cc": [],
            "bcc": [],
        },
    )
    create_event_rule(
        client,
        code="tc007_event_multi",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-007 多收件人")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    assert captures[0]["recipients"]["to"] == [
        "receiver1@example.com",
        "receiver2@example.com",
        "receiver3@example.com",
    ]


def test_tc_008_role_members_as_recipients_send_success(
    client, monkeypatch
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 2},
        raising=False,
    )

    template_id = create_email_template(client, code="tc008_role_members")
    task_template_id = create_task_template(
        client,
        name="TC008 角色收件人通知",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "ROLE_MEMBERS", "value": "T2"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc008_event_role",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-008 角色收件人")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    detail = get_task_detail(client, tasks[0]["id"])
    resolution_log = next(log for log in detail["logs"] if log["stage"] == "recipients_resolved")
    resolved_entries = resolution_log["response_summary"]["resolved_entries"]
    assert {item["email"] for item in resolved_entries} == {
        "admin@example.com",
        "analyst@example.com",
    }
    assert captures[0]["recipients"]["to"] == ["admin@example.com", "analyst@example.com"]


def test_tc_009_template_render_failure_marks_task_failed(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    send_count = {"value": 0}

    def should_not_send(**_kwargs):
        send_count["value"] += 1
        return {"provider": "stub-email", "accepted": 1}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        should_not_send,
        raising=False,
    )

    template_id = create_email_template(client, code="tc009_render_broken", broken=True)
    task_template_id = create_task_template(
        client,
        name="TC009 模板渲染失败",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "broken@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc009_event_broken",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-009 模板失败")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "FAILED"
    assert tasks[0]["error_message"] == "Template render failed"
    assert send_count["value"] == 0


def test_tc_010_smtp_failure_marks_task_failed(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    sender_config_id = create_mail_sender(client)
    template_id = create_email_template(client, code="tc010_smtp_failure")
    task_template_id = create_task_template(
        client,
        name="TC010 SMTP 失败",
        reference_template_id=template_id,
        sender_config_id=sender_config_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "smtpfail@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc010_event_smtp",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    class FailingSmtpClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self):
            return None

        def login(self, username, password):
            raise smtplib.SMTPAuthenticationError(535, b"Authentication failed")

    monkeypatch.setattr(
        "app.modules.tasks.service.smtplib.SMTP",
        FailingSmtpClient,
        raising=False,
    )

    ticket_id = create_ticket(client, title="TC-010 SMTP 失败")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "FAILED"
    detail = get_task_detail(client, tasks[0]["id"])
    failed_log = next(log for log in detail["logs"] if log["stage"] == "failed")
    assert failed_log["rendered_summary"]["body"]
    assert "Template render failed" not in tasks[0]["error_message"]


def test_tc_011_retry_failed_task_then_send_success(client, monkeypatch):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    template_id = create_email_template(client, code="tc011_retry")
    task_template_id = create_task_template(
        client,
        name="TC011 重试恢复",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "CUSTOM_EMAIL", "value": "retry@example.com"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc011_event_retry",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("temporary smtp failure")),
        raising=False,
    )
    ticket_id = create_ticket(client, title="TC-011 重试恢复")
    sweep_due_events()

    failed_tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(failed_tasks) == 1
    assert failed_tasks[0]["status"] == "FAILED"

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **_kwargs: {"provider": "stub-email", "accepted": 1},
        raising=False,
    )
    retry_response = client.post(
        f"/api/v1/tasks/{failed_tasks[0]['id']}/retry",
        headers=auth_headers(client),
    )
    assert retry_response.status_code == 200, retry_response.text
    retry_payload = retry_response.json()
    assert retry_payload["status"] == "SUCCESS"
    assert retry_payload["id"] != failed_tasks[0]["id"]
    assert retry_payload["retry_of_task_id"] == failed_tasks[0]["id"]

    original_detail = get_task_detail(client, failed_tasks[0]["id"])
    assert original_detail["status"] == "FAILED"


def test_tc_012_role_members_with_missing_email_are_logged_and_ignored(
    client, db_session_factory, monkeypatch
):
    create_active_user_with_role(
        db_session_factory,
        user_id="user-tc012-noemail",
        username="tc012.noemail",
        display_name="TC012 无邮箱成员",
        email=None,
        role_code="T2",
    )

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    captures: list[dict] = []
    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        lambda **kwargs: captures.append(kwargs) or {"provider": "stub-email", "accepted": 2},
        raising=False,
    )

    template_id = create_email_template(client, code="tc012_role_partial")
    task_template_id = create_task_template(
        client,
        name="TC012 角色缺邮箱成员",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "ROLE_MEMBERS", "value": "T2"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc012_event_role_partial",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-012 角色成员部分无邮箱")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "SUCCESS"
    detail = get_task_detail(client, tasks[0]["id"])
    resolution_log = next(log for log in detail["logs"] if log["stage"] == "recipients_resolved")
    ignored_entries = resolution_log["response_summary"]["ignored_entries"]
    assert any(item["reason"] == "missing_email" for item in ignored_entries)
    assert captures[0]["recipients"]["to"] == ["admin@example.com", "analyst@example.com"]


def test_tc_013_role_members_without_valid_email_fail_task(
    client, db_session_factory, monkeypatch
):
    create_active_user_with_role(
        db_session_factory,
        user_id="user-tc013-noemail",
        username="tc013.noemail",
        display_name="TC013 无有效邮箱成员",
        email=None,
        role_code="T3",
    )

    send_count = {"value": 0}

    def should_not_send(**_kwargs):
        send_count["value"] += 1
        return {"provider": "stub-email", "accepted": 1}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        should_not_send,
        raising=False,
    )

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    template_id = create_email_template(client, code="tc013_role_empty")
    task_template_id = create_task_template(
        client,
        name="TC013 角色无有效邮箱",
        reference_template_id=template_id,
        recipient_config={"to": [{"source_type": "ROLE_MEMBERS", "value": "T3"}], "cc": [], "bcc": []},
    )
    create_event_rule(
        client,
        code="tc013_event_role_empty",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-013 角色成员无有效邮箱")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "FAILED"
    assert tasks[0]["error_message"] == "Email recipients resolved to an empty set"
    detail = get_task_detail(client, tasks[0]["id"])
    resolution_log = next(log for log in detail["logs"] if log["stage"] == "recipients_resolved")
    assert any(item["reason"] == "missing_email" for item in resolution_log["response_summary"]["ignored_entries"])
    assert send_count["value"] == 0


def test_tc_014_invalid_email_in_multi_recipients_is_rejected_with_log(
    client, monkeypatch
):
    send_count = {"value": 0}

    def should_not_send(**_kwargs):
        send_count["value"] += 1
        return {"provider": "stub-email", "accepted": 2}

    monkeypatch.setattr(
        "app.modules.tasks.service.deliver_email",
        should_not_send,
        raising=False,
    )

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    template_id = create_email_template(client, code="tc014_invalid_multi")
    task_template_id = create_task_template(
        client,
        name="TC014 多收件人非法邮箱",
        reference_template_id=template_id,
        recipient_config={
            "to": [
                {"source_type": "CUSTOM_EMAIL", "value": "receiver1@example.com"},
                {"source_type": "CUSTOM_EMAIL", "value": "receiver2@example.com"},
                {"source_type": "CUSTOM_EMAIL", "value": "invalid_email_value"},
            ],
            "cc": [],
            "bcc": [],
        },
    )
    create_event_rule(
        client,
        code="tc014_event_invalid_multi",
        trigger_point="ticket.created",
        task_template_id=task_template_id,
    )

    ticket_id = create_ticket(client, title="TC-014 多收件人非法邮箱")
    sweep_due_events()

    tasks = list_ticket_tasks(client, ticket_id=ticket_id, task_template_id=task_template_id)
    assert len(tasks) == 1
    assert tasks[0]["status"] == "FAILED"
    assert tasks[0]["error_message"] == "Invalid email recipients configured"
    detail = get_task_detail(client, tasks[0]["id"])
    resolution_log = next(log for log in detail["logs"] if log["stage"] == "recipients_resolved")
    assert resolution_log["response_summary"]["invalid_entries"] == [
        {
            "source_type": "CUSTOM_EMAIL",
            "value": "invalid_email_value",
            "reason": "invalid_email",
        }
    ]
    assert send_count["value"] == 0
