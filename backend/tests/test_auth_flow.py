from __future__ import annotations

from sqlalchemy import select

from app.enums import CounterType, RefreshTokenStatus, SessionStatus
from app.models import AuthLoginCounter, AuthSession, RefreshToken, User
from .conftest import issue_csrf, login


def test_login_refresh_rotation_and_reuse_detection(client, db_session_factory):
    login_response = login(client, "admin", "AdminPass123")
    assert login_response["user"]["active_role"] == "T2"
    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    old_refresh = client.cookies.get("__Secure-refresh_token")
    csrf = client.cookies.get("XSRF-TOKEN")

    refresh_response = client.post(
        "/auth/refresh",
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert refresh_response.status_code == 200
    new_refresh = client.cookies.get("__Secure-refresh_token")
    assert new_refresh != old_refresh

    client.cookies.set("__Secure-refresh_token", old_refresh, domain="testserver.local", path="/auth/refresh")
    reused_response = client.post(
        "/auth/refresh",
        headers={"X-CSRF-Token": client.cookies.get("XSRF-TOKEN"), "Origin": "https://testserver"},
    )
    assert reused_response.status_code == 401

    me_after_reuse = client.get("/auth/me")
    assert me_after_reuse.status_code == 401

    with db_session_factory() as db:
        compromised_session = db.scalar(select(AuthSession).where(AuthSession.id == login_response["session_id"]))
        assert compromised_session.status == SessionStatus.COMPROMISED.value
        reused_tokens = db.scalars(select(RefreshToken).where(RefreshToken.session_id == compromised_session.id)).all()
        assert all(token.status == RefreshTokenStatus.REUSED_DETECTED.value for token in reused_tokens)


def test_change_password_revokes_all_sessions(client):
    login(client, "analyst", "AnalystPass123")
    csrf = client.cookies.get("XSRF-TOKEN")
    change_password = client.post(
        "/auth/change-password",
        json={"current_password": "AnalystPass123", "new_password": "AnalystPass456"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert change_password.status_code == 200
    assert client.get("/auth/me").status_code == 401

    relogin_csrf = issue_csrf(client)
    old_password = client.post(
        "/auth/login",
        json={"username": "analyst", "password": "AnalystPass123"},
        headers={"X-CSRF-Token": relogin_csrf, "Origin": "https://testserver"},
    )
    assert old_password.status_code == 401

    new_csrf = issue_csrf(client)
    new_password = client.post(
        "/auth/login",
        json={"username": "analyst", "password": "AnalystPass456"},
        headers={"X-CSRF-Token": new_csrf, "Origin": "https://testserver"},
    )
    assert new_password.status_code == 200


def test_login_failures_increment_counters_and_lock_account(client, db_session_factory):
    for ip_address in ["10.0.0.1"] * 5 + ["10.0.0.2"] * 5:
        csrf = issue_csrf(client)
        response = client.post(
            "/auth/login",
            json={"username": "admin", "password": "WrongPass123"},
            headers={"X-CSRF-Token": csrf, "Origin": "https://testserver", "X-Forwarded-For": ip_address},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "用户名或密码错误，或当前登录暂不可用"

    with db_session_factory() as db:
        account_counter = db.scalar(
            select(AuthLoginCounter).where(
                AuthLoginCounter.counter_type == CounterType.ACCOUNT.value,
                AuthLoginCounter.counter_key == "account:admin",
            )
        )
        account_ip_counter = db.scalar(
            select(AuthLoginCounter).where(
                AuthLoginCounter.counter_type == CounterType.ACCOUNT_IP.value,
                AuthLoginCounter.counter_key == "account_ip:admin:10.0.0.2",
            )
        )
        user = db.scalar(select(User).where(User.username == "admin"))
        assert account_counter.fail_count == 10
        assert account_ip_counter.fail_count == 5
        assert user.lock_until is not None


def test_disabled_user_cannot_login(client):
    csrf = issue_csrf(client)
    response = client.post(
        "/auth/login",
        json={"username": "disabled", "password": "DisabledPass123"},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误，或当前登录暂不可用"
