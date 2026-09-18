#!/usr/bin/env bash
# One-shot: fork xai-org/plugin-marketplace and open the Automate It Away catalog PR.
#
# Auth (first match wins):
#   1. MARKETPLACE_GITHUB_TOKEN
#   2. GH_TOKEN
#   3. existing `gh auth` login
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUB="$ROOT/marketplace-submission"
BRANCH="cursor/add-automate-it-away-5b81"
WORKDIR="${TMPDIR:-/tmp}/aia-plugin-marketplace-$$"

if ! command -v gh >/dev/null; then
  echo "gh CLI required" >&2
  exit 1
fi
if ! command -v python3 >/dev/null; then
  echo "python3 required" >&2
  exit 1
fi

if [ -n "${MARKETPLACE_GITHUB_TOKEN:-}" ]; then
  export GH_TOKEN="$MARKETPLACE_GITHUB_TOKEN"
fi

if [ -z "${GH_TOKEN:-}" ] && ! gh auth status >/dev/null 2>&1; then
  echo "No GitHub auth. Set MARKETPLACE_GITHUB_TOKEN or run: gh auth login" >&2
  exit 1
fi

for f in marketplace.json plugin-index.json PR_BODY.md; do
  if [ ! -f "$SUB/$f" ]; then
    echo "Missing $SUB/$f — refresh marketplace-submission/ first" >&2
    exit 1
  fi
done

LOGIN="$(gh api user --jq .login)"
echo "Authenticated as: $LOGIN"
echo "Ensuring fork of xai-org/plugin-marketplace exists..."

# Create fork if missing (idempotent)
if ! gh repo view "$LOGIN/plugin-marketplace" >/dev/null 2>&1; then
  gh repo fork xai-org/plugin-marketplace --default-branch-only --remote=false
  # Fork creation can lag briefly
  for _ in 1 2 3 4 5; do
    gh repo view "$LOGIN/plugin-marketplace" >/dev/null 2>&1 && break
    sleep 2
  done
fi

gh repo sync "$LOGIN/plugin-marketplace" --source xai-org/plugin-marketplace --force || true

rm -rf "$WORKDIR"
git clone "https://x-access-token:${GH_TOKEN}@github.com/${LOGIN}/plugin-marketplace.git" "$WORKDIR"
cd "$WORKDIR"

git remote add upstream https://github.com/xai-org/plugin-marketplace.git 2>/dev/null || true
git fetch upstream main
git checkout -B "$BRANCH" upstream/main

cp "$SUB/marketplace.json" .grok-plugin/marketplace.json
cp "$SUB/plugin-index.json" .grok-plugin/plugin-index.json

python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check

git config user.name "Automate It Away"
git config user.email "support@automateitaway.com"
git add .grok-plugin/marketplace.json .grok-plugin/plugin-index.json
if git diff --cached --quiet; then
  echo "No catalog changes to commit (entry may already be present)."
else
  git commit -m "Add Automate It Away (automate-it-away) plugin"
fi
git push -u origin "$BRANCH" --force-with-lease

EXISTING="$(gh pr list --repo xai-org/plugin-marketplace --head "$LOGIN:$BRANCH" --json url --jq '.[0].url // empty')"
if [ -n "$EXISTING" ]; then
  echo "Updated existing PR: $EXISTING"
  gh pr edit "$EXISTING" --title "Add Automate It Away (automate-it-away) plugin" --body-file "$SUB/PR_BODY.md" || true
  echo "$EXISTING"
else
  gh pr create --repo xai-org/plugin-marketplace \
    --head "$LOGIN:$BRANCH" \
    --base main \
    --title "Add Automate It Away (automate-it-away) plugin" \
    --body-file "$SUB/PR_BODY.md"
fi
