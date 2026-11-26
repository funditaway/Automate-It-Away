#!/usr/bin/env bash
# Routine housekeeping for the HITL command center.
# - Removes stale *.tmp staging files (atomic-write leftovers)
# - Trims oversized operational *.log files (never ledger/keys/queue)
# - Re-applies 0700/0600 on sensitive state directories and files
# - Runs verifyAllIntegrity.js when available
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DATA_DIR="${AIA_DATA_DIR:-$DIR/data}"
KEY_DIR="${AIA_KEY_DIR:-$DATA_DIR/.keys}"
LOG_DIR="${AIA_LOG_DIR:-$DIR/logs}"
BACKUP_DIR="${AIA_BACKUP_DIR:-$DIR/backups}"
TMP_MAX_AGE_MIN="${AIA_TMP_MAX_AGE_MIN:-60}"
LOG_MAX_LINES="${AIA_LOG_MAX_LINES:-5000}"
LOG_MAX_BYTES="${AIA_LOG_MAX_BYTES:-}"
LOG_KEEP="${AIA_LOG_KEEP:-7}"
DRY_RUN=0
SKIP_VERIFY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-verify) SKIP_VERIFY=1 ;;
  esac
done

echo "[AIA Maintain] Starting housekeeping (dry_run=$DRY_RUN, tmpAgeMin=$TMP_MAX_AGE_MIN, logMaxLines=$LOG_MAX_LINES)..."

# 1. Clean stale temporary files (*.tmp) older than TMP_MAX_AGE_MIN
for target_dir in "$DATA_DIR" "$BACKUP_DIR" "$KEY_DIR" "$DIR"; do
  if [ -d "$target_dir" ]; then
    while IFS= read -r -d '' tmp_file; do
      case "$tmp_file" in
        */ledger.ndjson*|*/keyring.json*|*/ed25519*.pem*)
          continue
          ;;
      esac
      if [ "$DRY_RUN" -eq 1 ]; then
        echo "[DRY-RUN] Would remove stale temp file: $tmp_file"
      else
        rm -f "$tmp_file"
        echo "Removed stale temp file: $tmp_file"
      fi
    done < <(find "$target_dir" -maxdepth 3 -name '*.tmp' -type f -mmin +"$TMP_MAX_AGE_MIN" -print0 2>/dev/null || true)
  fi
done

