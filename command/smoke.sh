#!/usr/bin/env bash
# End-to-end smoke: doctor preflight + contract tests.
# Uses the existing node:test suite so live data/ is never mutated.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -d node_modules/express ]; then
  echo "Installing express (daemon dependency)…"
  npm install --omit=dev
fi

node doctor.js
npm test

echo "[AIA-SMOKE] doctor + contract tests passed"
