#!/usr/bin/env bash
# Pre-release gate: diagnostics, pack replay, ledger audit, smoke tests.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -d node_modules/express ]; then
  echo "Installing express (daemon dependency)…"
  npm install --omit=dev
fi

echo "[1/4] Running environment diagnostics..."
node "$DIR/doctor.js"

echo "[2/4] Replaying pack registry in sandbox..."
node "$DIR/replayPacks.js" >/dev/null

echo "[3/4] Auditing ledger chain and signatures..."
node "$DIR/verifyLedger.js"

echo "[4/4] Running end-to-end smoke test..."
"$DIR/smoke.sh" >/dev/null

echo "[RELEASE-CHECK] All checks passed."
