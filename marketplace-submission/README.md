# Automate It Away → xAI plugin-marketplace submission

Validated against `xai-org/plugin-marketplace` main.

Pinned SHA: `ab47fff9355be41dc41e404b4af48692420491a6`  
Path: `plugins/automate-it-away`  
Issue: https://github.com/xai-org/plugin-marketplace/issues/704

## One-shot PR (recommended)

From a machine where `gh` can fork `xai-org/plugin-marketplace`:

```bash
./scripts/submit-marketplace-pr.sh
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
