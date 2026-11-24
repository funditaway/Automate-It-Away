#!/usr/bin/env bash
# Verified restore companion for backup.sh cold state bundles.
# Validates adjacent .sha256, supports --dry-run listing, snapshots any
# existing data/ before replace, and runs verifyAllIntegrity.js after unpack.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DATA_DIR="${AIA_DATA_DIR:-$DIR/data}"
PACKS_DIR="${AIA_PACKS_DIR:-$DIR/../packs}"
BACKUP_DIR="${AIA_BACKUP_DIR:-$DIR/backups}"

DRY_RUN=0
SKIP_VERIFY=0
ARCHIVE_PATH=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--skip-verify] <path-to-aia-state.tar.gz>" >&2
      exit 0
      ;;
    *)
      if [ -z "$ARCHIVE_PATH" ]; then
        ARCHIVE_PATH="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "$ARCHIVE_PATH" ]; then
  echo "Usage: $0 [--dry-run] [--skip-verify] <path-to-aia-state.tar.gz>" >&2
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Archive not found: $ARCHIVE_PATH" >&2
  exit 1
fi

case "$ARCHIVE_PATH" in
  *.age|*.gpg)
    echo "Encrypted archives must be decrypted to .tar.gz before restore (age/gpg)." >&2
    exit 1
    ;;
esac

SHA_PATH="$ARCHIVE_PATH.sha256"
if [ -f "$SHA_PATH" ]; then
  EXPECTED_HASH="$(awk '{print $1}' "$SHA_PATH")"
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_HASH="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_HASH="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
  else
    ACTUAL_HASH=""
  fi

  if [ -n "$EXPECTED_HASH" ] && [ -n "$ACTUAL_HASH" ] && [ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]; then
    echo "Checksum verification failed for $ARCHIVE_PATH" >&2
    exit 1
  fi
  if [ -n "$EXPECTED_HASH" ] && [ -n "$ACTUAL_HASH" ]; then
    echo "Checksum verified: $SHA_PATH"
  else
    echo "Checksum file present but hash tools unavailable; continuing cautiously" >&2
  fi
else
  echo "No sidecar checksum at $SHA_PATH (continuing without hash verify)" >&2
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[DRY-RUN] Archive contents:"
  tar -tzf "$ARCHIVE_PATH"
  exit 0
fi

if [ -d "$DATA_DIR" ] && [ "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR" 2>/dev/null || true
  PRE_RESTORE="$BACKUP_DIR/pre-restore-$(date -u +"%Y%m%dT%H%M%SZ").tar.gz"
  tar -czf "$PRE_RESTORE" -C "$DATA_DIR" .
  chmod 600 "$PRE_RESTORE"
  echo "Saved pre-restore data snapshot: $PRE_RESTORE"
fi

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aia-restore.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

tar -xzf "$ARCHIVE_PATH" -C "$STAGE_DIR"

if [ -d "$STAGE_DIR/data" ]; then
  mkdir -p "$DATA_DIR"
  chmod 700 "$DATA_DIR" 2>/dev/null || true
  cp -a "$STAGE_DIR/data/." "$DATA_DIR/" 2>/dev/null || cp -Rp "$STAGE_DIR/data/." "$DATA_DIR/"
fi

if [ -d "$STAGE_DIR/packs" ]; then
  mkdir -p "$PACKS_DIR"
  cp -a "$STAGE_DIR/packs/." "$PACKS_DIR/" 2>/dev/null || cp -Rp "$STAGE_DIR/packs/." "$PACKS_DIR/"
fi

if [ -f "$STAGE_DIR/.env" ] && [ ! -f "$DIR/.env" ]; then
  cp -p "$STAGE_DIR/.env" "$DIR/.env"
  chmod 600 "$DIR/.env" 2>/dev/null || true
  echo "Restored .env (was missing)"
fi

if [ -f "$STAGE_DIR/ecosystem.config.cjs" ] && [ ! -f "$DIR/ecosystem.config.cjs" ]; then
  cp -p "$STAGE_DIR/ecosystem.config.cjs" "$DIR/ecosystem.config.cjs"
fi

if [ "$SKIP_VERIFY" -eq 0 ] && [ -f "$DIR/verifyAllIntegrity.js" ]; then
  echo "Running post-restore integrity check..."
  AIA_DATA_DIR="$DATA_DIR" node "$DIR/verifyAllIntegrity.js"
fi

echo "Restore complete from $ARCHIVE_PATH"
