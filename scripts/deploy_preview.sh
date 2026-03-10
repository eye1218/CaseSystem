#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-${ROOT_DIR}/.npm-cache}"

REMOTE_HOST="${REMOTE_HOST:-192.168.2.170}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/workspace/CaseSystem}"
SERVICE_NAME="${SERVICE_NAME:-casesystem-preview}"
APP_PORT="${APP_PORT:-8010}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
RUN_TESTS="${RUN_TESTS:-1}"
BUILD_FRONTEND="${BUILD_FRONTEND:-1}"

if [[ "${RUN_TESTS}" == "1" ]]; then
  echo "==> Running backend tests"
  "${ROOT_DIR}/.venv/bin/pytest" backend/tests -q
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
  --exclude 'frontend/node_modules' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '.DS_Store' \
  "${ROOT_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> Preparing remote runtime"
ssh "${REMOTE_USER}@${REMOTE_HOST}" \
  "REMOTE_DIR='${REMOTE_DIR}' SERVICE_NAME='${SERVICE_NAME}' APP_PORT='${APP_PORT}' PYTHON_BIN='${PYTHON_BIN}' bash -s" <<'EOF'
set -euo pipefail

mkdir -p "${REMOTE_DIR}"
cd "${REMOTE_DIR}"

if [[ ! -d .venv ]]; then
  "${PYTHON_BIN}" -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e '.[dev]'

cat >/etc/systemd/system/${SERVICE_NAME}.service <<UNIT
[Unit]
Description=CaseSystem Preview Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}
Environment=CASESYSTEM_ENVIRONMENT=preview
Environment=CASESYSTEM_COOKIE_SECURE=false
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
