#!/usr/bin/env bash
# Cold backup of sovereign identity + append-only ledger.
# Stages keys and ledger.ndjson into backups/ (plain .tar.gz by default).
# Pass --plain (default) or omit encryption tools; use age/gpg when available
# and AIA_AGE_RECIPIENT / interactive gpg when you want encrypted archives.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DATA_DIR="${AIA_DATA_DIR:-$DIR/data}"
BACKUP_DIR="${AIA_BACKUP_DIR:-$DIR/backups}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
PLAIN_MODE=0

for arg in "$@"; do
  case "$arg" in
    --plain) PLAIN_MODE=1 ;;
  esac
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aia-cmd-bundle-XXXXXX")"
cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR/bundle/data/.keys"

if [ -f "$DATA_DIR/ledger.ndjson" ]; then
  cp -p "$DATA_DIR/ledger.ndjson" "$STAGE_DIR/bundle/data/ledger.ndjson"
fi

if [ -f "$DATA_DIR/ledger.anchor.json" ]; then
  cp -p "$DATA_DIR/ledger.anchor.json" "$STAGE_DIR/bundle/data/ledger.anchor.json"
fi

if [ -d "$DATA_DIR/ledger-archives" ]; then
  mkdir -p "$STAGE_DIR/bundle/data/ledger-archives"
  find "$DATA_DIR/ledger-archives" -maxdepth 1 -type f \( -name '*.ndjson' -o -name '*.meta.json' \) \
    -exec cp -p {} "$STAGE_DIR/bundle/data/ledger-archives/" \;
fi

if [ -d "$DATA_DIR/.keys" ]; then
  find "$DATA_DIR/.keys" -maxdepth 1 -type f \( -name 'ed25519*.pem' -o -name 'keyring.json' -o -name '*.retired-*' \) \
    -exec cp -p {} "$STAGE_DIR/bundle/data/.keys/" \;
fi

for cfg in ecosystem.config.cjs .env; do
  if [ -f "$DIR/$cfg" ]; then
    cp -p "$DIR/$cfg" "$STAGE_DIR/bundle/$cfg"
  fi
done

TAR_PATH="$STAGE_DIR/aia-command-${STAMP}.tar.gz"
tar -czf "$TAR_PATH" -C "$STAGE_DIR" bundle
tar -tzf "$TAR_PATH" >/dev/null

FINAL_PATH=""
if [ "$PLAIN_MODE" -eq 0 ] && command -v age >/dev/null 2>&1 && [ -n "${AIA_AGE_RECIPIENT:-}" ]; then
  FINAL_PATH="$BACKUP_DIR/aia-command-${STAMP}.tar.gz.age"
  age -r "$AIA_AGE_RECIPIENT" -o "$FINAL_PATH" "$TAR_PATH"
elif [ "$PLAIN_MODE" -eq 0 ] && command -v gpg >/dev/null 2>&1 && [ -n "${AIA_GPG_ENCRYPT:-}" ]; then
  FINAL_PATH="$BACKUP_DIR/aia-command-${STAMP}.tar.gz.gpg"
  gpg --batch --yes -c --cipher-algo AES256 -o "$FINAL_PATH" "$TAR_PATH"
else
  FINAL_PATH="$BACKUP_DIR/aia-command-${STAMP}.tar.gz"
  cp -p "$TAR_PATH" "$FINAL_PATH"
fi

chmod 600 "$FINAL_PATH"
if command -v sha256sum >/dev/null 2>&1; then
  SHA256_SUM="$(sha256sum "$FINAL_PATH" | awk '{print $1}')"
else
  SHA256_SUM="$(shasum -a 256 "$FINAL_PATH" | awk '{print $1}')"
fi

echo "Bundle created: $FINAL_PATH"
echo "SHA-256: $SHA256_SUM"
