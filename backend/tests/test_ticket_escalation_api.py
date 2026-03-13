from __future__ import annotations

from datetime import timedelta

from app.models import User, UserRole
from app.modules.events.models import Event
from app.modules.realtime.models import UserNotification
from app.modules.tickets.models import Ticket, TicketAction
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


def create_internal_user(db_session_factory, *, user_id: str, username: str, role_codes: list[str]) -> None:
    with db_session_factory() as db:
        db.add(
            User(
                id=user_id,
                username=username,
                email=f"{username}@example.com",
                display_name=username.title(),
                password_hash=hash_password("Pass123456"),
                status="active",
            )
        )
        for index, role_code in enumerate(role_codes):
            db.add(
                UserRole(
                    user_id=user_id,
                    role_code=role_code,
                    is_primary=index == 0,
                )
            )
        db.commit()


def create_ticket_record(
    db_session_factory,
    *,
    ticket_id: int,
    pool_code: str | None,
    assigned_to_user_id: str | None,
    assigned_to: str | None,
    responsibility_level: str,
    main_status: str = "WAITING_RESPONSE",
    sub_status: str = "NONE",
) -> None:
    now = utcnow()
    with db_session_factory() as db:
        db.add(
            Ticket(
                id=ticket_id,
                title=f"Ticket {ticket_id}",
                description="Escalation workflow fixture",
                category_id="intrusion",
                category_name="入侵检测",
                source="INTERNAL",
                priority="P2",
                risk_score=66,
                main_status=main_status,
                sub_status=sub_status,
                created_by="Admin",
                created_by_user_id="user-admin",
                customer_user_id=None,
                assigned_to=assigned_to,
                assigned_to_user_id=assigned_to_user_id,
                current_pool_code=pool_code,
                responsibility_level=responsibility_level,
                response_deadline_at=now + timedelta(hours=2),
                resolution_deadline_at=now + timedelta(hours=8),
                responded_at=None,
                response_timeout_at=None,
                resolved_at=None,
                resolution_timeout_at=None,
                closed_at=None,
                created_at=now - timedelta(minutes=10),
                updated_at=now - timedelta(minutes=3),
            )
        )
        db.commit()


