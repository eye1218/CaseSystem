#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_TEMPLATE="${ROOT_DIR}/.env.docker.example"
ENV_FILE_NAME=".env.docker"
ENV_FILE_PATH="${ROOT_DIR}/${ENV_FILE_NAME}"
STATE_FILE_NAME=".runtime/deploy-secrets.env"
STATE_FILE_PATH="${ROOT_DIR}/${STATE_FILE_NAME}"
CERT_DIR="${ROOT_DIR}/deploy/nginx/certs"
NGINX_CONF_PATH="${ROOT_DIR}/deploy/nginx/nginx.conf"
BACKUP_ROOT="${ROOT_DIR}/.runtime/deploy-backups"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/workspace/CaseSystem}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
HTTPS_PORT="${HTTPS_PORT:-443}"
SSH_PORT="${SSH_PORT:-22}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy_tls_docker.sh --remote-host <host> [options]

Required:
  REMOTE_HOST

Defaults:
  REMOTE_USER=root
  REMOTE_DIR=/root/workspace/CaseSystem
  PUBLIC_HOST=<REMOTE_HOST>
  HTTPS_PORT=443
  SSH_PORT=22

Optional overrides:
  POSTGRES_PASSWORD
  CASESYSTEM_JWT_SECRET_KEY
  CASESYSTEM_SMTP_PASSWORD

Environment passthrough:
  COMPOSE_PROJECT_NAME
  POSTGRES_USER
  POSTGRES_DB
  CASESYSTEM_ENVIRONMENT
  CASESYSTEM_REPORT_STORAGE_DIR
  CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS
  CASESYSTEM_TICKET_CACHE_TTL_SECONDS
  CASESYSTEM_SQLITE_SOURCE_PATH
  CASESYSTEM_SMTP_HOST
  CASESYSTEM_SMTP_PORT
  CASESYSTEM_SMTP_USERNAME
  CASESYSTEM_SMTP_FROM_EMAIL
  CASESYSTEM_SMTP_USE_SSL
  CASESYSTEM_SMTP_STARTTLS

The script is non-interactive and never waits for user input.
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

log() {
  echo "==> $*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

shell_quote() {
  printf "'%s'" "$(printf '%s' "${1-}" | sed "s/'/'\"'\"'/g")"
}

is_ipv4_literal() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

is_valid_host_token() {
  [[ "$1" =~ ^[A-Za-z0-9.-]+$ ]]
}

public_origin() {
  if [[ "${HTTPS_PORT}" == "443" ]]; then
    printf 'https://%s' "${PUBLIC_HOST}"
  else
    printf 'https://%s:%s' "${PUBLIC_HOST}" "${HTTPS_PORT}"
  fi
}

backup_file() {
  local source="$1"
  local basename="$2"

  if [[ ! -e "${source}" ]]; then
    return 0
  fi

  mkdir -p "${BACKUP_ROOT}"
  local timestamp destination
  timestamp="$(date -u +%Y%m%dT%H%M%SZ).$$"
  destination="${BACKUP_ROOT}/${basename}.${timestamp}"
  cp -p "${source}" "${destination}"
  printf '%s\n' "${destination}"
}

sync_path_to_remote() {
  local source="$1"
  local destination="$2"
  local rsync_target="${REMOTE_TARGET}:${destination}"
  rsync -az -e "${RSYNC_SSH}" "${source}" "${rsync_target}"
}

sync_remote_file_to_local_if_exists() {
  local remote_path="$1"
  local local_path="$2"

  if "${SSH_BASE[@]}" "${SSH_TARGET}" "test -f $(shell_quote "${remote_path}")"; then
    mkdir -p "$(dirname "${local_path}")"
    rsync -az -e "${RSYNC_SSH}" "${REMOTE_TARGET}:${remote_path}" "${local_path}"
    return 0
  fi

  return 1
}

remote_volume_exists() {
  local volume_name="$1"
  "${SSH_BASE[@]}" "${SSH_TARGET}" "docker volume inspect $(shell_quote "${volume_name}") >/dev/null 2>&1"
}

read_env_value() {
  local file="$1"
  local key="$2"

  "${PYTHON_BIN}" - "${file}" "${key}" <<'PY'
import sys
from pathlib import Path


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


path = Path(sys.argv[1])
key = sys.argv[2]
if not path.is_file():
    raise SystemExit(1)
for raw_line in path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith("export "):
        line = line[7:]
    if "=" not in line:
        continue
    current_key, value = line.split("=", 1)
    if current_key.strip() == key:
        print(parse_env_value(value))
        raise SystemExit(0)
raise SystemExit(1)
PY
}

