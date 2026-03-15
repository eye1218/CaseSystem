#!/bin/sh
set -eu

exec celery -A app.worker.celery_app.celery_app worker --loglevel "${CELERY_LOGLEVEL:-INFO}" --pool=solo
