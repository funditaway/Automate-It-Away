# Automate It Away → xAI plugin-marketplace submission

Validated locally with:

```bash
python3 deploy_aia_plugin.py
# which runs:
#   python3 scripts/generate-plugin-index.py
#   python3 scripts/validate-catalog.py
#   python3 scripts/generate-plugin-index.py --check
```

## Catalog entry

Pinned to `funditaway/Automate-It-Away` commit:

`5397a6c3de3a7eb61cac5e44b2f7f8becb560cee`

Path: `plugins/automate-it-away`

## Open the marketplace PR

This environment cannot fork `xai-org/plugin-marketplace` (GitHub token lacks `public_repo` fork scope). From an account that can fork:

```bash
gh repo fork xai-org/plugin-marketplace --clone
cd plugin-marketplace
git checkout -b cursor/add-automate-it-away-5b81
# copy marketplace.json + regenerate index, or apply marketplace.json.patch then:
python3 scripts/generate-plugin-index.py
python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check
git add .grok-plugin/marketplace.json .grok-plugin/plugin-index.json
git commit -m "Add Automate It Away (automate-it-away) plugin"
git push -u origin HEAD
gh pr create --repo xai-org/plugin-marketplace --fill
```

Or copy `marketplace.json` / `plugin-index.json` from this folder into a fork after rebasing onto latest `main`.
