from __future__ import annotations

from ...config import Settings
from ...worker.celery_app import celery_app
from ...worker.task_base import db_session
from .service import execute_task_instance as execute_task_instance_service


@celery_app.task(name="app.modules.tasks.tasks.execute_task_instance")
def execute_task_instance(*, task_instance_id: str) -> dict[str, object]:
    settings = Settings()
    with db_session() as db:
        return execute_task_instance_service(
            db,
            settings,
            task_instance_id=task_instance_id,
        )
