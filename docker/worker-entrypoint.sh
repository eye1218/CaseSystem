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

exec celery --workdir "${APP_DIR}" -A app.worker.celery_app.celery_app worker --loglevel "${CELERY_LOGLEVEL:-INFO}" --pool=solo
