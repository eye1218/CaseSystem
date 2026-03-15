from __future__ import annotations

from sqlalchemy import create_engine, inspect

from app import database as database_module
from app.database import Base


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


def test_legacy_audit_user_id_columns_allow_prefixed_identifiers():
    expected_lengths = {
        ("users", "created_by"): 64,
        ("users", "updated_by"): 64,
        ("user_roles", "assigned_by"): 64,
        ("report_templates", "created_by_user_id"): 64,
        ("report_templates", "updated_by_user_id"): 64,
        ("ticket_reports", "uploaded_by_user_id"): 64,
        ("tickets", "created_by_user_id"): 64,
        ("tickets", "customer_user_id"): 64,
        ("tickets", "assigned_to_user_id"): 64,
        ("tickets", "deleted_by"): 64,
        ("ticket_comments", "actor_user_id"): 64,
        ("ticket_actions", "actor_user_id"): 64,
        ("ticket_escalations", "source_assigned_to_user_id"): 64,
        ("ticket_escalations", "confirmed_by"): 64,
        ("ticket_escalations", "rejected_by"): 64,
        ("events", "created_by_user_id"): 64,
        ("event_rules", "created_by_user_id"): 64,
        ("event_rules", "updated_by_user_id"): 64,
        ("task_templates", "created_by_user_id"): 64,
        ("task_templates", "updated_by_user_id"): 64,
        ("task_instances", "operator_user_id"): 64,
        ("task_execution_logs", "actor_user_id"): 64,
        ("templates", "created_by_user_id"): 64,
        ("templates", "updated_by_user_id"): 64,
        ("mail_sender_configs", "created_by_user_id"): 64,
        ("mail_sender_configs", "updated_by_user_id"): 64,
        ("mail_sender_audit_logs", "actor_user_id"): 64,
        ("user_groups", "created_by_user_id"): 64,
        ("user_groups", "updated_by_user_id"): 64,
        ("user_admin_audit_logs", "actor_user_id"): 64,
        ("knowledge_articles", "created_by_user_id"): 64,
        ("knowledge_articles", "updated_by_user_id"): 64,
    }

    for (table_name, column_name), expected_length in expected_lengths.items():
        column = Base.metadata.tables[table_name].c[column_name]
        assert getattr(column.type, "length", None) == expected_length
