#!/usr/bin/env python3

import argparse
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


ORDERED_KEYS = [
    "HTTPS_PORT",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "CASESYSTEM_DATABASE_URL",
    "CASESYSTEM_ENVIRONMENT",
    "CASESYSTEM_COOKIE_SECURE",
    "CASESYSTEM_ALLOWED_ORIGINS",
    "CASESYSTEM_JWT_SECRET_KEY",
    "CASESYSTEM_REPORT_STORAGE_DIR",
    "CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS",
    "CASESYSTEM_TICKET_CACHE_TTL_SECONDS",
    "CASESYSTEM_SQLITE_SOURCE_PATH",
    "CASESYSTEM_SMTP_HOST",
    "CASESYSTEM_SMTP_PORT",
    "CASESYSTEM_SMTP_USERNAME",
    "CASESYSTEM_SMTP_PASSWORD",
    "CASESYSTEM_SMTP_FROM_EMAIL",
    "CASESYSTEM_SMTP_USE_SSL",
    "CASESYSTEM_SMTP_STARTTLS",
]

DEFAULTS = {
    "POSTGRES_DB": "casesystem",
    "POSTGRES_USER": "casesystem",
    "CASESYSTEM_ENVIRONMENT": "docker",
    "CASESYSTEM_REPORT_STORAGE_DIR": "/app/.runtime/report-storage",
    "CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS": "30",
    "CASESYSTEM_TICKET_CACHE_TTL_SECONDS": "60",
    "CASESYSTEM_SQLITE_SOURCE_PATH": "/workspace/casesystem.db",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render .env.docker for TLS deployment.")
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--existing", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--https-port", required=True)
    parser.add_argument("--public-origin", required=True)
    return parser.parse_args()


def parse_env_value(raw: str) -> str:
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] == '"':
        body = raw[1:-1]
        result = []
        i = 0
        while i < len(body):
            ch = body[i]
            if ch == "\\" and i + 1 < len(body):
                nxt = body[i + 1]
                if nxt == "n":
                    result.append("\n")
                    i += 2
                    continue
                if nxt == "r":
                    result.append("\r")
                    i += 2
                    continue
                if nxt == '"':
                    result.append('"')
                    i += 2
                    continue
                if nxt == "\\":
                    result.append("\\")
                    i += 2
                    continue
            result.append(ch)
            i += 1
        return "".join(result)
    if len(raw) >= 2 and raw[0] == raw[-1] == "'":
        return raw[1:-1]
    return raw


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = parse_env_value(value)
    return values


def render_env_value(value: str) -> str:
    if value == "":
        return '""'
    if re.fullmatch(r"[A-Za-z0-9_./:@%+,-]+", value):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r")
    return f'"{escaped}"'


def env_override(name: str):
    if name in os.environ:
        return os.environ[name]
    return None


def choose_text(name: str, existing: dict[str, str], template: dict[str, str], fallback: str = "") -> str:
    override = env_override(name)
    if override is not None:
        return override
    if name in existing:
        return existing[name]
    if name in template:
        return template[name]
    return fallback


def choose_secret(name: str, existing: dict[str, str], template: dict[str, str], bytes_len: int) -> str:
    override = env_override(name)
    if override:
        return override
    existing_value = existing.get(name, "")
    if existing_value and existing_value != template.get(name, ""):
        return existing_value
    return secrets.token_hex(bytes_len)


