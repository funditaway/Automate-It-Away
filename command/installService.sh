#!/usr/bin/env bash
# Generate native service supervision for the HITL command daemon.
# Linux → systemd user unit; macOS → launchd LaunchAgent.
# Does not require PM2. Webhooks are mounted by server.js (unified daemon).
#
#   ./installService.sh --dry-run
#   ./installService.sh --enable
#   ./installService.sh --ingest --dry-run
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

NODE_BIN="${AIA_NODE_BIN:-$(command -v node || true)}"
SERVICE_NAME="${AIA_SERVICE_NAME:-aia-command}"
ENTRY_SCRIPT="${AIA_ENTRY_SCRIPT:-server.js}"
DRY_RUN=0
ENABLE_NOW=0
INGEST_ALIAS=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    --enable)
      ENABLE_NOW=1
      ;;
    --ingest)
      # Historical dual-process layout used a separate ingest binary.
      # In this stack webhookIngest.js is mounted by server.js — keep one process.
      INGEST_ALIAS=1
      SERVICE_NAME="${AIA_SERVICE_NAME:-aia-ingest}"
      ENTRY_SCRIPT="${AIA_ENTRY_SCRIPT:-server.js}"
      ;;
    -h|--help)
      cat >&2 <<'EOF'
Usage: ./installService.sh [--dry-run] [--enable] [--ingest]

  --dry-run   Print the unit/plist that would be written, then exit
  --enable    Enable and start/load the service after writing
  --ingest    Alias unit name aia-ingest (still runs server.js; webhooks are mounted there)

Env overrides: AIA_NODE_BIN, AIA_SERVICE_NAME, AIA_ENTRY_SCRIPT
EOF
      exit 0
      ;;
  esac
done

if [ -z "$NODE_BIN" ]; then
  echo "Error: node binary not found in PATH (set AIA_NODE_BIN)" >&2
  exit 1
fi

if [ ! -f "$DIR/$ENTRY_SCRIPT" ]; then
  echo "Error: entry script not found: $DIR/$ENTRY_SCRIPT" >&2
  exit 1
fi

if [ "$INGEST_ALIAS" -eq 1 ]; then
  echo "Note: webhook routes are mounted by server.js; unit still ExecStarts ${ENTRY_SCRIPT}."
fi

LOG_DIR="${AIA_LOG_DIR:-$DIR/logs}"
OS_NAME="$(uname -s)"

write_and_maybe_enable_linux() {
  local unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  local unit_path="$unit_dir/${SERVICE_NAME}.service"
  local unit_content

  unit_content="[Unit]
Description=AIA (Automate It Away) HITL command center - ${SERVICE_NAME}
Documentation=file://${DIR}/README.md
After=network.target

[Service]
Type=simple
WorkingDirectory=${DIR}
ExecStart=${NODE_BIN} ${DIR}/${ENTRY_SCRIPT}
Restart=on-failure
RestartSec=3
Environment=AIA_BIND=127.0.0.1
Environment=AIA_PORT=3000
Environment=AIA_DISPATCH_DRY_RUN=1
StandardOutput=append:${LOG_DIR}/${SERVICE_NAME}.log
StandardError=append:${LOG_DIR}/${SERVICE_NAME}.log"

  if [ -f "$DIR/.env" ]; then
    unit_content="${unit_content}
EnvironmentFile=${DIR}/.env"
  fi

  unit_content="${unit_content}

[Install]
WantedBy=default.target
"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[DRY-RUN] systemd unit path: $unit_path"
    printf "%s" "$unit_content"
    exit 0
  fi

  mkdir -p "$unit_dir" "$LOG_DIR"
  chmod 700 "$LOG_DIR" 2>/dev/null || true
  printf "%s" "$unit_content" > "$unit_path"
  chmod 644 "$unit_path"
  echo "Wrote systemd user unit: $unit_path"

  if [ "$ENABLE_NOW" -eq 1 ]; then
    systemctl --user daemon-reload
    systemctl --user enable --now "${SERVICE_NAME}.service"
    echo "Enabled and started ${SERVICE_NAME}.service"
    echo "Logs: ${LOG_DIR}/${SERVICE_NAME}.log"
  else
    echo "Unit written but not enabled. Re-run with --enable to start."
  fi
}

write_and_maybe_enable_darwin() {
  local label="com.aia.${SERVICE_NAME//-/.}"
  local agents_dir="$HOME/Library/LaunchAgents"
  local plist_path="$agents_dir/${label}.plist"
  local plist_content

  plist_content="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${DIR}/${ENTRY_SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AIA_BIND</key>
    <string>127.0.0.1</string>
    <key>AIA_PORT</key>
    <string>3000</string>
    <key>AIA_DISPATCH_DRY_RUN</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/${SERVICE_NAME}.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/${SERVICE_NAME}.log</string>
</dict>
</plist>
"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[DRY-RUN] launchd plist path: $plist_path"
    printf "%s" "$plist_content"
    exit 0
  fi

  mkdir -p "$agents_dir" "$LOG_DIR"
  chmod 700 "$LOG_DIR" 2>/dev/null || true
  printf "%s" "$plist_content" > "$plist_path"
  chmod 644 "$plist_path"
  echo "Wrote launchd agent: $plist_path"

  if [ "$ENABLE_NOW" -eq 1 ]; then
    launchctl bootout "gui/$(id -u)" "$plist_path" >/dev/null 2>&1 || true
    launchctl unload "$plist_path" >/dev/null 2>&1 || true
    if launchctl bootstrap "gui/$(id -u)" "$plist_path" 2>/dev/null; then
      launchctl enable "gui/$(id -u)/${label}" 2>/dev/null || true
      launchctl kickstart -k "gui/$(id -u)/${label}" 2>/dev/null || true
    else
      launchctl load -w "$plist_path"
    fi
    echo "Loaded launchd agent: $label"
    echo "Logs: ${LOG_DIR}/${SERVICE_NAME}.log"
  else
    echo "Plist written but not loaded. Re-run with --enable to start."
  fi
}

case "$OS_NAME" in
  Linux)
    write_and_maybe_enable_linux
    ;;
  Darwin)
    write_and_maybe_enable_darwin
    ;;
  *)
    echo "Unsupported OS for service unit generation: $OS_NAME" >&2
    echo "Use PM2 via ./start.sh, or set AIA_NODE_BIN and run node server.js directly." >&2
    exit 1
    ;;
esac
