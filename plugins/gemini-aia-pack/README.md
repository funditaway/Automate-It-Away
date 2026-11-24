# Gemini AIA Pack

Modular Gemini integration pack for **Automate It Away (AIA)** and **AIA Desk AI**.

Desk AIs draft. Humans Yes / Stop / Kill. Collect stays HOLD. Never auto-send.

Related official desk pack: [`packs/meta-gemini.json`](../../packs/meta-gemini.json).

## Pack Structure

| File | Purpose |
|---|---|
| `gemini-aia-pack.json` | Provider settings, card definitions, model routing |
| `GEMINI_SYSTEM_PROMPT.md` | System rules for concise copy, structured routing, safe fallbacks |
| `deploy_gemini_aia_pack.mjs` | Gemini card runner (fetch API; dry-run without a key) |
| `queue-card-schema.json` | JSON Schema for queue item states and routing payloads |
| `.cursor/rules/gemini-aia-pack.mdc` | Coding rules for Cursor when modifying AIA cards/queues |
| `aia-gemini-plugin.yaml` | Event hooks, confidence thresholds, human-approval gates |
| `eval-fixtures.json` | Test inputs and assertions across triage, drafting, workflow cards |
| `queue-ui-model.json` | Badge styles, card actions, queue display rules |
| `processQueueItem.mjs` / `processQueueItemV2.mjs` | State-machine workers (+ retry/audit in V2) |
| `run-evals.mjs` | Fixture test runner |
| `QueueItemCard.jsx` / `QueuePage.jsx` | Reference desk queue UI (React) |
| `queue-desk.css` | Dark desk styles for the reference UI |
| `queueApiHandler.mjs` / `queueApiHandlerV2.mjs` | HTTP process + approve endpoints |
| `intake-followup-cards.json` | Intake + follow-up card definitions |
| `doctor.mjs` | Preflight file / schema / env check |
| `withRetry.mjs` | Retry/backoff for rate limits |
| `audit-log-schema.json` | Execution / approval audit schema |
| `intakeBatchHandler.mjs` | Webhook / batch normalizer |
| `setup-pack.sh` | Bootstrap optional deps + doctor |
| `run-batch.mjs` / `sample-batch.json` | Batch CLI + sample fixture |
| `validateState.mjs` | Queue / audit validators |
| `serve-queue.mjs` | Local HTTP server on `:3080` |
| `chainCards.mjs` | Multi-card chain runner |
| `.env.example` | Env template |

## Quick Start

```bash
cd plugins/gemini-aia-pack
chmod +x setup-pack.sh
./setup-pack.sh          # optional deps + doctor
npm run smoke            # triage dry-run or live if GEMINI_API_KEY is set
npm run eval             # fixture checks (dry-run)
npm run batch            # sample batch through V2 worker
npm run serve            # local queue API on http://localhost:3080
```

Set a key for live Gemini calls:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Without a key, runners use deterministic dry-run fixtures so CI stays offline-safe.

## Guardrails

- Confidence below `0.85` routes to `needs_review` (never silent Yes).
- Draft and deep-workflow cards require human review before external action.
- `ready` means **Draft Ready** for human Yes — not auto-send.
- Missing context stays `null` / `needs_review` rather than guessing IDs, dates, or statuses.
- Collect stays HOLD until Yes + a real money pipe.
