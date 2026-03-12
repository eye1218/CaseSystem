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
    if "tickets" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("tickets")}
    if "version" in columns:
        return

    logger.info("Adding missing tickets.version column for runtime schema compatibility")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1"
        )


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_schema()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
