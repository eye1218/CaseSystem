#!/bin/sh
set -eu

. /app/docker/runtime-env.sh

exec uvicorn app.main:app --host 0.0.0.0 --port 8010
