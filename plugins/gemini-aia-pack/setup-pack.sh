#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p .cursor/rules

if command -v npm >/dev/null 2>&1; then
  npm install @google/genai js-yaml --no-fund --no-audit || true
else
  echo "npm not found; skipping optional deps (fetch dry-run still works)"
fi

if [ -f "./doctor.mjs" ]; then
  node ./doctor.mjs
else
  echo "doctor.mjs not found in current directory; place pack files here and re-run."
  exit 1
fi
