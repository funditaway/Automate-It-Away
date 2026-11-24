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
| `keygen.js` | Idempotent Ed25519 bootstrap under `data/.keys/` (`--rotate` uses keyring-aware cutover) |
| `rotateKey.js` | Non-destructive rotation — new ACTIVE key, prior keys RETIRED in `keyring.json` |
| `server.js` | Express daemon: `/health`, `/healthz`, `/readyz`, `/queue`, `/ledger`, `/api/sign`, HITL settle routes, static desk |
| `webhookIngest.js` | GHL / pack webhook mount — builds decision payloads, never signs |
| `public/index.html` | Dark Tailwind desk — queue + inspector, **Enter** authorize, offline simulation |
| `verifyLedger.js` | Recomputes SHA-256 chain links; verifies signatures against active + retired keyring keys |
| `exportAudit.js` | Private-key-free audit bundle (ledger + public keyring + verification + `bundleSha256`) |
| `verifyAuditBundle.js` | Offline verifier for audit bundles (digest + signatures + contiguous `prev` links) |
| `statusSummary.js` | Read-only queue/spool/keyring/ledger snapshot (no daemon, no mutation) |
| `archiveLedgerWindow.js` | Archive older ledger lines into hash-indexed slices; writes `ledger.anchor.json` |
| `verifyLedgerSlice.js` | Verify archived slice `.ndjson` + `.meta.json` (digest, signatures, `prev` continuity) |
| `reconcileQueue.js` | Sync `active_queue.json` statuses to ledger.ndjson decisions (dry-run + atomic write) |
| `flushSpool.js` | Drain `spool.ndjson` into `/webhook/<channel>`; quarantine poison lines to `spool.deadletter.ndjson` |
| `requeueDeadletter.js` | Inspect / selectively requeue dead-letter entries back to spool (or `--send` to ingest) |
| `watchdog.js` | Probe `/healthz` + `/readyz`; optional bounded `--restart-cmd` (never touches ledger/keys/queue) |
| `verifyAllIntegrity.js` | Single read-only gate: ledger chain/signatures, optional `--bundle`, queue drift report, state summary |
| `doctor.js` | Node/Express, data dir, keypair, ledger, packs, bind, Grok key preflight |
| `deploySwarm.js` | Reads `../packs/*.json` and arms packs only after a signed `SWARM_ARM` card |
| `bridgeModule.js` / `lib/appliance.js` | Proposal-only Web3/domain bridge and local IoT telemetry adapters |
| `grokBotPrompt.js` | Meta-prompt / decision-card synthesis (live or local fallback) |
| `replayPacks.js` | Dry pack-registry load — no queue or ledger mutation |
| `start.sh` / `smoke.sh` / `releaseCheck.sh` | Boot, contract smoke, and fail-fast pre-flight (doctor → integrity → dry-runs → smoke) |
| `backup.sh` / `restore.sh` / `maintain.sh` | Checksummed cold state bundles, verified restore, and non-destructive temp/log cleanup |
| `installService.sh` | Generate systemd user unit (Linux) or launchd agent (macOS) for `server.js` |
| `generateRunbook.js` | Render a secret-safe `RUNBOOK.md` from live paths, key IDs, and ops scripts |
| `ecosystem.config.cjs` | PM2 supervision (`autorestart`, loopback bind, dry-run dispatch) |
| `Makefile` / `package.json` | One-word operational verbs (see below) |
| `.env.example` | Documented `AIA_*` / Grok overrides (copy to `.env`; never commit secrets) |

### Local data (gitignored)

