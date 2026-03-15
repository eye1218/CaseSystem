#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-${ROOT_DIR}/.npm-cache}"
LOCAL_PYTHON="${LOCAL_PYTHON:-}"

REMOTE_HOST="${REMOTE_HOST:-192.168.2.170}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/workspace/CaseSystem}"
SERVICE_NAME="${SERVICE_NAME:-casesystem-preview}"
APP_PORT="${APP_PORT:-8010}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
RUN_TESTS="${RUN_TESTS:-1}"
BUILD_FRONTEND="${BUILD_FRONTEND:-1}"
SYNC_LOCAL_ENV="${SYNC_LOCAL_ENV:-1}"
CELERY_ENABLE_SERVICES="${CELERY_ENABLE_SERVICES:-0}"
CELERY_BROKER_URL="${CELERY_BROKER_URL:-}"
CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-}"
CELERY_EVENT_SWEEP_INTERVAL_SECONDS="${CELERY_EVENT_SWEEP_INTERVAL_SECONDS:-30}"

if [[ "${CELERY_ENABLE_SERVICES}" == "1" ]]; then
  if [[ -z "${CELERY_BROKER_URL}" ]]; then
    echo "CELERY_BROKER_URL is required when CELERY_ENABLE_SERVICES=1" >&2
    exit 1
  fi
  if [[ -z "${CELERY_RESULT_BACKEND}" ]]; then
    CELERY_RESULT_BACKEND="${CELERY_BROKER_URL}"
  fi
fi

GIT_COMMON_DIR="$(git -C "${ROOT_DIR}" rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -n "${GIT_COMMON_DIR}" && "${GIT_COMMON_DIR}" != /* ]]; then
  GIT_COMMON_DIR="$(cd "${ROOT_DIR}" && cd "${GIT_COMMON_DIR}" && pwd)"
fi
COMMON_WORKTREE_ROOT=""
if [[ -n "${GIT_COMMON_DIR}" && -d "${GIT_COMMON_DIR}" ]]; then
  COMMON_WORKTREE_ROOT="$(cd "${GIT_COMMON_DIR}/.." && pwd)"
fi

resolve_local_python() {
  if [[ -n "${LOCAL_PYTHON}" ]]; then
    if [[ -x "${LOCAL_PYTHON}" ]]; then
      printf '%s\n' "${LOCAL_PYTHON}"
      return 0
    fi
    echo "Configured LOCAL_PYTHON is not executable: ${LOCAL_PYTHON}" >&2
    return 1
  fi

  local candidates=("${ROOT_DIR}/.venv/bin/python")
  if [[ -n "${COMMON_WORKTREE_ROOT}" && "${COMMON_WORKTREE_ROOT}" != "${ROOT_DIR}" ]]; then
    candidates+=("${COMMON_WORKTREE_ROOT}/.venv/bin/python")
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  echo "Could not find a local virtualenv python for deployment checks." >&2
  echo "Checked candidates:" >&2
  printf '  - %s\n' "${candidates[@]}" >&2
  echo "Set LOCAL_PYTHON=/abs/path/to/.venv/bin/python if your environment lives elsewhere." >&2
  return 1
}

if [[ "${RUN_TESTS}" == "1" ]]; then
  LOCAL_PYTHON_BIN="$(resolve_local_python)"
  echo "==> Using local python: ${LOCAL_PYTHON_BIN}"
  if [[ "${SYNC_LOCAL_ENV}" == "1" ]]; then
    echo "==> Syncing local virtualenv dependencies"
    "${LOCAL_PYTHON_BIN}" -m pip install -e '.[dev]'
  fi
  echo "==> Running backend tests"
  "${LOCAL_PYTHON_BIN}" -m pytest backend/tests -q
fi

if [[ "${BUILD_FRONTEND}" == "1" ]]; then
  echo "==> Building frontend"
  mkdir -p "${NPM_CACHE_DIR}"
  if [[ -f "${ROOT_DIR}/frontend/package-lock.json" ]]; then
    npm ci --cache "${NPM_CACHE_DIR}" --prefix "${ROOT_DIR}/frontend"
  else
    npm install --cache "${NPM_CACHE_DIR}" --prefix "${ROOT_DIR}/frontend"
  fi
  npm run build --prefix "${ROOT_DIR}/frontend"
fi

