from __future__ import annotations

# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false

from celery import Celery

from ..config import Settings
from .includes import CELERY_TASK_INCLUDES

settings = Settings()

celery_app = Celery(
    "casesystem",
    broker=getattr(settings, "celery_broker_url", "memory://"),
    backend=getattr(settings, "celery_result_backend", "cache+memory://"),
    include=list(CELERY_TASK_INCLUDES),
)

celery_app.conf.update(
    task_always_eager=getattr(settings, "celery_task_always_eager", True),
    task_eager_propagates=getattr(settings, "celery_task_eager_propagates", True),
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "events.sweep_due_events": {
        "task": "app.modules.events.tasks.sweep_due_events",
        "schedule": getattr(settings, "celery_event_sweep_interval_seconds", 30),
    }
}
