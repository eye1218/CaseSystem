from __future__ import annotations

# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUntypedFunctionDecorator=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from celery import group

from ...config import Settings
from ...security import utcnow
from ...worker.celery_app import celery_app
from ...worker.task_base import db_session
from ..tasks.service import create_task_instance_for_binding, execute_task_instance
from .service import (
    dispatch_timeout_reminder_signal,
    dispatch_timeout_signal,
    list_due_pending_event_ids,
    trigger_due_pending_event_with_bindings,
)


@celery_app.task(name="app.modules.events.tasks.dispatch_event_binding")
def dispatch_event_binding(
    *, event_id: str, binding_id: str, task_template_id: str, payload: dict[str, object]
) -> dict[str, object]:
    settings = Settings()
    with db_session() as db:
        created = create_task_instance_for_binding(
            db,
            event_id=event_id,
            binding_id=binding_id,
            task_template_id=task_template_id,
            payload=payload,
        )
    with db_session() as db:
        return execute_task_instance(
            db,
            settings,
            task_instance_id=str(created["task_instance_id"]),
        )


@celery_app.task(name="app.modules.events.tasks.sweep_due_events")
def sweep_due_events(batch_size: int = 100) -> dict[str, int]:
    due_at = utcnow()
    claimed_count = 0
    dispatched_count = 0
    skipped_count = 0

    with db_session() as db:
        event_ids = list_due_pending_event_ids(db, due_at=due_at, limit=batch_size)

    for event_id in event_ids:
        with db_session() as db:
            triggered_event = trigger_due_pending_event_with_bindings(
                db,
                event_id=event_id,
                due_at=due_at,
                triggered_at=due_at,
            )
            if triggered_event is None:
                skipped_count += 1
                continue

        event, bindings = triggered_event
        if event.payload.get("kind") == "ticket_timeout_signal":
            with db_session() as db:
                try:
                    immediate_dispatches = dispatch_timeout_signal(
                        db,
                        signal_event=event,
                        occurred_at=due_at,
                    )
                    signatures = [
                        celery_app.signature(
                            "app.modules.events.tasks.dispatch_event_binding",
                            kwargs={
                                "event_id": created_event.id,
                                "binding_id": binding.id,
                                "task_template_id": binding.task_template_id,
                                "payload": binding.payload,
                            },
                        )
                        for created_event, created_bindings in immediate_dispatches
                        for binding in created_bindings
                    ]
                    if signatures:
                        group(signatures).apply_async()
                        dispatched_count += len(signatures)
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
            claimed_count += 1
            continue

        if event.payload.get("kind") == "ticket_timeout_reminder_signal":
            with db_session() as db:
                try:
                    delivered_count = dispatch_timeout_reminder_signal(
                        db,
                        signal_event=event,
                        occurred_at=due_at,
                    )
                    dispatched_count += delivered_count
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
            claimed_count += 1
            continue

        dispatched_count += len(bindings)
        claimed_count += 1

    return {
        "claimed_count": claimed_count,
        "dispatched_count": dispatched_count,
        "skipped_count": skipped_count,
    }
