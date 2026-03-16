#!/bin/sh
set -eu

DEFAULT_DATABASE_URL='postgresql+psycopg://casesystem:change-me-db-password@postgres:5432/casesystem'

build_database_url() {
  python_bin="${PYTHON_BIN:-}"
  if [ -z "${python_bin}" ]; then
    if command -v python3 >/dev/null 2>&1; then
      python_bin="python3"
    else
      python_bin="python"
    fi
  fi

  "${python_bin}" - <<'PY'
import os
from urllib.parse import quote

user = quote(os.environ.get("POSTGRES_USER", "casesystem"), safe="")
password = quote(os.environ.get("POSTGRES_PASSWORD", "change-me-db-password"), safe="")
database = quote(os.environ.get("POSTGRES_DB", "casesystem"), safe="")
host = os.environ.get("POSTGRES_HOST", "postgres")
port = os.environ.get("POSTGRES_PORT", "5432")

print(f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}")
PY
}

if [ -z "${CASESYSTEM_DATABASE_URL:-}" ] || [ "${CASESYSTEM_DATABASE_URL}" = "${DEFAULT_DATABASE_URL}" ]; then
  export CASESYSTEM_DATABASE_URL="$(build_database_url)"
fi
