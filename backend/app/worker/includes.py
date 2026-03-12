from __future__ import annotations

CELERY_TASK_INCLUDES: tuple[str, ...] = (
    "app.modules.events.tasks",
    "app.modules.tasks.tasks",
)
