#!/usr/bin/env bash
# One-command boot for the AIA sovereign command center.
# Installs the Express daemon dependency if needed, runs doctor, then
# starts the signing router on 127.0.0.1:3000 (PM2 when it is installed).
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required (20+)" >&2
  exit 1
fi

if [ ! -d node_modules/express ]; then
  echo "Installing express (daemon dependency)…"
  npm install --omit=dev
fi

node doctor.js

HOST="${AIA_BIND:-127.0.0.1}"
PORT="${AIA_PORT:-3000}"

if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs --update-env
  echo "AIA command center supervised by PM2 at http://${HOST}:${PORT}"
else
  echo "PM2 not installed — starting node directly at http://${HOST}:${PORT}"
  exec node server.js
fi
