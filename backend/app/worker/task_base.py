from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Callable

from sqlalchemy.orm import Session

from ..database import SessionLocal

SessionFactory = Callable[[], Session]

_session_factory_override: SessionFactory | None = None


def set_worker_session_factory(session_factory: SessionFactory | None) -> None:
    global _session_factory_override
    _session_factory_override = session_factory


def reset_worker_session_factory() -> None:
    set_worker_session_factory(None)


@contextmanager
def db_session() -> Generator[Session, None, None]:
    session_factory = _session_factory_override or SessionLocal
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
