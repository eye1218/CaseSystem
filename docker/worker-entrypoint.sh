#!/bin/sh
set -eu

. /app/docker/runtime-env.sh

exec celery -A app.worker.celery_app.celery_app worker --loglevel "${CELERY_LOGLEVEL:-INFO}" --pool=solo
