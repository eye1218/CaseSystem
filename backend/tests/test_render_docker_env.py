from __future__ import annotations

import ast
import os
import re
import subprocess
import sys
from pathlib import Path
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


def render_env(tmp_path: Path, existing_content: str, public_origin: str = "https://deploy.example.com") -> str:
    template_path = tmp_path / "env.example"
    existing_path = tmp_path / ".env.docker"
    output_path = tmp_path / "rendered.env"
    template_path.write_text(TEMPLATE_CONTENT, encoding="utf-8")
    existing_path.write_text(dedent(existing_content).strip() + "\n", encoding="utf-8")

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
            public_origin,
        ],
        check=True,
        capture_output=True,
        text=True,
        env=clean_env(),
    )
    return output_path.read_text(encoding="utf-8")


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
    content = render_env(
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
