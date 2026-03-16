from collections.abc import Generator
import logging

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
logger = logging.getLogger(__name__)
engine = create_engine(
    settings.database_url,
    future=True,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)


def _ensure_runtime_schema() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "tickets" in table_names:
        ticket_columns = {column["name"] for column in inspector.get_columns("tickets")}
        if "version" not in ticket_columns:
            logger.info(
                "Adding missing tickets.version column for runtime schema compatibility"
            )
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1"
                )

    if "user_notifications" in table_names:
        notification_columns = {
            column["name"] for column in inspector.get_columns("user_notifications")
        }
        statements: list[str] = []
        if "action_required" not in notification_columns:
            statements.append(
                "ALTER TABLE user_notifications ADD COLUMN action_required BOOLEAN NOT NULL DEFAULT 0"
            )
        if "action_type" not in notification_columns:
            statements.append(
                "ALTER TABLE user_notifications ADD COLUMN action_type VARCHAR(64)"
            )
        if "action_status" not in notification_columns:
            statements.append(
                "ALTER TABLE user_notifications ADD COLUMN action_status VARCHAR(16)"
            )
        if "action_payload" not in notification_columns:
            statements.append(
                "ALTER TABLE user_notifications ADD COLUMN action_payload JSON NOT NULL DEFAULT '{}'"
            )
        if statements:
            logger.info(
                "Adding missing user_notifications action columns for runtime schema compatibility"
            )
            with engine.begin() as connection:
                for statement in statements:
                    connection.exec_driver_sql(statement)


def init_db() -> None:
    from app import models  # noqa: F401
    from app.modules.alert_sources import models as alert_source_models  # noqa: F401
    from app.modules.events import models as event_models  # noqa: F401
    from app.modules.knowledge import models as knowledge_models  # noqa: F401
    from app.modules.mail_senders import models as mail_sender_models  # noqa: F401
    from app.modules.realtime import models as realtime_models  # noqa: F401
    from app.modules.tasks import models as task_models  # noqa: F401
    from app.modules.templates import models as template_models  # noqa: F401
    from app.modules.tickets import models as ticket_models  # noqa: F401
    from app.modules.user_management import models as user_management_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_schema()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