echo "==> Syncing project to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude '.npm-cache' \
  --exclude '.runtime' \
  --exclude 'backend/.runtime' \
  --exclude '*.db' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude 'frontend/node_modules' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '.DS_Store' \
  "${ROOT_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> Preparing remote runtime"
ssh "${REMOTE_USER}@${REMOTE_HOST}" \
  "REMOTE_DIR='${REMOTE_DIR}' SERVICE_NAME='${SERVICE_NAME}' APP_PORT='${APP_PORT}' PYTHON_BIN='${PYTHON_BIN}' CELERY_ENABLE_SERVICES='${CELERY_ENABLE_SERVICES}' CELERY_BROKER_URL='${CELERY_BROKER_URL}' CELERY_RESULT_BACKEND='${CELERY_RESULT_BACKEND}' CELERY_EVENT_SWEEP_INTERVAL_SECONDS='${CELERY_EVENT_SWEEP_INTERVAL_SECONDS}' bash -s" <<'EOF'
set -euo pipefail

mkdir -p "${REMOTE_DIR}"
cd "${REMOTE_DIR}"

if [[ ! -d .venv ]]; then
  "${PYTHON_BIN}" -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e '.[dev]'

CELERY_ENV_LINES=""
if [[ "${CELERY_ENABLE_SERVICES}" == "1" ]]; then
  CELERY_ENV_LINES=$(cat <<LINES
Environment="CASESYSTEM_CELERY_TASK_ALWAYS_EAGER=false"
Environment="CASESYSTEM_CELERY_TASK_EAGER_PROPAGATES=false"
Environment="CASESYSTEM_CELERY_BROKER_URL=${CELERY_BROKER_URL}"
Environment="CASESYSTEM_CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND}"
Environment="CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS=${CELERY_EVENT_SWEEP_INTERVAL_SECONDS}"
LINES
)
fi

cat >/etc/systemd/system/${SERVICE_NAME}.service <<UNIT
[Unit]
Description=CaseSystem Preview Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}
Environment=CASESYSTEM_ENVIRONMENT=preview
Environment=CASESYSTEM_COOKIE_SECURE=false
${CELERY_ENV_LINES}
ExecStart=${REMOTE_DIR}/.venv/bin/uvicorn app.main:app --app-dir ${REMOTE_DIR}/backend --host 0.0.0.0 --port ${APP_PORT}
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,18p'

if [[ "${CELERY_ENABLE_SERVICES}" == "1" ]]; then
  cat >/etc/systemd/system/${SERVICE_NAME}-celery-worker.service <<UNIT
[Unit]
Description=CaseSystem Preview Celery Worker
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}
Environment=CASESYSTEM_ENVIRONMENT=preview
Environment=CASESYSTEM_COOKIE_SECURE=false
${CELERY_ENV_LINES}
ExecStart=${REMOTE_DIR}/.venv/bin/celery -A app.worker.celery_app.celery_app worker --loglevel=INFO --pool=solo
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT

  cat >/etc/systemd/system/${SERVICE_NAME}-celery-beat.service <<UNIT
[Unit]
Description=CaseSystem Preview Celery Beat
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}
Environment=CASESYSTEM_ENVIRONMENT=preview
Environment=CASESYSTEM_COOKIE_SECURE=false
${CELERY_ENV_LINES}
ExecStart=${REMOTE_DIR}/.venv/bin/celery -A app.worker.celery_app.celery_app beat --loglevel=INFO
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}-celery-worker"
  systemctl restart "${SERVICE_NAME}-celery-worker"
  systemctl --no-pager --full status "${SERVICE_NAME}-celery-worker" | sed -n '1,18p'
  systemctl enable --now "${SERVICE_NAME}-celery-beat"
  systemctl restart "${SERVICE_NAME}-celery-beat"
  systemctl --no-pager --full status "${SERVICE_NAME}-celery-beat" | sed -n '1,18p'
else
  systemctl disable --now "${SERVICE_NAME}-celery-worker" 2>/dev/null || true
  systemctl disable --now "${SERVICE_NAME}-celery-beat" 2>/dev/null || true
fi
.venv/bin/python - <<PY
import json
import time
from urllib.request import Request, build_opener

base_url = "http://127.0.0.1:${APP_PORT}"
health_url = f"{base_url}/healthz"
last_error = None

for _ in range(10):
    try:
        with build_opener().open(health_url, timeout=5) as response:
            body = response.read().decode("utf-8")
            print(f"==> Remote health: {response.status} {body}")
            break
    except Exception as exc:
        last_error = exc
        time.sleep(1)
else:
    raise SystemExit(f"Health check failed for {health_url}: {last_error}")

login_request = Request(f"{base_url}/login")
with build_opener().open(login_request, timeout=5) as response:
    html = response.read().decode("utf-8")
    if "CaseSystem" not in html:
        raise SystemExit("Login page validation failed: missing CaseSystem marker")
    print(f"==> Remote login page: {response.status}")

csrf_opener = build_opener()
with csrf_opener.open(f"{base_url}/auth/csrf", timeout=5) as response:
    csrf_payload = json.loads(response.read().decode("utf-8"))
    csrf_token = csrf_payload["csrf_token"]
    cookies = response.headers.get_all("Set-Cookie", [])

login_body = json.dumps({"username": "admin", "password": "AdminPass123"}).encode("utf-8")
login_headers = {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrf_token,
    "Origin": base_url,
}
if cookies:
    login_headers["Cookie"] = "; ".join(cookie.split(";", 1)[0] for cookie in cookies)

login_req = Request(f"{base_url}/auth/login", data=login_body, headers=login_headers, method="POST")
with build_opener().open(login_req, timeout=5) as response:
    session_cookies = cookies + response.headers.get_all("Set-Cookie", [])
    if response.status != 200:
        raise SystemExit(f"Remote login failed: {response.status}")
    print("==> Remote login: 200")

tickets_headers = {}
if session_cookies:
    tickets_headers["Cookie"] = "; ".join(cookie.split(";", 1)[0] for cookie in session_cookies)
tickets_req = Request(f"{base_url}/api/v1/tickets", headers=tickets_headers)
with build_opener().open(tickets_req, timeout=5) as response:
    payload = json.loads(response.read().decode("utf-8"))
    if response.status != 200 or payload.get("total_count", 0) < 1:
        raise SystemExit(f"Remote tickets validation failed: {response.status} {payload}")
    print(f"==> Remote tickets: {response.status} total_count={payload['total_count']}")
PY
EOF

echo "==> Preview deployed"
echo "    URL: http://${REMOTE_HOST}:${APP_PORT}/login"
