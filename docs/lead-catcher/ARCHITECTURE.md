# Lead Catcher — Architecture

Lead Catcher is an **Official AIA Pack** inside the existing AIA repo (`funditaway/Automate-It-Away`, branch `lead-catcher-slice`). It reuses AIA's stack (static HTML and vanilla JS pages, CommonJS Vercel functions in `api/`, files starting with `_` are not functions), AIA sign-in, the desk header and nav, theme.css, and the AIA logo (`img/aia-mark-teal.png`, unchanged).

```
 website form ──POST x-intake-key──┐
 typed in (desk page) ─────────────┤
 email / text / missed call (MOCK) ┘
                                   ▼
 /api/lead-catcher  (api/lead-catcher.js — 1 Vercel function; 11 of 12 on Hobby)
   ├─ who: AIA personOf()/isOwner() from api/_lib.js  (reads AIA store; never writes it)
   ├─ seat: AIA seat → Lead Catcher seat; desk AI → none (api/_ais.js actorIsDeskAi)
   └─ api/_lc-engine.js  ← every rule enforced here, server-side
        ├─ _lc-policy.js   seat × action matrix, lifecycle transitions
        ├─ _lc-intake.js   adapters: web_form (real shape), mock_email / mock_sms / mock_missed_call (MOCK)
        ├─ _lc-extract.js  rule-based helper (default)   _lc-model.js optional model (OFF, allow-list)
        ├─ _lc-draft.js    template draft, lint (price/time/guarantee words), payload hash (SHA-256)
        ├─ _lc-util.js     ids, canonical JSON, hashing, HttpError
        └─ _lc-store.js    ISOLATED JSON store (AIA_LC_STORE_PATH) + MOCK outbox (NDJSON)
 /lead-catcher (lead-catcher.html + lead-catcher.js)   gate (add → Yes, turn on → Yes), queue, card, draft, Yes/Stop/Run/Kill, numbers
 /packs-you-own (packs-you-own.js)                     shows Lead Catcher row + on/off for the open desk
 api/_packs.js OFFICIAL + packs/lead-catcher.json      listing; Market use/install/buy → 409 "needs your Yes on its own page"
```

## Why a separate store (the "closest isolated module")
AIA keeps all desks in one shared JSON document (`api/_lib.js` `mem`, a file or Vercel Blob). It has no per-row desk enforcement and no payload-bound approvals, and previews may share the production Blob token (unverified, see G22). Writing test cards there would risk mixing with real desk data. Lead Catcher therefore reads AIA only for sign-in and keeps its own per-desk partition:
`desks[slug] = { slug, pack:{on}, cards, drafts, approvals, actions, activity, attempts, spans, seq, roles }` plus `accounts[accountKey].owned`.
Writes are atomic (temp file + rename). On Vercel the default path is per-instance `/tmp`, so it is throwaway and not durable (G21).

## Key flows
- **Yes**: the client sends `{draftId, payloadHash}`. The server recomputes the hash from the stored draft and refuses on mismatch. It then stores the approval with `action_id` and the TTL.
- **Run**: needs a valid approval for `action_id`. It rechecks the hash against the stored draft, the current version, the confirmed recipient, the card's active state and the TTL. Then it does an idempotent write of one MOCK outbox line. Repeats return the first result.
- **History**: each event stores `hash = SHA-256(previous hash + event)`, starting from "genesis" (a chain). `history-check` verifies the chain. The original request has its own `original_hash`.
- **Live guard**: `VERCEL_ENV=production` → 503 on every Lead Catcher call.

## Files changed in existing AIA code
`api/_packs.js` (listing + 409 guard), `vercel.json` (2 rewrites), `package.json` (test chain step), `packs-you-own.js` (row). Nothing else in AIA was modified.

## Running locally
See README.md. The DEV ONLY runner `scripts/lead-catcher-dev.js` serves the repo on 127.0.0.1:4318 with a temp AIA store seeded with a fake desk.
