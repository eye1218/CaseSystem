from __future__ import annotations

import ast
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional
from textwrap import dedent

import pytest


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT_DIR / "scripts" / "render_docker_env.py"


TEMPLATE_CONTENT = dedent(
    """
    HTTPS_PORT=443

    POSTGRES_DB=casesystem
    POSTGRES_USER=casesystem
    POSTGRES_PASSWORD=change-me-db-password

    CASESYSTEM_ENVIRONMENT=docker
    CASESYSTEM_COOKIE_SECURE=true
    CASESYSTEM_ALLOWED_ORIGINS=["https://localhost","https://127.0.0.1"]
    CASESYSTEM_JWT_SECRET_KEY=change-me-in-production-at-least-32-bytes
    CASESYSTEM_REPORT_STORAGE_DIR=/app/.runtime/report-storage
    CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS=30
    CASESYSTEM_TICKET_CACHE_TTL_SECONDS=60
    CASESYSTEM_SQLITE_SOURCE_PATH=/workspace/casesystem.db

    CASESYSTEM_SMTP_HOST=smtp.insightsec.cn
    CASESYSTEM_SMTP_PORT=587
    CASESYSTEM_SMTP_USERNAME=damon.li@insightsec.cn
    CASESYSTEM_SMTP_PASSWORD=change-me-smtp-password
    CASESYSTEM_SMTP_FROM_EMAIL=damon.li@insightsec.cn
    CASESYSTEM_SMTP_USE_SSL=false
    CASESYSTEM_SMTP_STARTTLS=true
    """
).strip()


def clean_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("CASESYSTEM_") or key.startswith("POSTGRES_") or key == "HTTPS_PORT":
            env.pop(key, None)
    return env


def render_env(
    tmp_path: Path,
    existing_content: str,
    public_origin: str = "https://deploy.example.com",
    state_content: Optional[str] = None,
    env_overrides: Optional[dict[str, str]] = None,
    strict: bool = False,
) -> tuple[str, Path]:
    template_path = tmp_path / "env.example"
    existing_path = tmp_path / ".env.docker"
    state_path = tmp_path / ".runtime" / "deploy-secrets.env"
    output_path = tmp_path / "rendered.env"
    template_path.write_text(TEMPLATE_CONTENT, encoding="utf-8")
    existing_path.write_text(dedent(existing_content).strip() + "\n", encoding="utf-8")
    if state_content is not None:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(dedent(state_content).strip() + "\n", encoding="utf-8")

    env = clean_env()
    if env_overrides:
        env.update(env_overrides)

    cmd = [
        sys.executable,
        str(SCRIPT_PATH),
        "--template",
        str(template_path),
        "--existing",
        str(existing_path),
        "--output",
        str(output_path),
        "--https-port",
        "443",
        "--public-origin",
        public_origin,
    ]
    if state_content is not None or not strict:
        cmd.extend(["--state", str(state_path)])
    if strict:
        cmd.append("--strict")

    subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    return output_path.read_text(encoding="utf-8"), state_path