def write_env_file(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    tmp_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def main() -> None:
    args = parse_args()
    if not args.template.is_file():
        raise SystemExit(f"Missing environment template: {args.template}")

    template = load_env_file(args.template)
    existing = load_env_file(args.existing)

    postgres_user = choose_text("POSTGRES_USER", existing, template, DEFAULTS["POSTGRES_USER"])
    postgres_db = choose_text("POSTGRES_DB", existing, template, DEFAULTS["POSTGRES_DB"])
    environment = choose_text("CASESYSTEM_ENVIRONMENT", existing, template, DEFAULTS["CASESYSTEM_ENVIRONMENT"])
    report_storage_dir = choose_text(
        "CASESYSTEM_REPORT_STORAGE_DIR",
        existing,
        template,
        DEFAULTS["CASESYSTEM_REPORT_STORAGE_DIR"],
    )
    celery_event_sweep_interval_seconds = choose_text(
        "CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS",
        existing,
        template,
        DEFAULTS["CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS"],
    )
    ticket_cache_ttl_seconds = choose_text(
        "CASESYSTEM_TICKET_CACHE_TTL_SECONDS",
        existing,
        template,
        DEFAULTS["CASESYSTEM_TICKET_CACHE_TTL_SECONDS"],
    )
    sqlite_source_path = choose_text(
        "CASESYSTEM_SQLITE_SOURCE_PATH",
        existing,
        template,
        DEFAULTS["CASESYSTEM_SQLITE_SOURCE_PATH"],
    )
    smtp_host = choose_text("CASESYSTEM_SMTP_HOST", existing, template)
    smtp_port = choose_text("CASESYSTEM_SMTP_PORT", existing, template, "25")
    smtp_username = choose_text("CASESYSTEM_SMTP_USERNAME", existing, template)
    smtp_from_email = choose_text("CASESYSTEM_SMTP_FROM_EMAIL", existing, template, "noreply@casesystem.local")
    smtp_use_ssl = choose_text("CASESYSTEM_SMTP_USE_SSL", existing, template, "false")
    smtp_starttls = choose_text("CASESYSTEM_SMTP_STARTTLS", existing, template, "false")

    postgres_password = choose_secret("POSTGRES_PASSWORD", existing, template, 16)
    jwt_secret_key = choose_secret("CASESYSTEM_JWT_SECRET_KEY", existing, template, 32)

    smtp_active = any([smtp_host, smtp_username, smtp_from_email])
    smtp_password = choose_text("CASESYSTEM_SMTP_PASSWORD", existing, template)
    if smtp_active and not smtp_password:
        raise SystemExit(
            "CASESYSTEM_SMTP_PASSWORD is required because SMTP settings are configured. "
            "Provide --smtp-password or set CASESYSTEM_SMTP_PASSWORD."
        )
    if not smtp_active:
        smtp_password = ""

    database_url = (
        "postgresql+psycopg://"
        f"{quote(postgres_user, safe='')}:"
        f"{quote(postgres_password, safe='')}"
        f"@postgres:5432/{quote(postgres_db, safe='')}"
    )
    allowed_origins = f'["{args.public_origin}"]'

    values = {
        "HTTPS_PORT": args.https_port,
        "POSTGRES_DB": postgres_db,
        "POSTGRES_USER": postgres_user,
        "POSTGRES_PASSWORD": postgres_password,
        "CASESYSTEM_DATABASE_URL": database_url,
        "CASESYSTEM_ENVIRONMENT": environment,
        "CASESYSTEM_COOKIE_SECURE": "true",
        "CASESYSTEM_ALLOWED_ORIGINS": allowed_origins,
        "CASESYSTEM_JWT_SECRET_KEY": jwt_secret_key,
        "CASESYSTEM_REPORT_STORAGE_DIR": report_storage_dir,
        "CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS": celery_event_sweep_interval_seconds,
        "CASESYSTEM_TICKET_CACHE_TTL_SECONDS": ticket_cache_ttl_seconds,
        "CASESYSTEM_SQLITE_SOURCE_PATH": sqlite_source_path,
        "CASESYSTEM_SMTP_HOST": smtp_host,
        "CASESYSTEM_SMTP_PORT": smtp_port,
        "CASESYSTEM_SMTP_USERNAME": smtp_username,
        "CASESYSTEM_SMTP_PASSWORD": smtp_password,
        "CASESYSTEM_SMTP_FROM_EMAIL": smtp_from_email,
        "CASESYSTEM_SMTP_USE_SSL": smtp_use_ssl,
        "CASESYSTEM_SMTP_STARTTLS": smtp_starttls,
    }

    lines = [
        f"# generated by scripts/render_docker_env.py on {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
    ]
    for key in ORDERED_KEYS:
        lines.append(f"{key}={render_env_value(values[key])}")

    write_env_file(args.output, lines)


if __name__ == "__main__":
    main()
