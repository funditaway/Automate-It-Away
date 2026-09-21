#!/usr/bin/env bash
# start.sh — Bootstrap Ed25519 keys and launch the AIA local runtime.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

KEY_DIR="$ROOT/.keys"
PRIV="$KEY_DIR/private_key.pem"
PUB="$KEY_DIR/public_key.pem"
LEGACY_PRIV="$KEY_DIR/ed25519.pem"
LEGACY_PUB="$KEY_DIR/ed25519.pub.pem"
DATA_DIR="$ROOT/data"

mkdir -p "$KEY_DIR" "$DATA_DIR"
chmod 700 "$KEY_DIR" 2>/dev/null || true

ensure_keys() {
  if [[ -f "$PRIV" && -f "$PUB" ]]; then
    echo "[start] Ed25519 keys OK: private_key.pem / public_key.pem"
    return
  fi
  if [[ -f "$LEGACY_PRIV" && -f "$LEGACY_PUB" ]]; then
    echo "[start] using legacy ed25519.pem / ed25519.pub.pem"
    return
  fi
  echo "[start] generating fresh Ed25519 keypair → .keys/private_key.pem + public_key.pem"
  node --input-type=module <<'NODE'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const keyDir = join(process.cwd(), '.keys')
mkdirSync(keyDir, { recursive: true, mode: 0o700 })
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
writeFileSync(
  join(keyDir, 'public_key.pem'),
  publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  { mode: 0o600 },
)
writeFileSync(
  join(keyDir, 'private_key.pem'),
  privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  { mode: 0o600 },
)
console.log('[start] keys written')
NODE
}

if [[ ! -d node_modules ]]; then
  echo "[start] npm install…"
  npm install
fi

ensure_keys

echo "[start] running doctor…"
node doctor.js || {
  echo "[start] doctor reported issues — continuing if only warnings"
}

PORT="${AIA_RUNTIME_PORT:-3847}"
echo "[start] launching runtime on 127.0.0.1:${PORT}"
if [[ -f dist/server.js ]]; then
  exec node dist/server.js
else
  exec npx --yes tsx src/server.ts
fi
