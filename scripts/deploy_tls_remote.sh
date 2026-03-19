#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-}"
ENV_FILE="${ENV_FILE:-.env.docker}"
HTTPS_PORT="${HTTPS_PORT:-443}"

die() {
  echo "Error: $*" >&2
  exit 1
}

log() {
  echo "==> $*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command on remote host: $1"
}

wait_for_healthy() {
  local service="$1"
  local container_id=""
  local health_status=""
  local attempt=1

  while [[ "${attempt}" -le 60 ]]; do
    container_id="$(docker compose --env-file "${ENV_FILE}" ps -q "${service}" || true)"
    if [[ -n "${container_id}" ]]; then
      health_status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" || true)"
      if [[ "${health_status}" == "healthy" ]]; then
        return 0
      fi
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  docker compose --env-file "${ENV_FILE}" ps
  die "${service} did not become healthy in time"
}

smoke_https() {
  local python_bin=""
  python_bin="$(command -v python3 || command -v python || true)"
  [[ -n "${python_bin}" ]] || die "python3 or python is required on the remote host for smoke checks."

  HTTPS_PORT="${HTTPS_PORT}" "${python_bin}" - <<'PY'
import os
import ssl
import time
import urllib.request

port = int(os.environ["HTTPS_PORT"])
context = ssl._create_unverified_context()
base_url = f"https://127.0.0.1:{port}"


def fetch(path: str, label: str) -> str:
    last_error = None
    for _ in range(20):
        try:
            with urllib.request.urlopen(f"{base_url}{path}", context=context, timeout=10) as response:
                body = response.read().decode("utf-8")
                print(f"==> {label}: {response.status}")
                return body
        except Exception as exc:  # pragma: no cover - remote runtime guard
            last_error = exc
            time.sleep(1)
    raise SystemExit(f"{label} failed: {last_error}")


health_body = fetch("/healthz", "healthz")
if '"message":"ok"' not in health_body.replace(" ", ""):
    raise SystemExit("Health check returned an unexpected body")

login_body = fetch("/login", "login")
if "<!doctype html>" not in login_body.lower():
    raise SystemExit("Login page validation failed")

csrf_body = fetch("/auth/csrf", "csrf")
if '"csrf_token"' not in csrf_body:
    raise SystemExit("CSRF endpoint validation failed")
PY
}

main() {
  [[ -n "${REMOTE_DIR}" ]] || die "REMOTE_DIR is required"

  require_cmd docker

  cd "${REMOTE_DIR}"
  log "Validating remote compose configuration"
  docker compose --env-file "${ENV_FILE}" config >/dev/null

  log "Building remote images"
  docker compose --env-file "${ENV_FILE}" build

  log "Starting postgres and redis"
  docker compose --env-file "${ENV_FILE}" up -d postgres redis

  log "Running bootstrap"
  docker compose --env-file "${ENV_FILE}" --profile init run --rm bootstrap

  log "Starting api, worker, and beat"
  docker compose --env-file "${ENV_FILE}" up -d --no-deps --force-recreate api worker beat
  wait_for_healthy api

  log "Starting nginx"
  docker compose --env-file "${ENV_FILE}" up -d --no-deps --force-recreate nginx
  docker compose --env-file "${ENV_FILE}" ps

  log "Running HTTPS smoke checks"
  smoke_https
}

main "$@"
