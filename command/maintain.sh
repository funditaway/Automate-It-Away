#!/usr/bin/env bash
# Housekeeping for the command-center data dir.
# Never truncates ledger.ndjson, keys, or active queue state.
# Removes stale *.tmp files and rotates oversized *.log files.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

DATA_DIR="${AIA_DATA_DIR:-$DIR/data}"
TMP_MAX_AGE_MIN="${AIA_TMP_MAX_AGE_MIN:-1440}"
LOG_MAX_BYTES="${AIA_LOG_MAX_BYTES:-10485760}"
LOG_KEEP="${AIA_LOG_KEEP:-7}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

if [ ! -d "$DATA_DIR" ]; then
  echo "[AIA-MAINTAIN] Data directory does not exist yet: $DATA_DIR"
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
echo "[AIA-MAINTAIN] Scanning $DATA_DIR (dryRun=$DRY_RUN, tmpAgeMin=$TMP_MAX_AGE_MIN, logMaxBytes=$LOG_MAX_BYTES)"

while IFS= read -r -d '' tmp_file; do
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [DRY-RUN] Would remove stale temp file: $tmp_file"
  else
    rm -f "$tmp_file"
    echo "  Removed stale temp file: $tmp_file"
  fi
done < <(find "$DATA_DIR" -maxdepth 2 -type f -name '*.tmp' -mmin "+$TMP_MAX_AGE_MIN" -print0 2>/dev/null)

while IFS= read -r -d '' log_file; do
  size_bytes="$(wc -c < "$log_file" 2>/dev/null || echo 0)"
  if [ "$size_bytes" -gt "$LOG_MAX_BYTES" ]; then
    archive_name="${log_file}.${STAMP}.gz"
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  [DRY-RUN] Would rotate log ($size_bytes bytes): $log_file -> $archive_name"
    else
      gzip -c "$log_file" > "$archive_name"
      chmod 600 "$archive_name"
      : > "$log_file"
      chmod 600 "$log_file"
      echo "  Rotated log ($size_bytes bytes): $log_file -> $archive_name"
    fi
  fi
done < <(find "$DATA_DIR" -maxdepth 1 -type f -name '*.log' -print0 2>/dev/null)

for base_log in "$DATA_DIR"/*.log; do
  [ -e "$base_log" ] || continue
  count=0
  while IFS= read -r old_gz; do
    count=$((count + 1))
    if [ "$count" -gt "$LOG_KEEP" ]; then
      if [ "$DRY_RUN" -eq 1 ]; then
        echo "  [DRY-RUN] Would prune old log archive: $old_gz"
      else
        rm -f "$old_gz"
        echo "  Pruned old log archive: $old_gz"
      fi
    fi
  done < <(ls -1t "${base_log}".*.gz 2>/dev/null || true)
done

echo "[AIA-MAINTAIN] Complete. ledger.ndjson and .keys left untouched."
