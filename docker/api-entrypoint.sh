#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "${SCRIPT_DIR}/runtime-env.sh"

SOURCE_ROOT="${CASESYSTEM_SOURCE_ROOT:-/workspace}"
APP_DIR="${CASESYSTEM_APP_DIR:-${SOURCE_ROOT}/backend}"

if [ ! -d "${APP_DIR}" ]; then
  APP_DIR="/app/backend"
fi

export PYTHONPATH="${APP_DIR}${PYTHONPATH:+:${PYTHONPATH}}"

exec uvicorn app.main:app --host 0.0.0.0 --port 8010 --app-dir "${APP_DIR}"