# 2. Trim oversized *.log files under LOG_DIR (and legacy data/*.log)
trim_log_by_lines() {
  local log_file="$1"
  local line_count
  line_count="$(wc -l < "$log_file" 2>/dev/null | tr -d '[:space:]' || echo 0)"
  if [ "${line_count:-0}" -gt "$LOG_MAX_LINES" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[DRY-RUN] Would trim $log_file from $line_count to last $LOG_MAX_LINES lines"
    else
      local tmp_log="${log_file}.$$.trim.tmp"
      tail -n "$LOG_MAX_LINES" "$log_file" > "$tmp_log"
      chmod 600 "$tmp_log" 2>/dev/null || true
      mv "$tmp_log" "$log_file"
      echo "Trimmed $log_file ($line_count -> $LOG_MAX_LINES lines)"
    fi
  fi
}

rotate_log_by_bytes() {
  local log_file="$1"
  local size_bytes stamp archive_name
  size_bytes="$(wc -c < "$log_file" 2>/dev/null | tr -d '[:space:]' || echo 0)"
  if [ -n "$LOG_MAX_BYTES" ] && [ "${size_bytes:-0}" -gt "$LOG_MAX_BYTES" ]; then
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    archive_name="${log_file}.${stamp}.gz"
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[DRY-RUN] Would rotate log ($size_bytes bytes): $log_file -> $archive_name"
    else
      gzip -c "$log_file" > "$archive_name"
      chmod 600 "$archive_name"
      : > "$log_file"
      chmod 600 "$log_file"
      echo "Rotated log ($size_bytes bytes): $log_file -> $archive_name"
    fi
  fi
}

for search_dir in "$LOG_DIR" "$DATA_DIR"; do
  if [ -d "$search_dir" ]; then
    while IFS= read -r -d '' log_file; do
      trim_log_by_lines "$log_file"
      if [ -n "$LOG_MAX_BYTES" ]; then
        rotate_log_by_bytes "$log_file"
      fi
    done < <(find "$search_dir" -maxdepth 2 -name '*.log' -type f -print0 2>/dev/null || true)
  fi
done

# Optional prune of gzipped log archives when byte rotation is enabled
if [ -n "$LOG_MAX_BYTES" ]; then
  for base_log in "$LOG_DIR"/*.log "$DATA_DIR"/*.log; do
    [ -e "$base_log" ] || continue
    count=0
    while IFS= read -r old_gz; do
      count=$((count + 1))
      if [ "$count" -gt "$LOG_KEEP" ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
          echo "[DRY-RUN] Would prune old log archive: $old_gz"
        else
          rm -f "$old_gz"
          echo "Pruned old log archive: $old_gz"
        fi
      fi
    done < <(ls -1t "${base_log}".*.gz 2>/dev/null || true)
  done
fi

# 3. Enforce strict POSIX permissions on sensitive state (skip Windows shells)
OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*)
    echo "[AIA Maintain] Skipping chmod on $OS_NAME"
    ;;
  *)
    if [ "$DRY_RUN" -eq 0 ]; then
      if [ -d "$DATA_DIR" ]; then
        chmod 700 "$DATA_DIR" 2>/dev/null || true
      fi
      if [ -d "$KEY_DIR" ]; then
        chmod 700 "$KEY_DIR" 2>/dev/null || true
      fi
      if [ -d "$BACKUP_DIR" ]; then
        chmod 700 "$BACKUP_DIR" 2>/dev/null || true
      fi
      if [ -d "$LOG_DIR" ]; then
        chmod 700 "$LOG_DIR" 2>/dev/null || true
      fi

      for sensitive in \
        "$KEY_DIR/ed25519.pem" \
        "$KEY_DIR/ed25519.pub.pem" \
        "$KEY_DIR/keyring.json" \
        "$DATA_DIR/active_queue.json" \
        "$DATA_DIR/ledger.ndjson" \
        "$DATA_DIR/ledger.anchor.json" \
        "$DATA_DIR/spool.ndjson" \
        "$DATA_DIR/spool.deadletter.ndjson" \
        "$DIR/.env"; do
        if [ -f "$sensitive" ]; then
          chmod 600 "$sensitive" 2>/dev/null || true
        fi
      done

      # Retired key copies and backup archives
      if [ -d "$KEY_DIR" ]; then
        find "$KEY_DIR" -maxdepth 1 -type f \( -name '*.retired-*' -o -name 'ed25519*.pem' \) \
          -exec chmod 600 {} \; 2>/dev/null || true
      fi
      if [ -d "$BACKUP_DIR" ]; then
        find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'aia-state-*.tar.gz*' -o -name 'pre-restore-*.tar.gz' \) \
          -exec chmod 600 {} \; 2>/dev/null || true
      fi
    else
      echo "[DRY-RUN] Would re-apply 0700/0600 on data, keys, backups, and sensitive state files"
    fi
    ;;
esac

# 4. Non-destructive integrity verification
if [ "$DRY_RUN" -eq 0 ] && [ "$SKIP_VERIFY" -eq 0 ] && [ -f "$DIR/verifyAllIntegrity.js" ]; then
  echo "[AIA Maintain] Verifying ledger and state integrity..."
  AIA_DATA_DIR="$DATA_DIR" AIA_KEY_DIR="$KEY_DIR" node "$DIR/verifyAllIntegrity.js"
fi

echo "[AIA Maintain] Done. ledger.ndjson and keyring content left untouched."
