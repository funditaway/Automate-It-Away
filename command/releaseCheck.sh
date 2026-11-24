#!/usr/bin/env bash
# Unified pre-flight / release gate for the HITL command center.
# Fail-fast: missing runtime, broken ledger/signatures, or failed dry-runs abort.
#
#   ./releaseCheck.sh
#   ./releaseCheck.sh --strict-keyring
#   ./releaseCheck.sh --quick   # skip smoke (doctor/replay/integrity/dry-runs only)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DATA_DIR="${AIA_DATA_DIR:-$DIR/data}"
KEY_DIR="${AIA_KEY_DIR:-$DATA_DIR/.keys}"
KEYRING_PATH="${AIA_KEYRING_PATH:-$KEY_DIR/keyring.json}"
LEDGER_PATH="${AIA_LEDGER_PATH:-$DATA_DIR/ledger.ndjson}"
STRICT_KEYRING=0
QUICK=0

for arg in "$@"; do
  case "$arg" in
    --strict-keyring) STRICT_KEYRING=1 ;;
    --quick) QUICK=1 ;;
    -h|--help)
      cat >&2 <<'EOF'
Usage: ./releaseCheck.sh [--strict-keyring] [--quick]

  --strict-keyring  Fail if data/.keys/keyring.json is missing
  --quick           Skip smoke.sh (still runs doctor, replay, integrity, dry-runs)
EOF
      exit 0
      ;;
  esac
done

echo "[AIA ReleaseCheck] Starting pre-flight checks in $DIR..."

# 1. Verify Node.js runtime
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not in PATH" >&2
  exit 1
fi
echo "[1/7] Node runtime OK: $(node -v)"

# 2. Verify core entrypoints and ops helpers exist
for core_file in \
  "server.js" \
  "webhookIngest.js" \
  "verifyLedger.js" \
  "doctor.js" \
  "verifyAllIntegrity.js" \
  "maintain.sh" \
  "installService.sh" \
  "smoke.sh"; do
  if [ ! -f "$DIR/$core_file" ]; then
    echo "ERROR: Missing required file: $DIR/$core_file" >&2
    exit 1
  fi
done
echo "[2/7] Core entrypoints and ops helpers verified"

# 3. Check keyring presence (strict mode requires an initialized keyring)
if [ -f "$KEYRING_PATH" ]; then
  echo "[3/7] Keyring found: $KEYRING_PATH"
elif [ "$STRICT_KEYRING" -eq 1 ]; then
  echo "ERROR: Required keyring missing at $KEYRING_PATH" >&2
  exit 1
else
  echo "[3/7] Keyring not yet initialized at $KEYRING_PATH (continuing)"
fi

if [ ! -d node_modules/express ]; then
  echo "Installing express (daemon dependency)…"
  npm install --omit=dev
fi

# 4. Environment diagnostics + pack replay
echo "[4/7] Running environment diagnostics and pack replay..."
node "$DIR/doctor.js"
node "$DIR/replayPacks.js" >/dev/null

# 5. Cryptographic & state integrity (prefer the unified gate)
echo "[5/7] Running cryptographic integrity verification..."
if [ -f "$DIR/verifyAllIntegrity.js" ]; then
  AIA_DATA_DIR="$DATA_DIR" AIA_KEY_DIR="$KEY_DIR" \
    AIA_LEDGER_PATH="$LEDGER_PATH" node "$DIR/verifyAllIntegrity.js" >/dev/null
else
  echo "verifyAllIntegrity.js missing; falling back to verifyLedger.js"
  if [ -f "$LEDGER_PATH" ] || [ -d "$DATA_DIR" ]; then
    node "$DIR/verifyLedger.js" "$LEDGER_PATH"
  else
    echo "No ledger at $LEDGER_PATH yet (empty state OK)"
  fi
fi

# 6. Preview maintenance and service unit rendering in dry-run mode
echo "[6/7] Dry-run housekeeping and service unit templates..."
bash "$DIR/maintain.sh" --dry-run --skip-verify >/dev/null
bash "$DIR/installService.sh" --dry-run >/dev/null
bash "$DIR/installService.sh" --ingest --dry-run >/dev/null
echo "[6/7] Dry-run housekeeping and service unit templates OK"

# 7. Full smoke (doctor + contract tests) unless --quick
if [ "$QUICK" -eq 1 ]; then
  echo "[7/7] Skipping smoke.sh (--quick)"
else
  echo "[7/7] Running end-to-end smoke test..."
  "$DIR/smoke.sh" >/dev/null
fi

echo "[AIA ReleaseCheck] PASSED"