export_if_set() {
  local name="$1"
  if [[ -n ${!name+x} ]]; then
    export "$name=${!name}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote-host)
      REMOTE_HOST="${2:-}"
      shift 2
      ;;
    --remote-user)
      REMOTE_USER="${2:-}"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="${2:-}"
      shift 2
      ;;
    --public-host)
      PUBLIC_HOST="${2:-}"
      shift 2
      ;;
    --https-port)
      HTTPS_PORT="${2:-}"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="${2:-}"
      shift 2
      ;;
    --postgres-password)
      POSTGRES_PASSWORD="${2:-}"
      shift 2
      ;;
    --jwt-secret)
      CASESYSTEM_JWT_SECRET_KEY="${2:-}"
      shift 2
      ;;
    --smtp-password)
      CASESYSTEM_SMTP_PASSWORD="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "${REMOTE_HOST}" ]]; then
  die "REMOTE_HOST is required. Provide --remote-host or set the REMOTE_HOST environment variable."
fi

if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="${REMOTE_HOST}"
fi

if [[ ! "${HTTPS_PORT}" =~ ^[0-9]+$ ]] || (( HTTPS_PORT < 1 || HTTPS_PORT > 65535 )); then
  die "HTTPS_PORT must be a valid TCP port number: ${HTTPS_PORT}"
fi