def parse_env(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        try:
            decoded = ast.literal_eval(value)
        except (SyntaxError, ValueError):
            decoded = value
        if not isinstance(decoded, str):
            decoded = str(decoded)
        values[key] = decoded
    return values


def test_render_preserves_existing_values_and_generates_missing_secrets(tmp_path: Path) -> None:
    content, state_path = render_env(
        tmp_path,
        """
        POSTGRES_DB=existing_db
        POSTGRES_USER=existing_user
        CASESYSTEM_ENVIRONMENT=staging
        CASESYSTEM_SMTP_HOST=
        CASESYSTEM_SMTP_USERNAME=
        CASESYSTEM_SMTP_FROM_EMAIL=
        """,
    )
    values = parse_env(content)

    assert values["HTTPS_PORT"] == "443"
    assert values["POSTGRES_DB"] == "existing_db"
    assert values["POSTGRES_USER"] == "existing_user"
    assert values["CASESYSTEM_ENVIRONMENT"] == "staging"
    assert values["CASESYSTEM_COOKIE_SECURE"] == "true"
    assert values["CASESYSTEM_ALLOWED_ORIGINS"] == '["https://deploy.example.com"]'
    assert values["CASESYSTEM_SMTP_PASSWORD"] == ""
    assert re.fullmatch(r"[0-9a-f]{32}", values["POSTGRES_PASSWORD"])
    assert re.fullmatch(r"[0-9a-f]{64}", values["CASESYSTEM_JWT_SECRET_KEY"])
    assert values["CASESYSTEM_DATABASE_URL"].startswith("postgresql+psycopg://existing_user:")
    assert values["CASESYSTEM_DATABASE_URL"].endswith("@postgres:5432/existing_db")
    assert state_path.is_file()
    state_values = parse_env(state_path.read_text(encoding="utf-8"))
    assert state_values["POSTGRES_PASSWORD"] == values["POSTGRES_PASSWORD"]
    assert state_values["CASESYSTEM_JWT_SECRET_KEY"] == values["CASESYSTEM_JWT_SECRET_KEY"]


def test_render_reuses_state_file_secrets_when_env_placeholder(tmp_path: Path) -> None:
    content, state_path = render_env(
        tmp_path,
        """
        POSTGRES_DB=existing_db
        POSTGRES_USER=existing_user
        CASESYSTEM_ENVIRONMENT=staging
        CASESYSTEM_SMTP_HOST=
        CASESYSTEM_SMTP_USERNAME=
        CASESYSTEM_SMTP_FROM_EMAIL=
        """,
        state_content="""
        POSTGRES_PASSWORD=stable-db-password
        CASESYSTEM_JWT_SECRET_KEY=stable-jwt-secret-key-stable-jwt-secret-key-123456
        """,
    )
    values = parse_env(content)

    assert values["POSTGRES_PASSWORD"] == "stable-db-password"
    assert values["CASESYSTEM_JWT_SECRET_KEY"] == "stable-jwt-secret-key-stable-jwt-secret-key-123456"
    assert state_path.is_file()
    state_values = parse_env(state_path.read_text(encoding="utf-8"))
    assert state_values["POSTGRES_PASSWORD"] == "stable-db-password"
    assert state_values["CASESYSTEM_JWT_SECRET_KEY"] == "stable-jwt-secret-key-stable-jwt-secret-key-123456"


def test_render_fails_when_smtp_configured_without_password(tmp_path: Path) -> None:
    template_path = tmp_path / "env.example"
    existing_path = tmp_path / ".env.docker"
    output_path = tmp_path / "rendered.env"
    template_path.write_text(TEMPLATE_CONTENT, encoding="utf-8")
    existing_path.write_text(
        dedent(
            """
            CASESYSTEM_SMTP_HOST=smtp.example.com
            CASESYSTEM_SMTP_USERNAME=user@example.com
            CASESYSTEM_SMTP_FROM_EMAIL=from@example.com
            CASESYSTEM_SMTP_PASSWORD=
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(subprocess.CalledProcessError) as excinfo:
        subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--template",
                str(template_path),
                "--existing",
                str(existing_path),
                "--output",
                str(output_path),
                "--https-port",
                "443",
                "--public-origin",
                "https://deploy.example.com",
            ],
            check=True,
            capture_output=True,
            text=True,
            env=clean_env(),
        )

    assert "CASESYSTEM_SMTP_PASSWORD is required" in excinfo.value.stderr


def test_render_strict_requires_gitlab_variables_and_ignores_existing_file(tmp_path: Path) -> None:
    template_path = tmp_path / "env.example"
    existing_path = tmp_path / ".env.docker"
    output_path = tmp_path / "rendered.env"
    template_path.write_text(TEMPLATE_CONTENT, encoding="utf-8")
    existing_path.write_text(
        dedent(
            """
            POSTGRES_DB=stale_db
            POSTGRES_USER=stale_user
            POSTGRES_PASSWORD=stale-db-password
            CASESYSTEM_JWT_SECRET_KEY=stale-jwt-secret-key-stale-jwt-secret-key-123456
            CASESYSTEM_SMTP_HOST=stale.example.com
            CASESYSTEM_SMTP_PORT=587
            CASESYSTEM_SMTP_USERNAME=stale@example.com
            CASESYSTEM_SMTP_PASSWORD=stale-smtp-password
            CASESYSTEM_SMTP_FROM_EMAIL=stale@example.com
            CASESYSTEM_SMTP_USE_SSL=false
            CASESYSTEM_SMTP_STARTTLS=true
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(subprocess.CalledProcessError) as excinfo:
        subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--template",
                str(template_path),
                "--existing",
                str(existing_path),
                "--output",
                str(output_path),
                "--https-port",
                "443",
                "--public-origin",
                "https://deploy.example.com",
                "--strict",
            ],
            check=True,
            capture_output=True,
            text=True,
            env=clean_env(),
        )

    assert "Missing required GitLab CI/CD variables in strict mode" in excinfo.value.stderr


def test_render_strict_uses_gitlab_variables_and_allowed_origin_override(tmp_path: Path) -> None:
    content, _ = render_env(
        tmp_path,
        """
        POSTGRES_DB=stale_db
        POSTGRES_USER=stale_user
        CASESYSTEM_ENVIRONMENT=staging
        CASESYSTEM_SMTP_HOST=stale.example.com
        CASESYSTEM_SMTP_USERNAME=stale@example.com
        CASESYSTEM_SMTP_FROM_EMAIL=stale@example.com
        """,
        env_overrides={
            "POSTGRES_DB": "prod_db",
            "POSTGRES_USER": "prod_user",
            "POSTGRES_PASSWORD": "prod-db-password",
            "CASESYSTEM_JWT_SECRET_KEY": "prod-jwt-secret-key-prod-jwt-secret-key-123456",
            "CASESYSTEM_SMTP_HOST": "smtp.example.com",
            "CASESYSTEM_SMTP_PORT": "587",
            "CASESYSTEM_SMTP_USERNAME": "user@example.com",
            "CASESYSTEM_SMTP_PASSWORD": "smtp-password",
            "CASESYSTEM_SMTP_FROM_EMAIL": "from@example.com",
            "CASESYSTEM_SMTP_USE_SSL": "false",
            "CASESYSTEM_SMTP_STARTTLS": "true",
            "CASESYSTEM_ALLOWED_ORIGINS": '["https://prod.example.com","https://admin.example.com"]',
        },
        strict=True,
    )
    values = parse_env(content)

    assert values["POSTGRES_DB"] == "prod_db"
    assert values["POSTGRES_USER"] == "prod_user"
    assert values["POSTGRES_PASSWORD"] == "prod-db-password"
    assert values["CASESYSTEM_JWT_SECRET_KEY"] == "prod-jwt-secret-key-prod-jwt-secret-key-123456"
    assert values["CASESYSTEM_ALLOWED_ORIGINS"] == '["https://prod.example.com","https://admin.example.com"]'