def create_active_render_template(client, *, code: str) -> str:
    response = client.post(
        "/api/v1/templates",
        json={
            "name": f"升级事件模板-{code}",
            "code": code,
            "template_type": "EMAIL",
            "fields": {
                "subject": "[{{ ticket.priority }}] {{ ticket.id }} 升级通知",
                "body": "工单 {{ ticket.id }} 已触发升级事件。",
            },
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    template_id = response.json()["template"]["id"]

    activate = client.post(
        f"/api/v1/templates/{template_id}/status",
        json={"status": "ACTIVE"},
        headers=auth_headers(client),
    )
    assert activate.status_code == 200, activate.text
    return template_id


def create_task_template(client, *, name: str, reference_template_id: str) -> str:
    response = client.post(
        "/api/v1/task-templates",
        json={
            "name": name,
            "task_type": "EMAIL",
            "reference_template_id": reference_template_id,
            "status": "ACTIVE",
            "recipient_config": {
                "to": [{"source_type": "CUSTOM_EMAIL", "value": "soc@example.com"}],
                "cc": [],
                "bcc": [],
            },
            "target_config": {},
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def create_event_rule(client, *, code: str, trigger_point: str, task_template_id: str) -> str:
    response = client.post(
        "/api/v1/events",
        json={
            "name": f"升级事件规则-{code}",
            "code": code,
            "event_type": "normal",
            "status": "enabled",
            "trigger_point": trigger_point,
            "filters": [],
            "time_rule": {"mode": "immediate"},
            "task_template_ids": [task_template_id],
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_create_ticket_defaults_to_t1_pool_when_pool_unspecified(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "默认池创建",
            "description": "未显式指定池子时应进入 T1_POOL。",
            "category_id": "network",
            "priority": "P3",
            "risk_score": 40,
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["current_pool_code"] == "T1_POOL"
    assert payload["ticket"]["assigned_to"] is None


def test_create_ticket_rejects_invalid_pool_value(client):
    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets",
        json={
            "title": "非法池值",
            "description": "传入非法池值时不应创建工单。",
            "category_id": "network",
            "priority": "P3",
            "risk_score": 40,
            "assignment_mode": "pool",
            "pool_code": "BAD_POOL",
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 422, response.text


def test_internal_target_users_endpoint_returns_internal_candidates_only(client):
    login(client, "admin", "AdminPass123")

    response = client.get("/api/v1/tickets/internal-target-users")

    assert response.status_code == 200, response.text
    payload = response.json()
    user_ids = {item["id"] for item in payload["items"]}
    assert "user-admin" in user_ids
    assert "user-analyst" in user_ids
    assert "user-customer" not in user_ids


def test_t1_user_can_claim_t1_pool_ticket(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200095,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T1")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200095/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["assigned_to_user_id"] == "user-analyst"
    assert payload["ticket"]["current_pool_code"] is None


def test_t2_user_can_claim_t1_and_t2_pool_tickets(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200096,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )
    create_ticket_record(
        db_session_factory,
        ticket_id=200097,
        pool_code="T2_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T2",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)

    claim_t1 = client.post(
        "/api/v1/tickets/200096/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert claim_t1.status_code == 200, claim_t1.text
    assert claim_t1.json()["ticket"]["assigned_to_user_id"] == "user-analyst"

    claim_t2 = client.post(
        "/api/v1/tickets/200097/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert claim_t2.status_code == 200, claim_t2.text
    assert claim_t2.json()["ticket"]["assigned_to_user_id"] == "user-analyst"


def test_t3_user_can_claim_t1_t2_t3_pool_tickets(client, db_session_factory):
    create_internal_user(
        db_session_factory,
        user_id="user-specialist-any",
        username="specialist_any",
        role_codes=["T3"],
    )
    for ticket_id, pool_code in ((200098, "T1_POOL"), (200099, "T2_POOL"), (200100, "T3_POOL")):
        create_ticket_record(
            db_session_factory,
            ticket_id=ticket_id,
            pool_code=pool_code,
            assigned_to_user_id=None,
            assigned_to=None,
            responsibility_level=pool_code.removesuffix("_POOL"),
        )

    login(client, "specialist_any", "Pass123456")
    csrf = issue_csrf(client)
    for ticket_id in (200098, 200099, 200100):
        response = client.post(
            f"/api/v1/tickets/{ticket_id}/actions/claim",
            json={"version": 1},
            headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["ticket"]["assigned_to_user_id"] == "user-specialist-any"


def test_pool_claim_permissions_follow_tier_rules(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200101,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )
    create_ticket_record(
        db_session_factory,
        ticket_id=200102,
        pool_code="T3_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T3",
    )
    create_internal_user(
        db_session_factory,
        user_id="user-specialist",
        username="specialist",
        role_codes=["T3"],
    )

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    claim_t1 = client.post(
        "/api/v1/tickets/200101/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert claim_t1.status_code == 200, claim_t1.text
    assert claim_t1.json()["ticket"]["assigned_to_user_id"] == "user-admin"

    claim_t3 = client.post(
        "/api/v1/tickets/200102/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert claim_t3.status_code == 403, claim_t3.text

    login(client, "specialist", "Pass123456")
    csrf = issue_csrf(client)
    claim_by_t3 = client.post(
        "/api/v1/tickets/200102/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert claim_by_t3.status_code == 200, claim_by_t3.text
    assert claim_by_t3.json()["ticket"]["assigned_to_user_id"] == "user-specialist"


def test_second_claim_attempt_is_rejected_after_first_claim_succeeds(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200103,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T1")
    csrf = issue_csrf(client)
    first = client.post(
        "/api/v1/tickets/200103/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert first.status_code == 200, first.text

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    second = client.post(
        "/api/v1/tickets/200103/actions/claim",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert second.status_code == 409, second.text


def test_admin_can_assign_ticket_to_specific_user(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200111,
        pool_code="T2_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T2",
    )

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200111/assign",
        json={"version": 1, "target_user_id": "user-analyst"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["assigned_to_user_id"] == "user-analyst"
    assert payload["ticket"]["current_pool_code"] is None


def test_admin_can_reassign_personally_owned_ticket(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200113,
        pool_code=None,
        assigned_to_user_id="user-analyst",
        assigned_to="Analyst",
        responsibility_level="T1",
        main_status="IN_PROGRESS",
    )

    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200113/assign",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["assigned_to_user_id"] == "user-admin"
    assert payload["ticket"]["current_pool_code"] is None


def test_non_admin_cannot_assign_ticket(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200112,
        pool_code="T2_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T2",
    )

    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200112/assign",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 403, response.text


def test_pool_escalation_moves_ticket_to_next_pool(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200121,
        pool_code=None,
        assigned_to_user_id="user-analyst",
        assigned_to="Analyst",
        responsibility_level="T1",
        main_status="IN_PROGRESS",
    )

    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200121/escalate-to-pool",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["current_pool_code"] == "T2_POOL"
    assert payload["ticket"]["assigned_to"] is None


def test_pool_ticket_can_escalate_directly_to_next_pool(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200120,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200120/escalate-to-pool",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["current_pool_code"] == "T2_POOL"
    assert payload["ticket"]["assigned_to_user_id"] is None


def test_t3_pool_cannot_escalate_to_pool(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200122,
        pool_code="T3_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T3",
    )
    create_internal_user(
        db_session_factory,
        user_id="user-specialist-2",
        username="specialist2",
        role_codes=["T3"],
    )

    login(client, "specialist2", "Pass123456")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200122/escalate-to-pool",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 422, response.text


def test_user_cannot_escalate_pool_without_required_tier(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200123,
        pool_code="T2_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T2",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T1")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200123/escalate-to-pool",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 403, response.text


def test_non_current_assignee_cannot_escalate_personal_ticket(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200124,
        pool_code=None,
        assigned_to_user_id="user-admin",
        assigned_to="Admin",
        responsibility_level="T2",
        main_status="IN_PROGRESS",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200124/escalate-to-pool",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 403, response.text


def test_directed_escalation_creates_pending_request_and_actionable_notification(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200131,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200131/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ticket"]["sub_status"] == "ESCALATION_PENDING_CONFIRM"
    assert payload["pending_escalation"]["status"] == "PENDING_CONFIRM"
    assert payload["pending_escalation"]["target_user_id"] == "user-admin"

    login(client, "admin", "AdminPass123")
    notifications = client.get("/api/v1/notifications")
    assert notifications.status_code == 200, notifications.text
    items = notifications.json()["items"]
    assert items[0]["category"] == "ticket_escalation_request"
    assert items[0]["action_required"] is True
    assert items[0]["action_status"] == "pending"
    assert items[0]["action_payload"]["escalation_id"] == payload["pending_escalation"]["id"]


def test_target_user_accepts_directed_escalation_and_non_target_is_rejected(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200141,
        pool_code=None,
        assigned_to_user_id="user-analyst",
        assigned_to="Analyst",
        responsibility_level="T1",
        main_status="IN_PROGRESS",
    )

    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)
    create_response = client.post(
        "/api/v1/tickets/200141/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 200, create_response.text
    escalation_id = create_response.json()["pending_escalation"]["id"]

    login(client, "customer", "CustomerPass123")
    csrf = issue_csrf(client)
    forbidden = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/accept",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert forbidden.status_code == 403, forbidden.text

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    accepted = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/accept",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert accepted.status_code == 200, accepted.text
    payload = accepted.json()
    assert payload["ticket"]["assigned_to_user_id"] == "user-admin"
    assert payload["ticket"]["sub_status"] == "ESCALATION_CONFIRMED"


def test_target_user_accepts_directed_escalation_from_pool(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200145,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)
    create_response = client.post(
        "/api/v1/tickets/200145/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 200, create_response.text
    escalation_id = create_response.json()["pending_escalation"]["id"]

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    accepted = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/accept",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert accepted.status_code == 200, accepted.text
    payload = accepted.json()
    assert payload["ticket"]["current_pool_code"] is None
    assert payload["ticket"]["assigned_to_user_id"] == "user-admin"
    assert payload["ticket"]["sub_status"] == "ESCALATION_CONFIRMED"


def test_target_user_rejects_directed_escalation_and_ticket_restores_original_owner(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200151,
        pool_code=None,
        assigned_to_user_id="user-analyst",
        assigned_to="Analyst",
        responsibility_level="T1",
        main_status="IN_PROGRESS",
    )

    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)
    create_response = client.post(
        "/api/v1/tickets/200151/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 200, create_response.text
    escalation_id = create_response.json()["pending_escalation"]["id"]

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    rejected = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/reject",
        json={"reason": "当前无需接手"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert rejected.status_code == 200, rejected.text
    payload = rejected.json()
    assert payload["ticket"]["assigned_to_user_id"] == "user-analyst"
    assert payload["ticket"]["current_pool_code"] is None
    assert payload["ticket"]["sub_status"] == "ESCALATION_REJECTED"


def test_target_user_rejects_directed_escalation_from_pool_and_ticket_restores_original_pool(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200155,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)
    create_response = client.post(
        "/api/v1/tickets/200155/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert create_response.status_code == 200, create_response.text
    escalation_id = create_response.json()["pending_escalation"]["id"]

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    rejected = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/reject",
        json={},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert rejected.status_code == 200, rejected.text
    payload = rejected.json()
    assert payload["ticket"]["current_pool_code"] == "T1_POOL"
    assert payload["ticket"]["assigned_to_user_id"] is None
    assert payload["ticket"]["sub_status"] == "ESCALATION_REJECTED"


def test_duplicate_pending_directed_escalation_is_rejected(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200161,
        pool_code=None,
        assigned_to_user_id="user-analyst",
        assigned_to="Analyst",
        responsibility_level="T1",
        main_status="IN_PROGRESS",
    )

    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)
    first = client.post(
        "/api/v1/tickets/200161/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert first.status_code == 200, first.text

    second = client.post(
        "/api/v1/tickets/200161/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert second.status_code == 409, second.text


def test_pending_directed_escalation_blocks_other_ownership_actions(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200162,
        pool_code=None,
        assigned_to_user_id="user-analyst",
        assigned_to="Analyst",
        responsibility_level="T1",
        main_status="IN_PROGRESS",
    )

    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)
    created = client.post(
        "/api/v1/tickets/200162/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert created.status_code == 200, created.text
    assert "escalate_pool" not in created.json()["available_actions"]
    assert "escalate_user" not in created.json()["available_actions"]

    blocked = client.post(
        "/api/v1/tickets/200162/escalate-to-pool",
        json={"version": 2},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert blocked.status_code == 409, blocked.text


def test_invalid_target_user_is_rejected_for_directed_escalation(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200171,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200171/escalate-to-user",
        json={"version": 1, "target_user_id": "user-customer"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 422, response.text


def test_repeated_processing_of_same_escalation_is_rejected(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200176,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)
    created = client.post(
        "/api/v1/tickets/200176/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert created.status_code == 200, created.text
    escalation_id = created.json()["pending_escalation"]["id"]

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)
    accepted = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/accept",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert accepted.status_code == 200, accepted.text

    repeated = client.post(
        f"/api/v1/ticket-escalations/{escalation_id}/reject",
        json={"reason": "重复处理"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert repeated.status_code == 409, repeated.text


def test_dirty_ownership_state_rejects_flow_operation(client, db_session_factory):
    create_ticket_record(
        db_session_factory,
        ticket_id=200181,
        pool_code="T2_POOL",
        assigned_to_user_id="user-admin",
        assigned_to="Admin",
        responsibility_level="T2",
    )

    login(client, "admin", "AdminPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/tickets/200181/escalate-to-pool",
        json={"version": 1},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 409, response.text


def test_successful_escalation_writes_audit_record_notification_and_event_trigger(
    client, db_session_factory
):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    render_template_id = create_active_render_template(
        client, code="ticket_escalation_requested_probe"
    )
    task_template_id = create_task_template(
        client,
        name="工单升级请求探针任务",
        reference_template_id=render_template_id,
    )
    create_event_rule(
        client,
        code="evt_ticket_escalation_requested_probe",
        trigger_point="ticket.escalation.requested",
        task_template_id=task_template_id,
    )

    create_ticket_record(
        db_session_factory,
        ticket_id=200191,
        pool_code="T1_POOL",
        assigned_to_user_id=None,
        assigned_to=None,
        responsibility_level="T1",
    )

    login(client, "analyst", "AnalystPass123")
    switch_role(client, "T2")
    csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/tickets/200191/escalate-to-user",
        json={"version": 1, "target_user_id": "user-admin"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text

    with db_session_factory() as db:
        audit = (
            db.query(TicketAction)
            .filter(
                TicketAction.ticket_id == 200191,
                TicketAction.action_type == "escalation_requested",
            )
            .one_or_none()
        )
        assert audit is not None

        notification = (
            db.query(UserNotification)
            .filter(
                UserNotification.user_id == "user-admin",
                UserNotification.category == "ticket_escalation_request",
                UserNotification.related_resource_type == "ticket_escalation",
            )
            .order_by(UserNotification.created_at.desc())
            .first()
        )
        assert notification is not None
        assert notification.action_required is True
        assert notification.action_status == "pending"

        event = (
            db.query(Event)
            .filter(
                Event.payload["trigger_point"].as_string() == "ticket.escalation.requested",
                Event.payload["ticket_id"].as_integer() == 200191,
            )
            .one_or_none()
        )
        assert event is not None
