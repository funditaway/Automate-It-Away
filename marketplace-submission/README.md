# Automate It Away → xAI plugin-marketplace submission

Validated against `xai-org/plugin-marketplace` main:

```bash
python3 scripts/generate-plugin-index.py
python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check
```

## Catalog entry

Pinned to `funditaway/Automate-It-Away` **main**:

`61e005575ec3947ede099e4ee05d086c0f1bb5eb`

Path: `plugins/automate-it-away`  
Homepage: https://automateitaway.com

## Open the marketplace PR (one shot)

```bash
gh repo fork xai-org/plugin-marketplace --clone
cd plugin-marketplace
git checkout -b cursor/add-automate-it-away-5b81
# From Automate-It-Away main:
cp /path/to/Automate-It-Away/marketplace-submission/marketplace.json .grok-plugin/marketplace.json
cp /path/to/Automate-It-Away/marketplace-submission/plugin-index.json .grok-plugin/plugin-index.json
# or: git apply /path/to/marketplace.json.patch && python3 scripts/generate-plugin-index.py
python3 scripts/validate-catalog.py
python3 scripts/generate-plugin-index.py --check
git add .grok-plugin/marketplace.json .grok-plugin/plugin-index.json
git commit -m "Add Automate It Away (automate-it-away) plugin"
git push -u origin HEAD
gh pr create --repo xai-org/plugin-marketplace \
  --title "Add Automate It Away (automate-it-away) plugin" \
  --body-file /path/to/Automate-It-Away/marketplace-submission/PR_BODY.md
```
