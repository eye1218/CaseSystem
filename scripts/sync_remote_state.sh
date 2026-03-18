#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-192.168.2.90}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/workspace/CaseSystem}"

echo "==> Syncing remote DB/.env/config from ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"

rsync -az --prune-empty-dirs \
  --include='*/' \
  --include='.env*' \
  --include='*.db' \
  --include='*.db-wal' \
  --include='*.db-shm' \
  --include='deploy/***' \
  --exclude='.git/***' \
  --exclude='.venv/***' \
  --exclude='frontend/node_modules/***' \
  --exclude='.npm-cache/***' \
  --exclude='.runtime/***' \
  --exclude='backend/.runtime/***' \
  --exclude='.pytest_cache/***' \
  --exclude='.ruff_cache/***' \
  --exclude='__pycache__/***' \
  --exclude='*' \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/" "${ROOT_DIR}/"

echo "==> Remote state sync complete"
