#!/bin/sh
set -eu

. /app/docker/runtime-env.sh

exec celery -A app.worker.celery_app.celery_app beat --loglevel "${CELERY_LOGLEVEL:-INFO}"
