# AIA Command Center (HITL Daemon)

Local-first **Human-in-the-Loop (HITL)** orchestration daemon for Automate It Away. Incoming pack/webhook events become decision cards; nothing changes external state until you authorize with an Ed25519 signature that is appended to `ledger.ndjson`.

Default bind: `http://127.0.0.1:3000/` (loopback only). Express is the only npm dependency; signing uses Node’s native `crypto` module.

## At-a-glance architecture

1. **Ingest & synthesize** — `webhookIngest.js` (plus appliance / bridge adapters) normalizes inbound events into the universal Active Decision Card schema via `lib/decisionCard.js`. Grok synthesis runs through `grokBotPrompt.js` when a key is present; otherwise a local meta-prompt fallback is used. Cards land in the in-memory queue — never auto-executed.
2. **Triage** — `public/index.html` polls `/queue`, shows risk-colored cards, and falls back to **SIMULATION** mode when the daemon is offline so keyboard workflows stay testable.
3. **Authorize & sign** — Pressing **Enter** (or the primary button) posts with `confirm: true`. `server.js` SHA-256-hashes the canonical payload, signs with the local Ed25519 key under `data/.keys/`, appends a hash-chained line to `data/ledger.ndjson`, then optionally dry-runs an allowlisted HTTPS dispatch.

The browser never touches `ed25519.pem`. Only an intent (`cardId` + `confirm`) is sent; hashing and signing stay inside the Node process.

## Core components

| File / Path | Role |
| --- | --- |
| `keygen.js` | Idempotent Ed25519 bootstrap under `data/.keys/` (`--rotate` retires prior keys aside) |
| `server.js` | Express daemon: `/health`, `/queue`, `/ledger`, `/api/sign`, HITL settle routes, static desk |
| `webhookIngest.js` | GHL / pack webhook mount — builds decision payloads, never signs |
| `public/index.html` | Dark Tailwind desk — queue + inspector, **Enter** authorize, offline simulation |
| `verifyLedger.js` | Recomputes SHA-256 chain links and verifies Ed25519 signatures |
| `doctor.js` | Node/Express, data dir, keypair, ledger, packs, bind, Grok key preflight |
| `deploySwarm.js` | Reads `../packs/*.json` and arms packs only after a signed `SWARM_ARM` card |
| `bridgeModule.js` / `lib/appliance.js` | Proposal-only Web3/domain bridge and local IoT telemetry adapters |
| `grokBotPrompt.js` | Meta-prompt / decision-card synthesis (live or local fallback) |
| `replayPacks.js` | Dry pack-registry load — no queue or ledger mutation |
| `start.sh` / `smoke.sh` | Boot (doctor + PM2/node) and doctor + contract-test smoke |
| `backup.sh` / `maintain.sh` | Cold identity/ledger archive and non-destructive temp/log cleanup |
| `ecosystem.config.cjs` | PM2 supervision (`autorestart`, loopback bind, dry-run dispatch) |
| `Makefile` / `package.json` | One-word operational verbs (see below) |
| `.env.example` | Documented `AIA_*` / Grok overrides (copy to `.env`; never commit secrets) |

### Local data (gitignored)

| Path | Purpose |
| --- | --- |
| `data/.keys/ed25519.pem` | Private signing key (mode `0600`) |
| `data/.keys/ed25519.pub.pem` | Public key |
| `data/ledger.ndjson` | Append-only hash-chained audit log |
| `backups/` | Cold archives from `backup.sh` |

## Quickstart

```bash
cd command
cp .env.example .env   # optional
npm install
make keygen
make doctor
make smoke
make start
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/) to triage pending cards. Authorize with **Enter** (or click **YES: AUTHORIZE & SIGN**). Audit the chain anytime with `make verify`.

## Operational runbook

| Command | What it does |
| --- | --- |
| `make keygen` / `npm run keygen` | Create or report the local Ed25519 identity |
| `make doctor` / `npm run doctor` | Environment + permission + ledger preflight |
| `make verify` / `npm run verify` | Verify `ledger.ndjson` chain + signatures |
| `make replay` / `npm run replay` | Dry-load `../packs/*.json` without mutating state |
| `make smoke` / `npm run smoke` | Doctor + `npm test` contract suite |
| `make start` / `npm start` | `./start.sh` (doctor, then PM2 or `node server.js`) |
| `npm run start:node` | Run `server.js` directly (no PM2) |
| `make backup` / `npm run backup` | Archive keys + ledger into `backups/` |
| `make maintain` / `npm run maintain` | Prune stale `.tmp` / rotate oversized logs (never touches ledger or keys) |
| `make test` / `npm test` | Contract tests only |

### Environment overrides

See `.env.example`. Common values:

- `AIA_BIND` / `AIA_PORT` — default `127.0.0.1:3000`
- `AIA_DATA_DIR` / `AIA_KEY_DIR` / `AIA_PACKS_DIR` / `AIA_BACKUP_DIR`
- `AIA_DISPATCH_DRY_RUN=1` — stub outbound HTTPS after sign (default)
- `GROK_API_KEY` or `SPACEXAI_API_KEY` — optional live synthesis

### Cryptographic guarantees

- **HITL gate** — authorize / reject / delegate refuse to run without `confirm: true`
- **Canonical signing** — `lib/canonical.js` + Ed25519 over a stable field set
- **Hash chain** — each ledger line stores `prev` → `entryHash`; `verifyLedger.js` walks the full file
- **Key isolation** — private key stays on disk; the desk only sends intent

### Service supervision

```bash
# with PM2 (preferred when installed)
./start.sh
# or
pm2 start ecosystem.config.cjs
```

Keep the bind on loopback (or a private Tailscale/WireGuard interface). Do not expose `/api/sign` on the public internet.

## Related

- Repo site / Vercel app — root `README.md`
- SQLite vault + GHL IPC runtime — `../runtime/README.md`
- Pack manifests — `../packs/*.json`
