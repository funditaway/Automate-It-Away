# AIA Local Runtime

Local-first IPC bridge, SQLite vault, and GoHighLevel webhook ingestion for Automate It Away.

Runs entirely on the machine — secrets and provenance never leave `aia_vault.db`.

## Stack

- Node.js 20+ / TypeScript
- Express (`127.0.0.1:3847`)
- Better-SQLite3
- Ed25519 + AES-256-GCM (Node `crypto`)

## Quick start

```bash
cd runtime
npm install
npm run dev
```

Desk terminal: [http://127.0.0.1:3847/](http://127.0.0.1:3847/)  
Health: `GET http://127.0.0.1:3847/health`

The sovereign desk UI (`public/index.html`) loads the live queue from SQLite, simulates GHL webhooks, and calls `/queue/:id/authorize` to Ed25519-sign cards and dispatch.

## Modules

| File | Role |
|------|------|
| `src/db.ts` | SQLite vault, queue, append-only provenance ledger |
| `src/crypto.ts` | Ed25519 keypair + canonical JSON signing |
| `src/sandboxManager.ts` | Worker sandbox for `logic.js` with HITL intercept |
| `src/server.ts` | GHL webhook ingest + authorize/dispatch API |
| `src/ghl.ts` | Webhook → card mapping and outbound GHL dispatch |

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhook/ghl` | Inbound GHL event → Decision Card in queue |
| `GET` | `/queue` | List cards (`?status=pending`) |
| `POST` | `/queue/:cardId/authorize` | Sign with local Ed25519, append ledger, dispatch GHL |
| `POST` | `/queue/:cardId/reject` | Abort |
| `POST` | `/vault` | Store encrypted credential `{ label, provider, secret }` |
| `GET` | `/ledger` | Read provenance proofs |
| `POST` | `/sandbox/run` | Run `logic.js`; sensitive calls pause for auth |

## GHL loop

1. CRM posts to `POST /webhook/ghl`
2. Runtime queues a high-risk Decision Card and returns `202`
3. Human authorizes via `POST /queue/:id/authorize` (or the Queue cockpit)
4. Runtime verifies Ed25519 signature, appends `provenance_ledger`, and dispatches to `https://services.leadconnectorhq.com/...` using the decrypted vault credential

Outbound calls default to **dry-run** (`AIA_GHL_DRY_RUN` unset or not `0`). Set `AIA_GHL_DRY_RUN=0` and store a real key with `provider: "gohighlevel"` to hit the live API.

## Data layout

```
runtime/data/aia_vault.db   # vault + queue + ledger
runtime/.keys/              # ed25519 + AES master key (mode 0600)
```
