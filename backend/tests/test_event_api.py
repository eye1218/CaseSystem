from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.modules.events import service as event_service
from app.modules.events.enums import EventQueueStatus, EventQueueType
from app.modules.events.models import Event, EventBinding
from app.modules.events.service import claim_due_pending_event_with_bindings
from app.modules.events.tasks import sweep_due_events
from app.security import utcnow
from .conftest import issue_csrf, login


def switch_to_admin_role(client) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": "ADMIN"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["active_role"] == "ADMIN"


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
            "name": f"{code} 邮件模板",
            "code": code,
            "template_type": "EMAIL",
            "fields": {
                "subject": "[{{ ticket.priority }}] {{ ticket.id }} 通知",
                "body": "工单标题：{{ ticket.title }}",
            },
        }
    else:
        payload = {
            "name": f"{code} 回调模板",
            "code": code,
            "template_type": "WEBHOOK",
            "fields": {
                "url": "https://hooks.partner.local/tickets/{{ ticket.id }}",
                "method": "POST",
                "headers": [{"key": "Content-Type", "value": "application/json"}],
                "body": "{\"ticket_id\": \"{{ ticket.id }}\"}",
            },
        }

    create_response = client.post(
        "/api/v1/templates",
        json=payload,
        headers=auth_headers(client),
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()["template"]

    activate_response = client.post(
        f"/api/v1/templates/{created['id']}/status",
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
    code: str,
) -> dict:
    render_template = create_active_render_template(
        client,
        template_type=task_type,
        code=code,
    )
    response = client.post(
        "/api/v1/task-templates",
        json={
            "name": name,
            "task_type": task_type,
            "reference_template_id": render_template["id"],
            "status": "ACTIVE",
            "recipient_config": {
                "to": [{"source_type": "CUSTOM_EMAIL", "value": "soc@example.com"}],
                "cc": [],
                "bcc": [],
            }
            if task_type == "EMAIL"
            else {"to": [], "cc": [], "bcc": []},
            "target_config": {},
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_event_rule(client, payload: dict[str, object]) -> dict:
    csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/events",
        json=payload,
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def post_ticket_action(client, ticket_id: int, action: str, note: str) -> None:
    detail = client.get(f"/api/v1/tickets/{ticket_id}/detail")
    assert detail.status_code == 200, detail.text
    version = detail.json()["ticket"]["version"]
    csrf = issue_csrf(client)
    response = client.post(
        f"/api/v1/tickets/{ticket_id}/actions/{action}",
        json={"note": note, "version": version},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def test_admin_can_create_update_list_and_delete_event_rule(client):
    login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)

    template_alpha = create_task_template(
        client,
        name="高优先级通知任务",
        task_type="EMAIL",
        code="evt_rule_alpha_email",
    )
    template_beta = create_task_template(
        client,
        name="计时巡检任务",
        task_type="WEBHOOK",
        code="evt_rule_beta_webhook",
    )
    template_gamma = create_task_template(
        client,
        name="超时升级任务",
        task_type="EMAIL",
        code="evt_rule_gamma_email",
    )

    task_templates = client.get("/api/v1/events/task-templates")
    assert task_templates.status_code == 200, task_templates.text
    bindable_ids = {item["id"] for item in task_templates.json()["items"]}
    assert not any(item_id.startswith("tpl-") for item_id in bindable_ids)
    assert {
        template_alpha["id"],
        template_beta["id"],
        template_gamma["id"],
    }.issubset(bindable_ids)

    created = create_event_rule(
        client,
        {
            "name": "P1 工单创建立即通知",
            "code": "evt_p1_ticket_created_notify",
            "event_type": "normal",
            "status": "draft",
            "trigger_point": "ticket.created",
            "description": "当高优先级工单创建时立即通知",
            "tags": ["P1", "notify"],
            "filters": [
                {"field": "priority", "operator": "in", "values": ["P1"]},
                {"field": "category", "operator": "in", "values": ["network", "intrusion"]},
            ],
            "time_rule": {"mode": "immediate"},
            "task_template_ids": [template_alpha["id"], template_beta["id"]],
        },
    )

    assert created["name"] == "P1 工单创建立即通知"
    assert created["status"] == "draft"
    assert created["trigger_point"] == "ticket.created"
    assert len(created["bound_tasks"]) == 2
    assert created["filter_summary"]
    assert created["trigger_summary"]

    event_id = created["id"]

    listing = client.get(
        "/api/v1/events",
        params={
            "search": "P1 工单创建",
            "event_type": "normal",
            "status": "draft",
            "trigger_point": "ticket.created",
        },
    )
    assert listing.status_code == 200, listing.text
    payload = listing.json()
    assert payload["total_count"] >= 1
    item = next(item for item in payload["items"] if item["id"] == event_id)
    assert item["task_template_count"] == 2
    assert item["status"] == "draft"

    update_csrf = issue_csrf(client)
    updated = client.patch(
        f"/api/v1/events/{event_id}",
        json={
            "name": "P1 工单创建延迟通知",
            "description": "满足条件后延迟 5 分钟通知",
            "time_rule": {"mode": "delayed", "delay_amount": 5, "delay_unit": "minutes"},
            "task_template_ids": [template_alpha["id"]],
        },
        headers={"X-CSRF-Token": update_csrf, "Origin": "https://testserver"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "P1 工单创建延迟通知"
    assert updated.json()["time_rule"]["mode"] == "delayed"
    assert len(updated.json()["bound_tasks"]) == 1

    status_csrf = issue_csrf(client)
    enabled = client.post(
        f"/api/v1/events/{event_id}/status",
        json={"status": "enabled"},
        headers={"X-CSRF-Token": status_csrf, "Origin": "https://testserver"},
    )
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["status"] == "enabled"

    detail = client.get(f"/api/v1/events/{event_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "enabled"
    assert detail.json()["updated_by"] == "Admin"

    delete_csrf = issue_csrf(client)
    deleted = client.delete(
        f"/api/v1/events/{event_id}",
        headers={"X-CSRF-Token": delete_csrf, "Origin": "https://testserver"},
    )
    assert deleted.status_code == 204, deleted.text

    missing = client.get(f"/api/v1/events/{event_id}")
    assert missing.status_code == 404


def test_event_rule_validation_rejects_relative_time_and_empty_task_templates(client):
    login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)

    csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/events",
        json={
            "name": "非法 Event",
            "event_type": "normal",
            "status": "enabled",
            "trigger_point": "ticket.updated",
            "filters": [
                {
                    "field": "created_at",
                    "operator": "within_last",
                    "relative_time": {"amount": 30, "unit": "minutes"},
                }
            ],
            "time_rule": {"mode": "immediate"},
            "task_template_ids": [],
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["message"] == "Validation failed"
    assert "task_template_ids" in detail["field_errors"]
    assert "filters[0].operator" in detail["field_errors"]


def test_ticket_create_matches_enabled_rules_and_enqueues_dispatch_jobs(client, db_session_factory):
    login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)

    delayed_task = create_task_template(
        client,
        name="创建延迟通知任务",
        task_type="EMAIL",
        code="evt_delayed_email",
    )
    timer_task = create_task_template(
        client,
        name="创建计时巡检任务",
        task_type="WEBHOOK",
        code="evt_timer_webhook",
    )

    create_event_rule(
        client,
        {
            "name": "工单创建后延迟 5 分钟通知",
            "code": "evt_ticket_created_delay_5m",
            "event_type": "normal",
            "status": "enabled",
            "trigger_point": "ticket.created",
            "filters": [{"field": "priority", "operator": "in", "values": ["P1"]}],
            "time_rule": {"mode": "delayed", "delay_amount": 5, "delay_unit": "minutes"},
            "task_template_ids": [delayed_task["id"]],
        },
    )
    create_event_rule(
        client,
        {
            "name": "工单创建后 30 分钟，提前 5 分钟触发",
            "code": "evt_ticket_created_timer_before_5m",
            "event_type": "timer",
            "status": "enabled",
            "trigger_point": "ticket.created",
            "filters": [{"field": "category", "operator": "in", "values": ["network"]}],
            "time_rule": {
                "target_offset_amount": 30,
                "target_offset_unit": "minutes",
                "adjustment_direction": "before",
                "adjustment_amount": 5,
                "adjustment_unit": "minutes",
            },
            "task_template_ids": [timer_task["id"]],
        },
    )

    ticket_csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "Event 命中测试工单",
            "description": "验证 Event 规则创建调度任务",
            "category_id": "network",
            "priority": "P1",
            "risk_score": 92,
            "assignment_mode": "self",
        },
        headers={"X-CSRF-Token": ticket_csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    ticket_id = response.json()["ticket"]["id"]

    with db_session_factory() as db:
        queued_events = [
            event
            for event in db.scalars(select(Event).order_by(Event.trigger_time.asc())).all()
            if event.payload.get("kind") == "event_rule_dispatch"
            and event.payload.get("ticket_id") == ticket_id
        ]
        assert len(queued_events) == 2
        delayed, timer = queued_events
        assert delayed.payload["trigger_point"] == "ticket.created"
        assert timer.payload["trigger_point"] == "ticket.created"
        assert delayed.trigger_time != timer.trigger_time

        delayed_bindings = list(
            db.scalars(select(EventBinding).where(EventBinding.event_id == delayed.id)).all()
        )
        timer_bindings = list(
            db.scalars(select(EventBinding).where(EventBinding.event_id == timer.id)).all()
        )
        assert [binding.task_template_id for binding in delayed_bindings] == [delayed_task["id"]]
        assert [binding.task_template_id for binding in timer_bindings] == [timer_task["id"]]


def test_due_event_can_only_be_claimed_once(db_session_factory):
    now = utcnow()
    trigger_time = now - timedelta(minutes=1)

    with db_session_factory() as db:
        event = Event(
            event_type=EventQueueType.TIMED.value,
            status=EventQueueStatus.PENDING.value,
            trigger_time=trigger_time,
            title="claim once",
            description=None,
            payload={"kind": "event_rule_dispatch", "ticket_id": 1},
            created_by_user_id=None,
            created_at=now,
            updated_at=now,
        )
        db.add(event)
        db.flush()
        db.add(
            EventBinding(
                event_id=event.id,
                task_template_id="template-1",
                payload={"ticket_id": 1},
            )
        )
        db.commit()
        event_id = event.id

    with db_session_factory() as first_db:
        first_claim = claim_due_pending_event_with_bindings(
            first_db,
            event_id=event_id,
            due_at=now,
            triggered_at=now,
        )

    with db_session_factory() as second_db:
        second_claim = claim_due_pending_event_with_bindings(
            second_db,
            event_id=event_id,
            due_at=now,
            triggered_at=now,
        )

    assert first_claim is not None
    claimed_event, claimed_bindings = first_claim
    assert claimed_event.status == EventQueueStatus.TRIGGERED.value
    assert [binding.task_template_id for binding in claimed_bindings] == ["template-1"]
    assert second_claim is None


def test_sweep_due_events_keeps_event_pending_when_enqueue_fails(
    db_session_factory, monkeypatch
):
    now = utcnow()
    trigger_time = now - timedelta(minutes=1)

    with db_session_factory() as db:
        event = Event(
            event_type=EventQueueType.TIMED.value,
            status=EventQueueStatus.PENDING.value,
            trigger_time=trigger_time,
            title="broker failure",
            description=None,
            payload={"kind": "event_rule_dispatch", "ticket_id": 1},
            created_by_user_id=None,
            created_at=now,
            updated_at=now,
        )
        db.add(event)
        db.flush()
        db.add(
            EventBinding(
                event_id=event.id,
                task_template_id="template-1",
                payload={"ticket_id": 1},
            )
        )
        db.commit()
        event_id = event.id

    class FailingGroup:
        def __init__(self, signatures):
            self.signatures = signatures

        def apply_async(self) -> None:
            raise RuntimeError("broker unavailable")

    monkeypatch.setattr(
        event_service,
        "_build_event_binding_signatures",
        lambda event, bindings: ["signature"],
    )
    monkeypatch.setattr(event_service, "group", lambda signatures: FailingGroup(signatures))

    with pytest.raises(RuntimeError, match="broker unavailable"):
        sweep_due_events()

    with db_session_factory() as db:
        event = db.scalar(select(Event).where(Event.id == event_id))
        assert event is not None
        assert event.status == EventQueueStatus.PENDING.value
        assert event.triggered_at is None


def test_response_timeout_rules_dispatch_on_due_signal(client, db_session_factory):
    login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)

    timeout_task = create_task_template(
        client,
        name="响应超时通知任务",
        task_type="EMAIL",
        code="evt_timeout_email",
    )

    create_event_rule(
        client,
        {
            "name": "响应超时后通知管理员",
            "code": "evt_response_timeout_notify",
            "event_type": "normal",
            "status": "enabled",
            "trigger_point": "ticket.response.timeout",
            "filters": [{"field": "priority", "operator": "in", "values": ["P1"]}],
            "time_rule": {"mode": "immediate"},
            "task_template_ids": [timeout_task["id"]],
        },
    )

    ticket_csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "响应超时 Event 测试",
            "description": "验证到期信号命中规则",
            "category_id": "intrusion",
            "priority": "P1",
            "risk_score": 95,
            "assignment_mode": "self",
        },
        headers={"X-CSRF-Token": ticket_csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    ticket_id = response.json()["ticket"]["id"]

    with db_session_factory() as db:
        timeout_signal = next(
            event
            for event in db.scalars(select(Event).order_by(Event.created_at.asc())).all()
            if event.payload.get("kind") == "ticket_timeout_signal"
            and event.payload.get("ticket_id") == ticket_id
            and event.payload.get("trigger_point") == "ticket.response.timeout"
        )
        timeout_signal.trigger_time = utcnow() - timedelta(seconds=1)
        db.commit()

    result = sweep_due_events()

    assert result["claimed_count"] >= 1
    assert result["dispatched_count"] >= 1


def test_reopen_recreates_pending_timeout_events(client, db_session_factory):
    login(client, "admin", "AdminPass123")

    ticket_csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "reopen timeout recreation",
            "description": "verify timeout events are recreated when a ticket is reopened",
            "category_id": "network",
            "priority": "P3",
            "risk_score": 50,
            "assignment_mode": "self",
        },
        headers={"X-CSRF-Token": ticket_csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    ticket_id = response.json()["ticket"]["id"]

    post_ticket_action(client, ticket_id, "respond", "responded")
    post_ticket_action(client, ticket_id, "resolve", "resolved")
    post_ticket_action(client, ticket_id, "close", "closed")
    post_ticket_action(client, ticket_id, "reopen", "reopened")

    timeout_points = {"ticket.response.timeout", "ticket.resolution.timeout"}
    with db_session_factory() as db:
        events = [
            event
            for event in db.scalars(select(Event).order_by(Event.created_at.asc())).all()
            if event.payload.get("kind") == "ticket_timeout_signal"
            and event.payload.get("ticket_id") == ticket_id
            and event.payload.get("trigger_point") in timeout_points
        ]

    assert len([event for event in events if event.status == EventQueueStatus.PENDING.value]) == 2
    assert (
        len([event for event in events if event.status == EventQueueStatus.CANCELLED.value]) == 2
    )
