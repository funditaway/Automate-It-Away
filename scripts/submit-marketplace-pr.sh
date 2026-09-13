#!/usr/bin/env bash
# One-shot: fork xai-org/plugin-marketplace and open the Automate It Away catalog PR.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="$ROOT/marketplace-submission"
BRANCH="cursor/add-automate-it-away-5b81"
WORKDIR="${TMPDIR:-/tmp}/aia-plugin-marketplace-$$"

if ! command -v gh >/dev/null; then
  echo "gh CLI required" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login" >&2
  exit 1
fi

echo "Forking/cloning xai-org/plugin-marketplace..."
gh repo fork xai-org/plugin-marketplace --clone --default-branch-only "$WORKDIR" 2>/dev/null \
  || git clone "https://github.com/$(gh api user --jq .login)/plugin-marketplace.git" "$WORKDIR"
cd "$WORKDIR"
git remote add upstream https://github.com/xai-org/plugin-marketplace.git 2>/dev/null || true
git fetch upstream main
git checkout -B "$BRANCH" upstream/main

cp "$SUB/marketplace.json" .grok-plugin/marketplace.json
cp "$SUB/plugin-index.json" .grok-plugin/plugin-index.json
python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check

git add .grok-plugin/marketplace.json .grok-plugin/plugin-index.json
git commit -m "Add Automate It Away (automate-it-away) plugin"
git push -u origin "$BRANCH"

gh pr create --repo xai-org/plugin-marketplace \
  --title "Add Automate It Away (automate-it-away) plugin" \
  --body-file "$SUB/PR_BODY.md"