if [[ ! "${SSH_PORT}" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
  die "SSH_PORT must be a valid TCP port number: ${SSH_PORT}"
fi

if ! is_valid_host_token "${REMOTE_HOST}"; then
  die "REMOTE_HOST must be a hostname or IPv4 address without scheme or port: ${REMOTE_HOST}"
fi

if ! is_valid_host_token "${PUBLIC_HOST}"; then
  die "PUBLIC_HOST must be a hostname or IPv4 address without scheme or port: ${PUBLIC_HOST}"
fi

if [[ ! -f "${ENV_TEMPLATE}" ]]; then
  die "Missing environment template: ${ENV_TEMPLATE}"
fi

require_cmd rsync
require_cmd ssh
require_cmd openssl
require_cmd "${PYTHON_BIN}"

RSYNC_SSH="ssh -p ${SSH_PORT} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
SSH_BASE=(ssh -p "${SSH_PORT}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
REMOTE_TARGET="${SSH_TARGET}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(printf '%s' "$(basename "${REMOTE_DIR}")" | tr '[:upper:]' '[:lower:]')}"
REMOTE_STATE_FILE="${REMOTE_DIR}/${STATE_FILE_NAME}"
REMOTE_POSTGRES_VOLUME="${COMPOSE_PROJECT_NAME}_postgres-data"

mkdir -p "${BACKUP_ROOT}"

for name in \
  POSTGRES_USER \
  POSTGRES_DB \
  CASESYSTEM_ENVIRONMENT \
  CASESYSTEM_REPORT_STORAGE_DIR \
  CASESYSTEM_CELERY_EVENT_SWEEP_INTERVAL_SECONDS \
  CASESYSTEM_TICKET_CACHE_TTL_SECONDS \
  CASESYSTEM_SQLITE_SOURCE_PATH \
  CASESYSTEM_SMTP_HOST \
  CASESYSTEM_SMTP_PORT \
  CASESYSTEM_SMTP_USERNAME \
  CASESYSTEM_SMTP_FROM_EMAIL \
  CASESYSTEM_SMTP_USE_SSL \
  CASESYSTEM_SMTP_STARTTLS \
  POSTGRES_PASSWORD \
  CASESYSTEM_JWT_SECRET_KEY \
  CASESYSTEM_SMTP_PASSWORD
do
  export_if_set "${name}"
done

ENV_BACKUP_PATH="$(backup_file "${ENV_FILE_PATH}" ".env.docker" || true)"
if [[ -n "${ENV_BACKUP_PATH}" ]]; then
  log "Backed up existing env file: ${ENV_BACKUP_PATH}"
fi

STATE_BACKUP_PATH="$(backup_file "${STATE_FILE_PATH}" "deploy-secrets.env" || true)"
if [[ -n "${STATE_BACKUP_PATH}" ]]; then
  log "Backed up existing deploy secrets file: ${STATE_BACKUP_PATH}"
fi

log "Fetching remote deployment state if present"
if sync_remote_file_to_local_if_exists "${REMOTE_STATE_FILE}" "${STATE_FILE_PATH}"; then
  log "Fetched remote deploy secrets: ${REMOTE_STATE_FILE}"
fi
if sync_remote_file_to_local_if_exists "${REMOTE_DIR}/${ENV_FILE_NAME}" "${ENV_FILE_PATH}"; then
  log "Fetched remote env file: ${REMOTE_DIR}/${ENV_FILE_NAME}"
fi

if [[ ! -f "${STATE_FILE_PATH}" ]]; then
  existing_postgres_password="$(read_env_value "${ENV_FILE_PATH}" "POSTGRES_PASSWORD" || true)"
  if [[ -n "${existing_postgres_password}" && "${existing_postgres_password}" != "change-me-db-password" ]]; then
    :
  elif remote_volume_exists "${REMOTE_POSTGRES_VOLUME}"; then
    die "Existing PostgreSQL volume detected on the remote host but no deploy secrets file is available. Refusing to auto-generate a new POSTGRES_PASSWORD because that would break the current database. Restore ${STATE_FILE_NAME} or supply the original password before redeploying."
  fi
fi

log "Rendering deployment env file"
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/render_docker_env.py" \
  --template "${ENV_TEMPLATE}" \
  --existing "${ENV_FILE_PATH}" \
  --state "${STATE_FILE_PATH}" \
  --output "${ENV_FILE_PATH}" \
  --https-port "${HTTPS_PORT}" \
  --public-origin "$(public_origin)"
log "Wrote deployment env file: ${ENV_FILE_PATH}"

CERT_CN="${PUBLIC_HOST}"
declare -a CERT_DNS=()
declare -a CERT_IPS=()

if is_ipv4_literal "${PUBLIC_HOST}"; then
  CERT_IPS+=("${PUBLIC_HOST}")
else
  CERT_DNS+=("${PUBLIC_HOST}")
fi

if [[ "${REMOTE_HOST}" != "${PUBLIC_HOST}" ]]; then
  if is_ipv4_literal "${REMOTE_HOST}"; then
    CERT_IPS+=("${REMOTE_HOST}")
  else
    CERT_DNS+=("${REMOTE_HOST}")
  fi
fi

CERT_DNS+=("localhost")
CERT_IPS+=("127.0.0.1")

CERT_BACKUP_CRT="$(backup_file "${CERT_DIR}/server.crt" "server.crt" || true)"
CERT_BACKUP_KEY="$(backup_file "${CERT_DIR}/server.key" "server.key" || true)"
if [[ -n "${CERT_BACKUP_CRT}" || -n "${CERT_BACKUP_KEY}" ]]; then
  log "Backed up existing certificate files:"
  [[ -n "${CERT_BACKUP_CRT}" ]] && log "  ${CERT_BACKUP_CRT}"
  [[ -n "${CERT_BACKUP_KEY}" ]] && log "  ${CERT_BACKUP_KEY}"
fi

log "Generating self-signed certificate"
cert_args=(
  --cert-dir "${CERT_DIR}"
  --cn "${CERT_CN}"
)
for dns in "${CERT_DNS[@]}"; do
  cert_args+=(--dns "${dns}")
done
for ip in "${CERT_IPS[@]}"; do
  cert_args+=(--ip "${ip}")
done
"${ROOT_DIR}/scripts/gen_self_signed_cert.sh" "${cert_args[@]}"

log "Ensuring remote directories exist"
"${SSH_BASE[@]}" "${SSH_TARGET}" "REMOTE_DIR=$(shell_quote "${REMOTE_DIR}") bash -s" <<'EOF'
set -euo pipefail
mkdir -p "${REMOTE_DIR}/.runtime" "${REMOTE_DIR}/deploy/nginx/certs"
EOF

log "Syncing project to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  -e "${RSYNC_SSH}" \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude '.npm-cache' \
  --exclude '.runtime' \
  --exclude 'backend/.runtime' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '*.db' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude '.DS_Store' \
  --exclude '.env.docker' \
  --exclude 'deploy/nginx/certs/' \
  "${ROOT_DIR}/" "${REMOTE_TARGET}:${REMOTE_DIR}/"

log "Syncing nginx config"
sync_path_to_remote "${NGINX_CONF_PATH}" "${REMOTE_DIR}/deploy/nginx/"

log "Syncing generated env file"
sync_path_to_remote "${ENV_FILE_PATH}" "${REMOTE_DIR}/"

if [[ -f "${STATE_FILE_PATH}" ]]; then
  log "Syncing deploy secrets state"
  sync_path_to_remote "${STATE_FILE_PATH}" "${REMOTE_DIR}/.runtime/"
fi

log "Syncing generated certificates"
rsync -az --delete -e "${RSYNC_SSH}" "${CERT_DIR}/" "${REMOTE_TARGET}:${REMOTE_DIR}/deploy/nginx/certs/"

log "Running remote deployment"
"${SSH_BASE[@]}" "${SSH_TARGET}" "cd $(shell_quote "${REMOTE_DIR}") && REMOTE_DIR=$(shell_quote "${REMOTE_DIR}") ENV_FILE=$(shell_quote "${ENV_FILE_NAME}") HTTPS_PORT=$(shell_quote "${HTTPS_PORT}") bash scripts/deploy_tls_remote.sh"

log "Docker TLS deployment finished"
echo "External URL: $(public_origin)"
echo "Env file: ${ENV_FILE_PATH}"
echo "Certificate directory: ${CERT_DIR}"
echo "Restarted services: api, worker, beat, nginx"
if [[ -n "${ENV_BACKUP_PATH}" ]]; then
  echo "Env backup: ${ENV_BACKUP_PATH}"
fi
if [[ -n "${CERT_BACKUP_CRT}" || -n "${CERT_BACKUP_KEY}" ]]; then
  echo "Certificate backups:"
  [[ -n "${CERT_BACKUP_CRT}" ]] && echo "  ${CERT_BACKUP_CRT}"
  [[ -n "${CERT_BACKUP_KEY}" ]] && echo "  ${CERT_BACKUP_KEY}"
fi
