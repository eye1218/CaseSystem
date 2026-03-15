from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import Engine

from app import models  # noqa: F401
from app.bootstrap import seed_roles
from app.config import Settings
from app.database import Base, SessionLocal, engine, init_db
from app.reporting import seed_reporting


def _target_has_rows(target_engine: Engine) -> bool:
    inspector = inspect(target_engine)
    if "users" not in inspector.get_table_names():
        return False
    with target_engine.connect() as connection:
        return connection.execute(text("SELECT 1 FROM users LIMIT 1")).scalar() is not None


def _reset_postgres_sequences(target_engine: Engine, tables) -> None:
    if target_engine.dialect.name != "postgresql":
        return

    with target_engine.begin() as connection:
        for table in tables:
            primary_key_columns = list(table.primary_key.columns)
            if len(primary_key_columns) != 1:
                continue
            column = primary_key_columns[0]
            try:
                if column.type.python_type is not int:
                    continue
            except NotImplementedError:
                continue

            sequence_name = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": column.name},
            ).scalar()
            if not sequence_name:
                continue

            max_value = connection.execute(
                select(func.max(column)).select_from(table)
            ).scalar()
            if max_value is None:
                connection.execute(text(f"SELECT setval('{sequence_name}', 1, false)"))
            else:
                connection.execute(
                    text(f"SELECT setval('{sequence_name}', :value, true)"),
                    {"value": int(max_value)},
                )


def _migrate_sqlite_to_target(source_path: Path, target_engine: Engine) -> bool:
    if not source_path.is_file():
        print(f"Bootstrap: sqlite source not found, skip migration: {source_path}")
        return False
    if _target_has_rows(target_engine):
        print("Bootstrap: target database already contains data, skip sqlite migration")
        return False

    source_engine = create_engine(
        f"sqlite+pysqlite:///{source_path}",
        future=True,
        connect_args={"check_same_thread": False},
    )
    source_table_names = set(inspect(source_engine).get_table_names())
    tables = [table for table in Base.metadata.sorted_tables if table.name in source_table_names]

    with source_engine.connect() as source_connection, target_engine.begin() as target_connection:
        for table in reversed(tables):
            target_connection.execute(table.delete())
        for table in tables:
            rows = [dict(row) for row in source_connection.execute(select(table)).mappings()]
            if rows:
                target_connection.execute(table.insert(), rows)

    _reset_postgres_sequences(target_engine, tables)
    print(f"Bootstrap: migrated sqlite data from {source_path}")
    return True


def main() -> None:
    settings = Settings()
    init_db()

    sqlite_source_path = Path(
        os.environ.get("CASESYSTEM_SQLITE_SOURCE_PATH", "/workspace/casesystem.db")
    )
    _migrate_sqlite_to_target(sqlite_source_path, engine)

    with SessionLocal() as db:
        seed_roles(db)
        seed_reporting(db, settings)

    print("Bootstrap: runtime schema and seed data are ready")


if __name__ == "__main__":
    main()
