#!/usr/bin/env bash
# Cold state bundle: data/, packs/, and .env into a timestamped .tar.gz
# with an adjacent .sha256 checksum (0600). Optional age/gpg encryption when
# AIA_AGE_RECIPIENT / AIA_GPG_ENCRYPT is set (use --plain to force cleartext).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DATA_DIR="${AIA_DATA_DIR:-$DIR/data}"
PACKS_DIR="${AIA_PACKS_DIR:-$DIR/../packs}"
BACKUP_DIR="${AIA_BACKUP_DIR:-$DIR/backups}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
PLAIN_MODE=0

for arg in "$@"; do
  case "$arg" in
    --plain) PLAIN_MODE=1 ;;
  esac
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aia-backup.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

if [ -d "$DATA_DIR" ]; then
  mkdir -p "$STAGE_DIR/data"
  # Copy sovereign state (keys, ledger, spool, queue, archives) without following symlinks out of tree.
  cp -a "$DATA_DIR/." "$STAGE_DIR/data/" 2>/dev/null || cp -Rp "$DATA_DIR/." "$STAGE_DIR/data/"
fi

if [ -d "$PACKS_DIR" ]; then
  mkdir -p "$STAGE_DIR/packs"
  cp -a "$PACKS_DIR/." "$STAGE_DIR/packs/" 2>/dev/null || cp -Rp "$PACKS_DIR/." "$STAGE_DIR/packs/"
fi

if [ -f "$DIR/.env" ]; then
  cp -p "$DIR/.env" "$STAGE_DIR/.env"
fi

if [ -f "$DIR/ecosystem.config.cjs" ]; then
  cp -p "$DIR/ecosystem.config.cjs" "$STAGE_DIR/ecosystem.config.cjs"
fi

TAR_PATH="$STAGE_DIR/aia-state-${STAMP}.tar.gz"
TAR_ARGS=()
[ -d "$STAGE_DIR/data" ] && TAR_ARGS+=(data)
[ -d "$STAGE_DIR/packs" ] && TAR_ARGS+=(packs)
[ -f "$STAGE_DIR/.env" ] && TAR_ARGS+=(.env)
[ -f "$STAGE_DIR/ecosystem.config.cjs" ] && TAR_ARGS+=(ecosystem.config.cjs)

if [ "${#TAR_ARGS[@]}" -eq 0 ]; then
  echo "Nothing to back up (no data/, packs/, or .env found)" >&2
  exit 1
fi

tar -czf "$TAR_PATH" -C "$STAGE_DIR" "${TAR_ARGS[@]}"
tar -tzf "$TAR_PATH" >/dev/null

FINAL_PATH=""
if [ "$PLAIN_MODE" -eq 0 ] && command -v age >/dev/null 2>&1 && [ -n "${AIA_AGE_RECIPIENT:-}" ]; then
  FINAL_PATH="$BACKUP_DIR/aia-state-${STAMP}.tar.gz.age"
  age -r "$AIA_AGE_RECIPIENT" -o "$FINAL_PATH" "$TAR_PATH"
elif [ "$PLAIN_MODE" -eq 0 ] && command -v gpg >/dev/null 2>&1 && [ -n "${AIA_GPG_ENCRYPT:-}" ]; then
  FINAL_PATH="$BACKUP_DIR/aia-state-${STAMP}.tar.gz.gpg"
  gpg --batch --yes -c --cipher-algo AES256 -o "$FINAL_PATH" "$TAR_PATH"
else
  FINAL_PATH="$BACKUP_DIR/aia-state-${STAMP}.tar.gz"
  cp -p "$TAR_PATH" "$FINAL_PATH"
fi

chmod 600 "$FINAL_PATH"

SHA_PATH="$FINAL_PATH.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$(dirname "$FINAL_PATH")" && sha256sum "$(basename "$FINAL_PATH")" > "$(basename "$SHA_PATH")")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$(dirname "$FINAL_PATH")" && shasum -a 256 "$(basename "$FINAL_PATH")" > "$(basename "$SHA_PATH")")
else
  echo "No sha256sum/shasum available; skipping checksum file" >&2
  SHA_PATH=""
fi

if [ -n "$SHA_PATH" ] && [ -f "$SHA_PATH" ]; then
  chmod 600 "$SHA_PATH"
fi

echo "Backup created: $FINAL_PATH"
[ -n "$SHA_PATH" ] && [ -f "$SHA_PATH" ] && echo "Checksum file:  $SHA_PATH"
