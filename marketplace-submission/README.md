# Automate It Away → xAI plugin-marketplace submission

Validated against `xai-org/plugin-marketplace` main.

Pinned SHA: `ecdd5f6e3966365c6d3d2688bfffa19f2ca71458`  
Path: `plugins/automate-it-away`  
Issue: https://github.com/xai-org/plugin-marketplace/issues/704

## One-shot PR (recommended)

### Option A — GitHub Action (no local fork needed)

1. Create a GitHub PAT that can fork public repos and open PRs.
2. Add repo secret `MARKETPLACE_GITHUB_TOKEN` = that PAT.
3. Actions → **Submit Grok marketplace PR** → Run workflow.

### Option B — Local CLI

From a machine where `gh` can fork `xai-org/plugin-marketplace`:

```bash
./scripts/submit-marketplace-pr.sh
# or: MARKETPLACE_GITHUB_TOKEN=ghp_... ./scripts/submit-marketplace-pr.sh
```

## Manual

```bash
gh repo fork xai-org/plugin-marketplace --clone
cd plugin-marketplace
git checkout -b cursor/add-automate-it-away-5b81
cp /path/to/Automate-It-Away/marketplace-submission/marketplace.json .grok-plugin/marketplace.json
cp /path/to/Automate-It-Away/marketplace-submission/plugin-index.json .grok-plugin/plugin-index.json
python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check
git add .grok-plugin/marketplace.json .grok-plugin/plugin-index.json
git commit -m "Add Automate It Away (automate-it-away) plugin"
git push -u origin HEAD
gh pr create --repo xai-org/plugin-marketplace --title "Add Automate It Away (automate-it-away) plugin" --body-file /path/to/Automate-It-Away/marketplace-submission/PR_BODY.md
```
