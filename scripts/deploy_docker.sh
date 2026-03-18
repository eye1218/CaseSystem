#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_PYTHON="${LOCAL_PYTHON:-}"
REMOTE_HOST="${REMOTE_HOST:-192.168.2.90}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/workspace/CaseSystem}"
ENV_FILE="${ENV_FILE:-.env.docker}"
RUN_TESTS="${RUN_TESTS:-1}"
SYNC_LOCAL_ENV="${SYNC_LOCAL_ENV:-1}"

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
  return 1
}

if [[ ! -f "${ROOT_DIR}/${ENV_FILE}" ]]; then
  echo "Missing deployment env file: ${ROOT_DIR}/${ENV_FILE}" >&2
  exit 1
fi

if [[ "${RUN_TESTS}" == "1" ]]; then
  LOCAL_PYTHON_BIN="$(resolve_local_python)"
  echo "==> Using local python: ${LOCAL_PYTHON_BIN}"
  if [[ "${SYNC_LOCAL_ENV}" == "1" ]]; then
    echo "==> Syncing local virtualenv dependencies"
    "${LOCAL_PYTHON_BIN}" -m pip install -e '.[dev]'
  fi
  echo "==> Running backend tests"
  "${LOCAL_PYTHON_BIN}" -m pytest backend/tests/test_event_api.py backend/tests/test_event_task_flow_doc.py -q
fi

echo "==> Syncing project to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude '.pytest_cache' \
  --exclude '.runtime' \
  --exclude 'backend/.runtime' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude '__pycache__' \
  --exclude '*.db' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude '.DS_Store' \
  "${ROOT_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> Syncing deployment env file"
rsync -az "${ROOT_DIR}/${ENV_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${ENV_FILE}"

echo "==> Deploying Docker services"
ssh "${REMOTE_USER}@${REMOTE_HOST}" \
  "REMOTE_DIR='${REMOTE_DIR}' ENV_FILE='${ENV_FILE}' bash -s" <<'EOF'
set -euo pipefail

cd "${REMOTE_DIR}"

docker compose --env-file "${ENV_FILE}" build
docker compose --env-file "${ENV_FILE}" up -d postgres redis
docker compose --env-file "${ENV_FILE}" --profile init run --rm bootstrap
docker compose --env-file "${ENV_FILE}" up -d api worker beat
docker compose --env-file "${ENV_FILE}" ps

python3 - <<PY
import time
from urllib.request import urlopen

for _ in range(20):
    try:
        with urlopen("http://127.0.0.1:8010/healthz", timeout=5) as response:
            body = response.read().decode("utf-8")
            print(f"==> Remote health: {response.status} {body}")
            break
    except Exception as exc:
        last_error = exc
        time.sleep(2)
else:
    raise SystemExit(f"Health check failed: {last_error}")
PY
EOF

echo "==> Docker deployment finished"
echo "    URL: http://${REMOTE_HOST}:8010/login"
