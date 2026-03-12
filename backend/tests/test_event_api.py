from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.auth import ActorContext
from app.enums import RoleCode
from app.modules.events import service as event_service
from app.modules.events.enums import EventStatus, EventType
from app.modules.events.models import Event, EventBinding
from app.modules.events.service import (
    claim_due_pending_event_with_bindings,
    early_trigger_event,
)
from app.modules.events.tasks import sweep_due_events
from app.security import utcnow
from .conftest import login


def switch_to_admin_role(client) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": "ADMIN"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["active_role"] == "ADMIN"


def post_ticket_action(client, ticket_id: int, action: str, note: str) -> None:
    detail = client.get(f"/api/v1/tickets/{ticket_id}/detail")
    assert detail.status_code == 200, detail.text
    version = detail.json()["ticket"]["version"]
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        f"/api/v1/tickets/{ticket_id}/actions/{action}",
        json={"note": note, "version": version},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def test_admin_instant_event_ignores_client_trigger_time(client):
    login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)

    before = utcnow()
    future_trigger_time = (before + timedelta(days=1)).isoformat()
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/api/v1/events",
        json={
            "event_type": "instant",
            "trigger_time": future_trigger_time,
            "title": "future instant",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    after = utcnow()

    assert response.status_code == 200, response.text
    payload = response.json()
    trigger_time = datetime.fromisoformat(payload["event"]["trigger_time"])
    assert before <= trigger_time <= after


def test_sweep_due_events_uses_configured_session_factory(client, db_session_factory):
    login(client, "admin", "AdminPass123")
    switch_to_admin_role(client)

    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/api/v1/events",
        json={
            "event_type": "timed",
            "trigger_time": (utcnow() - timedelta(seconds=1)).isoformat(),
            "title": "due event",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    event_id = response.json()["event"]["id"]

    result = sweep_due_events()

    assert result == {"claimed_count": 1, "dispatched_count": 0, "skipped_count": 0}
    with db_session_factory() as db:
        event = db.scalar(select(Event).where(Event.id == event_id))
        assert event is not None
        assert event.status == EventStatus.TRIGGERED.value


def test_due_event_can_only_be_claimed_once(db_session_factory):
    now = utcnow()
    trigger_time = now - timedelta(minutes=1)

    with db_session_factory() as db:
        event = Event(
            event_type=EventType.TIMED.value,
            status=EventStatus.PENDING.value,
            trigger_time=trigger_time,
            title="claim once",
            description=None,
            payload={},
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
            first_db, event_id=event_id, due_at=now, triggered_at=now
        )

    with db_session_factory() as second_db:
        second_claim = claim_due_pending_event_with_bindings(
            second_db, event_id=event_id, due_at=now, triggered_at=now
        )

    assert first_claim is not None
    claimed_event, claimed_bindings = first_claim
    assert claimed_event.status == EventStatus.TRIGGERED.value
    assert [binding.task_template_id for binding in claimed_bindings] == ["template-1"]
    assert second_claim is None


def test_sweep_due_events_keeps_event_pending_when_enqueue_fails(
    db_session_factory, monkeypatch
):
    now = utcnow()
    trigger_time = now - timedelta(minutes=1)

    with db_session_factory() as db:
        event = Event(
            event_type=EventType.TIMED.value,
            status=EventStatus.PENDING.value,
            trigger_time=trigger_time,
            title="broker failure",
            description=None,
            payload={},
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
        assert event.status == EventStatus.PENDING.value
        assert event.triggered_at is None


def test_early_trigger_event_executes_immediately(db_session_factory):
    now = utcnow()

    with db_session_factory() as db:
        event = Event(
            event_type=EventType.TIMED.value,
            status=EventStatus.PENDING.value,
            trigger_time=now + timedelta(hours=1),
            title="manual trigger",
            description=None,
            payload={},
            created_by_user_id="admin-user",
            created_at=now,
            updated_at=now,
        )
        db.add(event)
        db.commit()
        event_id = event.id

    actor = ActorContext(
        user_id="admin-user",
        username="admin",
        display_name="Admin",
        session_id="session-1",
        active_role=RoleCode.ADMIN.value,
        roles=[RoleCode.ADMIN.value],
        token_version=1,
        role_version=1,
    )

    with db_session_factory() as db:
        detail = early_trigger_event(db, actor, event_id)

    triggered_event = detail["event"]
    assert triggered_event.status == EventStatus.TRIGGERED.value
    assert triggered_event.triggered_at is not None

    with db_session_factory() as db:
        event = db.scalar(select(Event).where(Event.id == event_id))
        assert event is not None
        assert event.status == EventStatus.TRIGGERED.value
        assert event.triggered_at is not None


def test_reopen_recreates_pending_timeout_events(client, db_session_factory):
    login(client, "admin", "AdminPass123")

    csrf = client.cookies.get("XSRF-TOKEN")
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
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    ticket_id = response.json()["ticket"]["id"]

    post_ticket_action(client, ticket_id, "respond", "responded")
    post_ticket_action(client, ticket_id, "resolve", "resolved")
    post_ticket_action(client, ticket_id, "close", "closed")
    post_ticket_action(client, ticket_id, "reopen", "reopened")

    timeout_names = {"ticket.response.timeout", "ticket.resolution.timeout"}
    with db_session_factory() as db:
        events = [
            event
            for event in db.scalars(select(Event).order_by(Event.created_at)).all()
            if event.payload.get("related_object") == f"ticket:{ticket_id}"
            and event.payload.get("name") in timeout_names
        ]

    assert len([event for event in events if event.status == EventStatus.PENDING.value]) == 2
    assert len([event for event in events if event.status == EventStatus.CANCELLED.value]) == 2
