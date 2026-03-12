from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.bootstrap import seed_roles
from app.config import Settings, get_settings
from app.database import Base, get_db
from app.main import create_app
from app.models import User, UserRole
from app.modules.tickets.cache import reset_ticket_cache_backend
from app.reporting import seed_reporting
from app.security import hash_password
from app.worker.task_base import reset_worker_session_factory, set_worker_session_factory


@pytest.fixture
def test_settings(tmp_path_factory) -> Settings:
    storage_dir = tmp_path_factory.mktemp("report-storage")
    return Settings(
        database_url="sqlite+pysqlite:///:memory:",
        jwt_secret_key="test-secret-key-with-at-least-32-bytes",
        report_storage_dir=str(storage_dir),
        cookie_secure=True,
        allowed_origins=["https://testserver"],
        throttle_sleep_enabled=False,
    )


@pytest.fixture
def app(test_settings: Settings):
    engine = create_engine(
        test_settings.database_url,
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_settings() -> Settings:
        return test_settings

    def override_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = create_app(test_settings)
    app.dependency_overrides[get_settings] = override_settings
    app.dependency_overrides[get_db] = override_db
    app.state.session_factory = TestingSessionLocal
    set_worker_session_factory(TestingSessionLocal)

    with TestingSessionLocal() as db:
        seed_roles(db)
        seed_reporting(db, test_settings)
        db.add(
            User(
                id="user-disabled",
                username="disabled",
                email="disabled@example.com",
                display_name="Disabled",
                password_hash=hash_password("DisabledPass123"),
                status="disabled",
            )
        )
        db.add(UserRole(user_id="user-disabled", role_code="ADMIN", is_primary=True))
        db.commit()

    yield app
    reset_worker_session_factory()
    reset_ticket_cache_backend()


@pytest.fixture
def client(app):
    with TestClient(app, base_url="https://testserver") as client:
        yield client


@pytest.fixture
def db_session_factory(app):
    return app.state.session_factory


def issue_csrf(client: TestClient) -> str:
    response = client.get("/auth/csrf")
    assert response.status_code == 200
    return response.json()["csrf_token"]


def login(client: TestClient, username: str, password: str) -> dict:
    csrf = issue_csrf(client)
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    return response.json()
