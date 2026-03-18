#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-${ROOT_DIR}/.npm-cache}"
REMOTE_HOST="${REMOTE_HOST:-192.168.20.142}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/workspace/CaseSystem}"
ENV_FILE="${ENV_FILE:-.env.docker}"
BUILD_FRONTEND="${BUILD_FRONTEND:-1}"
SYNC_REMOTE_STATE="${SYNC_REMOTE_STATE:-0}"
SERVICES="${SERVICES:-api worker beat}"

if [[ "${SYNC_REMOTE_STATE}" == "1" ]]; then
  "${ROOT_DIR}/scripts/sync_remote_state.sh"
fi

if [[ "${BUILD_FRONTEND}" == "1" ]]; then
  echo "==> Building frontend dist"
  mkdir -p "${NPM_CACHE_DIR}"
  if [[ -f "${ROOT_DIR}/frontend/package-lock.json" ]]; then
    npm ci --cache "${NPM_CACHE_DIR}" --prefix "${ROOT_DIR}/frontend"
  else
    npm install --cache "${NPM_CACHE_DIR}" --prefix "${ROOT_DIR}/frontend"
  fi
  npm run build --prefix "${ROOT_DIR}/frontend"
fi

echo "==> Syncing local workspace to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'frontend/node_modules' \
  --exclude '.npm-cache' \
  --exclude '.runtime' \
  --exclude 'backend/.runtime' \
  --exclude '.pytest_cache' \
  --exclude '.ruff_cache' \
  --exclude '__pycache__' \
  --exclude '.DS_Store' \
  "${ROOT_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> Restarting docker services: ${SERVICES}"
ssh "${REMOTE_USER}@${REMOTE_HOST}" \
  "REMOTE_DIR='${REMOTE_DIR}' ENV_FILE='${ENV_FILE}' SERVICES='${SERVICES}' bash -s" <<'EOSH'
set -euo pipefail

cd "${REMOTE_DIR}"
docker compose --env-file "${ENV_FILE}" up -d --force-recreate ${SERVICES}
docker compose --env-file "${ENV_FILE}" ps

python3 - <<PY
import time
from urllib.request import urlopen

last_error = None
for _ in range(20):
    try:
        with urlopen("http://127.0.0.1:8010/healthz", timeout=5) as response:
            print(f"==> Remote health: {response.status} {response.read().decode('utf-8')}")
            break
    except Exception as exc:
        last_error = exc
        time.sleep(1)
else:
    raise SystemExit(f"Health check failed: {last_error}")
PY
EOSH

echo "==> Fast docker deploy complete"
echo "    URL: http://${REMOTE_HOST}:8010/login"
