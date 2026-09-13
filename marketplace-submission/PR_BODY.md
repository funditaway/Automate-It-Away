## What this PR does

- Plugin name: `automate-it-away`
- Type: remote source
- Source URL + pinned SHA: `https://github.com/funditaway/Automate-It-Away.git` @ `61e005575ec3947ede099e4ee05d086c0f1bb5eb`
- Path: `plugins/automate-it-away`
- Homepage: https://automateitaway.com

Adds Automate It Away to the official Grok plugin marketplace so global Grok users can install AIA desks, packs, and MCP tools.

## Ownership

- [x] I own this plugin or have the right to distribute it.
- [x] The source repo is published under our official account (`funditaway/Automate-It-Away`).

## Checklist

- [x] Added exactly one entry in `.grok-plugin/marketplace.json`
- [x] Remote source pins a full 40-char lowercase commit sha (public + reachable)
- [x] Regenerated `.grok-plugin/plugin-index.json`
- [x] `python3 scripts/validate-catalog.py` passes
- [x] `python3 scripts/generate-plugin-index.py --check` passes
- [x] homepage + clear description; brand-scoped keywords/domains
- [x] License stated (MIT)

## Security

- [x] No curl|bash / remote exec / postinstall RCE
- [x] No secret exfiltration
- [x] Least-privilege MCP scope
- Network: `automateitaway.com`, `www.automateitaway.com`, `api.automateitaway.com`
- Credentials: optional `AIA_WORKSPACE` / `AIA_PIN` / `AIA_SESSION` → `X-Workspace` / `X-Pin` / `X-Session`
