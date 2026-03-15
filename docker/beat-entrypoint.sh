#!/bin/sh
set -eu

exec celery -A app.worker.celery_app.celery_app beat --loglevel "${CELERY_LOGLEVEL:-INFO}"
