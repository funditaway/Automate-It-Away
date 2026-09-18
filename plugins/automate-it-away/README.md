# Automate It Away — Grok plugin

Official [Automate It Away](https://automateitaway.com) plugin for Grok Build.

One engine. Many desks. Thin packs. You only tap exceptions.

Capture → Qualify → Do the work → Get paid → Follow + audit.

## What this plugin ships

| Component | Path | Purpose |
|---|---|---|
| Skills | `skills/` | Desk, pack, and API workflows for AIA |
| MCP server | `mcp/server.mjs` + `.mcp.json` | Stdio MCP wrapping the live AIA HTTPS API |
| Manifest | `.grok-plugin/plugin.json` | Plugin metadata for Grok |

## Network endpoints

The MCP server only calls the Automate It Away HTTPS API (default base `https://automateitaway.com`):

- `GET /api/health` — engine health
- `GET /api/health?view=status` — desk/status snapshot
- `GET\|POST /api/auth` — open a desk / session
- `GET\|POST /api/jobs` — queue + capture / qualify / ship / kill
- `GET\|POST /api/rules` — desk rules
- `GET\|POST\|DELETE /api/connections` — pipes
- Public pack JSON under `/packs/*.json`

No other hosts are contacted. The server does not read `.env`, SSH keys, or unrelated env vars, and does not send credentials anywhere except the AIA API headers below.

## Credentials

Set these in the MCP server environment (or pass them as tool arguments):

| Variable | Required | Purpose |
|---|---|---|
| `AIA_BASE_URL` | no | Override API base (default `https://automateitaway.com`) |
| `AIA_WORKSPACE` | for desk tools | Desk slug (`X-Workspace`) |
| `AIA_PIN` | when the desk uses a pin | Second-phone pin (`X-Pin`) |
| `AIA_SESSION` | optional | Session token (`X-Session`) |

## Local smoke test

```bash
AIA_WORKSPACE=demo node plugins/automate-it-away/mcp/server.mjs
# then send MCP initialize / tools/list over stdin
```

## License

MIT — see `LICENSE`.