| Path | Purpose |
| --- | --- |
| `data/.keys/ed25519.pem` | Private signing key (mode `0600`) |
| `data/.keys/ed25519.pub.pem` | Public key |
| `data/.keys/keyring.json` | Active + retired public keys for historical verification |
| `data/ledger.ndjson` | Append-only hash-chained audit log (hot window) |
| `data/ledger.anchor.json` | Boundary after archival (`expectedPrev` / `expectedNextSeq`) |
| `data/ledger-archives/` | Archived ledger slices + manifests |
| `data/spool.ndjson` | Buffered inbound events awaiting drain after outages |
| `data/spool.deadletter.ndjson` | Quarantined malformed / permanently rejected spool lines |
| `backups/` | Cold `aia-state-*.tar.gz` archives + `.sha256` sidecars from `backup.sh` |

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
| `make rotate` / `npm run rotate` | Rotate signing key; retain prior pubs in `keyring.json` |
| `make doctor` / `npm run doctor` | Environment + permission + ledger preflight |
| `make verify` / `npm run verify` | Verify `ledger.ndjson` chain + signatures |
| `make replay` / `npm run replay` | Dry-load `../packs/*.json` without mutating state |
| `make export` / `npm run export` | Write a private-key-free audit JSON under `audits/` (`--card`, `--out`) |
| `make verify-audit BUNDLE=…` | Offline-verify an audit bundle (`npm run verify-audit -- path.json`) |
| `make status` / `npm run status` | Queue / spool / keyring / ledger tip snapshot |
| `make archive` / `npm run archive` | Archive older ledger lines (`ARCHIVE_FLAGS='--keep-last 100 --dry-run'`) |
| `make verify-slice SLICE=…` | Verify an archived ledger slice (`META=` optional) |
| `make verify-all` / `npm run verify-all` | Full integrity gate (`VERIFY_ALL_FLAGS='--bundle path/to/audit.json'`) |
| `make reconcile` / `npm run reconcile` | Reconcile queue snapshot vs ledger (`RECONCILE_FLAGS=--dry-run`) |
| `make flush` / `npm run flush` | Drain spool to daemon webhooks (`FLUSH_FLAGS='--dry-run --quarantine-invalid'`) |
| `make requeue` / `npm run requeue` | Inspect/requeue dead-letter (`REQUEUE_FLAGS='--inspect'` or `--reason HTTP_400 --limit 5`) |
| `make watchdog` / `npm run watchdog` | Probe daemon health/ready (`WATCHDOG_FLAGS='--dry-run --restart-cmd "pm2 restart aia-command"'`) |
| `make smoke` / `npm run smoke` | Doctor + `npm test` contract suite |
| `make release` / `npm run release` | Pre-flight gate (`RELEASE_FLAGS='--strict-keyring'` or `--quick`) |
| `make start` / `npm start` | `./start.sh` (doctor, then PM2 or `node server.js`) |
| `npm run start:node` | Run `server.js` directly (no PM2) |
| `make backup` / `npm run backup` | Checksummed cold snapshot of `data/` + packs + `.env` (`BACKUP_FLAGS=--plain`) |
| `make restore ARCHIVE=…` | Verified restore (`RESTORE_FLAGS=--dry-run` or `--skip-verify`) |
| `make maintain` / `npm run maintain` | Stale `.tmp` cleanup, log trim, 0700/0600 hardening, integrity check (`MAINTAIN_FLAGS=--dry-run`) |
| `make install-service` / `npm run install-service` | Write systemd/launchd unit (`INSTALL_SERVICE_FLAGS='--dry-run'` or `--enable`) |
| `make runbook` / `npm run runbook` | Generate secret-safe `RUNBOOK.md` (`RUNBOOK_FLAGS='--out /tmp/RUNBOOK.md'`) |
| `make test` / `npm test` | Contract tests only |

### Environment overrides

See `.env.example`. Common values:

- `AIA_BIND` / `AIA_PORT` — default `127.0.0.1:3000`
- `AIA_DATA_DIR` / `AIA_KEY_DIR` / `AIA_PACKS_DIR` / `AIA_BACKUP_DIR`
- `AIA_DAEMON_URL` / `AIA_INGEST_URL` — flush/watchdog targets (default `http://127.0.0.1:3000`)
- `AIA_WEBHOOK_SECRET` — optional HMAC for spool replay (`X-AIA-Signature`)
- `AIA_WATCHDOG_RESTART_CMD` / `AIA_WATCHDOG_TIMEOUT_MS` — optional recovery hook for `watchdog.js`
- `AIA_LOG_DIR` / `AIA_TMP_MAX_AGE_MIN` / `AIA_LOG_MAX_LINES` — maintain.sh hygiene knobs
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
