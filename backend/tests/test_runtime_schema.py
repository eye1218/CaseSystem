from __future__ import annotations

from sqlalchemy import create_engine, inspect

from app import database as database_module


def test_runtime_schema_adds_missing_notification_action_columns(monkeypatch, tmp_path):
    db_path = tmp_path / "runtime-schema.sqlite3"
    engine = create_engine(
        f"sqlite+pysqlite:///{db_path}",
        future=True,
        connect_args={"check_same_thread": False},
    )

    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE tickets (
              id INTEGER PRIMARY KEY,
              title TEXT NOT NULL
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE user_notifications (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              category TEXT NOT NULL,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              related_resource_type TEXT,
              related_resource_id TEXT,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              delivered_at TEXT,
              read_at TEXT,
              expire_at TEXT
            )
            """
        )

    monkeypatch.setattr(database_module, "engine", engine)
    database_module._ensure_runtime_schema()

    inspector = inspect(engine)
    ticket_columns = {column["name"] for column in inspector.get_columns("tickets")}
    notification_columns = {
        column["name"] for column in inspector.get_columns("user_notifications")
    }

    assert "version" in ticket_columns
    assert {
        "action_required",
        "action_type",
        "action_status",
        "action_payload",
    }.issubset(notification_columns)
