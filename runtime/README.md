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
| `src/promptSynthesizer.ts` | Template compiler: webhook + vault → meta-prompt + Decision Card |
| `src/sandboxWorker.ts` | Sandbox interceptor protocol (sensitivity rules, card packaging) |
| `src/sandboxWorkerEntry.js` | Worker-thread entry that runs `logic.js` with HITL pause |
| `src/sandboxManager.ts` | Host-side worker manager; queues Active Decision Cards |
| `src/recommendationEngine.ts` | Closed-loop next-action recommendations into the local queue |
| `src/server.ts` | GHL webhook ingest + authorize/dispatch API |
| `src/ghl.ts` | Webhook helpers and outbound GHL dispatch |

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhook/ghl` | Inbound GHL event → meta-prompt synthesis → Decision Card in queue |
| `GET` | `/queue` | List cards (`?status=pending`) |
| `POST` | `/queue/:cardId/authorize` | Sign with local Ed25519, append ledger, dispatch GHL, queue next-action recs |
| `POST` | `/queue/:cardId/reject` | Abort |
| `POST` | `/recommendations/from-feedback` | CRM feedback → recommendation cards (pending YES) |
| `POST` | `/vault` | Store encrypted credential `{ label, provider, secret }` |
| `GET` | `/ledger` | Read provenance proofs |
| `POST` | `/sandbox/run` | Run `logic.js`; sensitive calls pause for auth |

## GHL loop

1. CRM posts to `POST /webhook/ghl`
2. Runtime **synthesizes a meta-prompt** from templates + vault context and queues a high-risk Decision Card (`202`)
3. Human authorizes via `POST /queue/:id/authorize` (or the Queue cockpit)
4. Runtime verifies Ed25519 signature, appends `provenance_ledger`, and dispatches to `https://services.leadconnectorhq.com/...` using the decrypted vault credential
5. On success, the **recommendation engine** enqueues logical next-action cards (outreach, schedule, media, pipeline) — still pending human YES

Outbound calls default to **dry-run** (`AIA_GHL_DRY_RUN` unset or not `0`). Set `AIA_GHL_DRY_RUN=0` and store a real key with `provider: "gohighlevel"` to hit the live API.

Sovereign rule: no external side effect runs without passing through the local cryptographic queue.

## Data layout

```
runtime/data/aia_vault.db   # vault + queue + ledger
runtime/.keys/              # ed25519 + AES master key (mode 0600)
```
