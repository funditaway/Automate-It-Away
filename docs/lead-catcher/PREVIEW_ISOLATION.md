# Lead Catcher — Preview Isolation Evidence

First checked 2026-10-08 ~1:30 AM CT (read-only). Updated 2026-10-08 ~2:01 AM CT after James approved changes **D** and **A/C**, again ~2:35 AM CT after James was sent the Vercel env-vars link for A/C, and ~2:50 AM CT with the result of check **J** (what Preview actually has; below). Env vars are listed by name and target only, never values.

## Changes made 2026-10-08 (approved by James: D and A/C)
| Change | Call (Vercel connector) | Before | After | Verified |
|---|---|---|---|---|
| **D.** Vercel Authentication for previews, project `automate-it-away` only | `update_project` `ssoProtection: { deploymentType: "preview" }` | `ssoProtection: { enabled: false, deploymentType: null }` (password protection off) | `ssoProtection: { enabled: true, deploymentType: "preview" }` (password protection still off) | `get_project` re-read shows the new value. `curl -sI` at 02:01 CT: preview `automate-it-away-hgvjjjq0t-…vercel.app` **200 → 302** to `vercel.com/sso-api` (login); branch alias `automate-it-away-git-lead-catcher-slice-…vercel.app` **302** to login; `automateitaway.com` **308 → www** (same as before); `www.automateitaway.com` **200** (same as before); `automate-it-away.vercel.app` **200**. No revert needed. |
| **A/C.** Blob and secret env vars → Production only | `filter_project_envs` (list names + targets, no decrypt) | — | **Not changed.** The listing call returned **403 forbidden** (`GET /v10/projects/{idOrName}/env`, requestId `iad1:sfo1::xldb7-1791442887986-9ab2df417e39`). Step stopped as instructed; no CLI or other workaround tried. No env var was edited or deleted. | — |

Not touched: production values, env vars, DNS, domains, billing, the `runtime` project (E not approved), code, `main`. Nothing was redeployed or promoted. Deployment protection applies at request time, so existing preview URLs were protected immediately (no rebuild needed for D).

## Check J result 2026-10-08 ~2:50 AM CT: what the Preview build actually has
James approved J. `scripts/env-presence.js` runs as the Vercel build step on this branch (`package.json` `vercel-build`, always exits 0, prints a skip line on production). It reads `process.env` only (no `api/_lib.js`, no store, no file, no network) and prints one line: each group `present|missing` and the **names** that are set. Never values, lengths, prefixes or hashes; `scripts/check-env-presence.js` (E01–E14, 25 PASS) runs it with fake values and fails if any value or piece of one appears. No request was made to the preview, and no share link or bypass token was created.

Assumption: Vercel gives a build the same project env vars as that environment's functions (Preview build = Preview runtime), including vars added by a store connection. Build-machine internals (below) are build-only.

Preview build `automate-it-away-ni7zz3s10-…vercel.app` (commit `7b701b9`, built 02:48:58–02:49:25 CT, READY), read from the build log with the Vercel connector (`list_deployment_events`, read-only):

```
AIA_ENV_PRESENCE env=preview blob=present pinSalt=missing adminPin=missing session=missing connectSecret=missing aiKeys=missing registry=missing webhook=missing cron=missing ghl=missing other=present system=present presentNames=BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN,BLOB_READ_WRITE_TOKEN_STORE_ID,BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY,FAKEROOTKEY,NEXT_PRIVATE_MULTI_PAYLOAD,VERCEL_ARTIFACTS_TOKEN,VERCEL_DEPLOYMENT_KEY,VERCEL_ENV_ENC_KEY,VERCEL_EVAL_LAMBDA_GROUPING_RATIO,VERCEL_HASH_SALT,VERCEL_OIDC_TOKEN
```

| Group | Preview | What it means |
|---|---|---|
| `pinSalt`, `adminPin`, `session`, `connectSecret`, `aiKeys`, `registry`, `cron`, `webhook`, `ghl` | **missing** | **C took effect**: none of the secret keys (`AIA_PIN_SALT`, `AIA_ADMIN_PIN`, `AIA_CONNECT_SECRET`, `XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_GROK_API_KEY`, `AIA_SPACEXAI_API_KEY`, `AIA_LC_MODEL_API_KEY`, `AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`) reaches Preview. |
| `blob` | **present**: `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY` | **A did not fully take effect.** Plain `BLOB_READ_WRITE_TOKEN` is gone, but these three still reach Preview. They look like the vars a **connected Blob store** adds (custom prefix `BLOB_READ_WRITE_TOKEN`), which usually can't be unticked on the env-vars page; they follow the store's connection settings (proposal **B**). `api/_lib.js` `blobToken()` uses `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, so preview functions can **read and write** `aia/store.json`. Nothing suggests this is a separate preview store, so treat it as production's. |
| `system` | present (Vercel-provided) | `VERCEL_OIDC_TOKEN`, `VERCEL_ARTIFACTS_TOKEN`, `VERCEL_DEPLOYMENT_KEY`, `VERCEL_ENV_ENC_KEY`, `VERCEL_HASH_SALT` are Vercel's own build vars; `VERCEL_EVAL_LAMBDA_GROUPING_RATIO` is a false match ("PIN" inside "GROUPING"). Not project env vars; nothing for James to untick. |
| `other` | present (build machine) | `FAKEROOTKEY` (the build image's fakeroot tool) and `NEXT_PRIVATE_MULTI_PAYLOAD` (Vercel builder internal). Not project env vars; harmless. |

**What James needs to change (names only):** `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY`. In Vercel: **Storage → the Blob store → Projects (Connected Projects) → `automate-it-away` → environments: untick Preview (and Development)**, keep Production. If they show up on Settings → Environment Variables with a Preview tick that can be edited, untick Preview there instead. Then the next push to this branch re-runs the check; it must show `blob=missing`.

Even after that, `VERCEL_OIDC_TOKEN` keeps `blobReady()` true, so preview code will still *try* the Blob store (it should fail without a token or store id and fall back to `/tmp`). Proposal **G** (code guard on `VERCEL_ENV`) is still the belt-and-braces fix.

`api/env-presence.js` (runtime twin) was **not** added: the Hobby plan is at 11 of 12 functions (G23), and the build-time line already answers the question.

## Follow-up 2026-10-08 ~2:32–2:35 AM CT (read-only): did James's env change take effect?
| Check | Result |
|---|---|
| `filter_project_envs` (names + targets, no decrypt), `automate-it-away` | **403 forbidden** again at 02:32:38 CT (`GET /v10/projects/{idOrName}/env`, requestId `iad1:sfo1::cv7qg-1791444758680-21e07763c653`). The error suggested the Vercel CLI instead; not used. Env targets are still **UNKNOWN**. |
| `list_deployments` / `get_deployment`, `automate-it-away` | Production built from main `92a48be` at **02:16:08 CT** (`source: git`), then the **same commit was redeployed at 02:26:30 CT** (`source: redeploy`, READY 02:26:58 CT). Not done by this work. Vercel offers a redeploy after env vars are edited, so this fits an env change in the dashboard, but it does not show which vars changed or to which targets. **Circumstantial only.** |
| Newest `lead-catcher-slice` preview | `4ma1may9l` built at 02:03 CT, **before** any env change, so it can't show one. The commit that adds this section triggers a new preview build (state in the session report). |
| `get_project` | Vercel Authentication still on for previews (`ssoProtection: preview`); password protection off. No env data in this response. |
| Diagnostic on the preview (`/api/health`, `/api/status`) | **Not run, on purpose.** They aren't read-only. `/api/health` calls `save()` whenever a Blob token, store id or OIDC token is present, so it would **write** `aia/store.json` in whichever store the preview reaches, which is production's if Preview still has the Blob token. `/api/status`, and every function that loads `api/_lib.js`, runs `hydrate()` / `ready()` / `persistScrub()`, which can also write. Also, the connector's protected-preview access (`get_access_to_vercel_url` / `web_fetch_vercel_url`) works by creating a share link valid for up to 23 hours, which lets anyone with the link past change D. Not used. |
| Checksum test (production `aia/store.json` before/after one preview GET) | **Not run.** No read-only production endpoint exposes the store or a checksum; production `/api/health` also calls `save()`. There's no safe read-only way to do it today. |

Result at 2:35 AM CT: **whether A/C took effect was UNKNOWN.** Superseded by the check J result above (C took effect; A did not fully).

Ways to settle it (James picks):
- **F.** Run `vercel env ls` in `automate-it-away` (or screenshot Settings → Environment Variables) and share **names and environments only**, never values. That settles A and C directly.
- **J.** *(code, needs approval; not done)* Add a read-only check that doesn't load `api/_lib.js` and returns only true/false for: Blob token present, Blob store id present, AI key present, PIN salt present, and `VERCEL_ENV`. Call it on the new preview (signed in to Vercel, not to AIA) and confirm Blob/secrets show **false**.
- Checksum: James downloads `aia/store.json` from the Blob store in the Vercel dashboard (or notes its size and upload time), we make one signed-out request to the preview, and he checks again. They must match. Do this only after F or J shows Preview has no Blob token, or after B.

## What I could and couldn't see
| Source | Result |
|---|---|
| Vercel `filter_project_envs` (env names + targets), project `automate-it-away`, team `james-oddos-projects` | **403 forbidden** (4 times: the approved A/C attempt at ~2:01 AM CT and the follow-up at 02:32 AM CT). Superseded by check J (build-log presence line), which shows which names Preview has. |
| Vercel `list_integration_configurations` (connected stores / integrations) | **403 forbidden**. UNKNOWN. |
| Vercel `get_project` `automate-it-away` | Read OK. Before 2:01 AM CT: password protection **off**, Vercel Authentication (SSO) **off**, trusted IPs off. After change D: Vercel Authentication **on** (`preview`). Domains include www.automateitaway.com, automateitaway.com. |
| Vercel `get_project` `runtime` | Read OK. Vercel Authentication **on** (`all_except_custom_domains`), password protection off. |
| Vercel docs (cron jobs) | Cron jobs are defined "for production deployments"; deploying to production activates them. |
| Repo code on this branch | Read in full for every env name below (`api/_lib.js`, `api/worker.js`, `api/jobs.js`, `api/upload.js`, `api/_grok.js`, `api/_lc-*.js`, `vercel.json`, `.env.example`). |

## What the code does on a preview request
- Every function that loads `api/_lib.js` (almost all of `api/*.js`, including `api/lead-catcher.js`) runs `hydrate()` once per instance. If **any** of `BLOB_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `AIA_BLOB_TOKEN`, `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN_STORE_ID` or `VERCEL_OIDC_TOKEN` is present, it **reads the shared Blob key `aia/store.json`** (the same key production uses). If that key is empty it **writes** the local seed to it. `persistScrub()` **writes it back** when it finds test jobs.
- `ready()` (called at the start of most requests, including Lead Catcher's sign-in check) re-reads the same key and calls `persistScrub()`. `save()` (sign-in sessions, onboarding, desk edits, worker runs) writes the same key.
- There is **no `VERCEL_ENV` check** anywhere in `api/_lib.js`. So whether a preview touches production data depends only on which env vars and store connections Vercel gives the Preview target. Check J shows the Blob store connection's vars are on Preview.
- Lead Catcher itself keeps its own store (`AIA_LC_STORE_PATH`, default `/tmp`) and MOCK outbox, never calls the shared store's save/Blob (check S01), and refuses every call when `VERCEL_ENV=production`. Its sign-in still goes through AIA's `ready()` above.
- This shared-store behaviour existed before Lead Catcher. Lead Catcher doesn't add or remove it.

## Isolation table
| Surface | Preview config | Evidence | Isolated? | What would make it isolated |
|---|---|---|---|---|
| Shared AIA store (Vercel Blob `aia/store.json`: desks, PINs, sessions, jobs, connections) | Preview **has** `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` and `BLOB_READ_WRITE_TOKEN_STORE_ID` (check J), plus `VERCEL_OIDC_TOKEN` | Check J line; `_lib.js` `blobToken()` uses that name; hydrate/ready/persistScrub/save read and write the same key with no preview check | **NO** (preview can read and write the store) | Blob env vars and the Blob store connection set to **Production only**, plus a code guard so non-production uses a separate key or store (proposals A, B, G) |
| Lead Catcher store and MOCK outbox | `/tmp` per instance (defaults); no env needed | `api/_lc-store.js`; S01 PASS (no shared-store writes, refuses on production) | **YES** | Already isolated. Not durable (G21). |
| Sign-in / auth (PINs, sessions, admin PIN, PIN salt) | `AIA_PIN_SALT` and `AIA_ADMIN_PIN` **missing** on Preview (check J: C took effect; admin PIN sign-in is off on previews); PINs, accounts and sessions still live in the shared store | `_lib.js` hashPin uses `AIA_PIN_SALT` (falls back to a default); `_desk.js` uses `AIA_ADMIN_PIN`; sessions saved via `save()` | **NO** (keys gone, but sign-ins read and write the shared store, row 1) | Store isolation (row 1), and Production-only values for `AIA_PIN_SALT` and `AIA_ADMIN_PIN` (proposal C) |
| Who can open a preview (deployment protection), `automate-it-away` | Vercel Authentication **on** for previews (`preview`), since 2026-10-08 ~2:01 AM CT; password off | `get_project` before/after; `curl -sI` preview → 302 to Vercel login; production domains unchanged (200 / 308 → www) | **YES** (only signed-in team members can open previews) | Done (proposal D). Note: a team member who signs in on a preview still reaches whatever store and keys Preview has (rows above/below). |
| Who can open a preview, `runtime` | Vercel Authentication on, all except custom domains | `get_project` | **YES** | — |
| Scheduled cron (`/api/worker?all=1`, 14:00 and 22:00 UTC) | Defined in `vercel.json` | Vercel docs: crons run on production deployments only | **YES** (scheduled runs) | — |
| Worker endpoint called by hand on a preview (`/api/worker`) | No auth on the endpoint itself; since D, strangers get the Vercel login instead (team members can still call it) | `api/worker.js`: no `CRON_SECRET` check; runs all desks' jobs and POSTs to stored customer webhooks (`pingHooks`); curl 302 on previews | **NO** (strangers blocked by D, but a team member's call runs every desk's jobs from the shared store the preview can reach) | Store isolation, plus a `CRON_SECRET` check and no outbound hooks outside production (proposals A, D, H) |
| Outbound webhooks (`api/jobs.js`, `api/worker.js`) | Hook URLs come from the shared store, which Preview can reach (row 1); no webhook env vars on Preview (check J `webhook=missing`) | `fetch(hook, POST)` in both files | **NO** (follows the shared store) | Same as the row above (proposal H) |
| AI model keys (`XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_GROK_API_KEY`, `AIA_SPACEXAI_API_KEY`, `AIA_LC_MODEL_API_KEY`) | All **missing** on Preview (check J `aiKeys=missing`) | `_grok.js` calls api.x.ai / OpenAI / Anthropic only when a key is set; Lead Catcher model is off by default | **YES** | Production-only, or a separate low-limit preview key (proposal C) |
| Connection-token secret (`AIA_CONNECT_SECRET`, falls back to `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` / `XAI_API_KEY`) | `AIA_CONNECT_SECRET` **missing** on Preview, so preview code falls back to `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, which Preview **has** | `_grok.js`, `connections.js` line 11/14 fallback order | **UNKNOWN** (if production also has no `AIA_CONNECT_SECRET`, both use the same Blob token as the key and a preview could open production's saved connection tokens; production's env isn't checked). Fixed by B. | Production-only value (proposal C) |
| File uploads (`api/upload.js`) | Uses Blob only when plain `BLOB_READ_WRITE_TOKEN` is set, which is **missing** on Preview (check J) | `upload.js` driverOf (line 42) / put (line 83) | **YES** (preview uploads go to `/tmp`) | — |
| .aia registry / web3 keys (`AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`) | All **missing** on Preview (check J `registry=missing`) | `_aia-net.js`, `_aia-tld.js` | **YES** | Done (C) |
| API base URL (`PUBLIC_HOST`) | Hard-coded `https://www.automateitaway.com` | `_lib.js` line 928; hook URLs and links built from it | **NO** (preview builds production links) | Use the preview's own URL outside production (proposal I). Low risk. |
| Integrations / connected stores (Marketplace, Blob store connections) | A Blob store connection still gives Preview `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `_STORE_ID`, `_WEBHOOK_PUBLIC_KEY` (check J) | Check J line; `list_integration_configurations` 403 | **NO** | Proposal B (untick Preview on the store's connection) |
| `runtime` project GoHighLevel adapter (`AIA_GHL_DRY_RUN`) | Target unknown (separate project; check J only covers `automate-it-away`) | `runtime/dist/ghl.js` | **UNKNOWN** | Keep `AIA_GHL_DRY_RUN` unset or not `0` on Preview; GHL credentials Production-only (proposal E) |

Summary of 15 surfaces (updated ~2:50 AM CT after check J): **YES 7** (Lead Catcher store and outbox, `automate-it-away` preview protection, `runtime` preview protection, scheduled crons, AI keys, file uploads, registry keys). **NO 6** (shared store, sign-in/auth, worker called by hand, outbound webhooks, Blob store connection, `PUBLIC_HOST`). **UNKNOWN 2** (connection-token secret fallback, `runtime` GHL). C took effect; A did not fully: the connected Blob store's vars still reach Preview. **Preview sign-in is NOT safe**: signing in on a preview reads and writes the production store (sessions, desks, jobs). Strangers can't open previews (D). Next: James unticks Preview on the Blob store connection (B), the next build's check J line must show `blob=missing`, then the checksum test, then G.

## Env names the code reads (names only; which ones Preview has: see check J above)
Shared store: `BLOB_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_STORE_ID`, `AIA_BLOB_TOKEN`, `AIA_STORE_PATH`, `AIA_UPLOAD_DIR`; system `VERCEL_OIDC_TOKEN`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`.
Auth: `AIA_PIN_SALT`, `AIA_ADMIN_PIN`. Secrets: `AIA_CONNECT_SECRET`, `AIA_FAKE_SECRET_TOKEN` (test only).
AI: `XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_GROK_MODEL`; Lead Catcher `AIA_LC_MODEL_ENABLED`, `AIA_LC_MODEL_ENDPOINT`, `AIA_LC_MODEL_NAME`, `AIA_LC_MODEL_API_KEY`.
Registry: `AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`, `AIA_TLD_PROBE`.
Lead Catcher: `AIA_LC_STORE_PATH`, `AIA_LC_OUTBOX_PATH`, `AIA_LC_APPROVAL_TTL_MIN`, `AIA_LC_RESULTS_JSON` (tests only).
runtime project: `AIA_GHL_DRY_RUN`, `AIA_RUNTIME_PORT`.

## Proposed changes (D done; C done (check J); A partly: the store connection's vars remain, see B; J done; the rest await James)
Vercel settings (James, in the Vercel dashboard):
- **A.** *(Approved. Check J at 2:50 AM CT: plain `BLOB_READ_WRITE_TOKEN` is off Preview, but `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY` are still on Preview; finish via B.)* `automate-it-away` → Settings → Environment Variables. For `BLOB_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_STORE_ID` and `AIA_BLOB_TOKEN` (whichever exist), set the environments to **Production only**: untick Preview and Development.
- **B.** *(Now the key step.)* Storage → the Blob store connected to `automate-it-away` → Projects → set its environments to **Production only** (untick Preview and Development). This removes the three `BLOB_READ_WRITE_TOKEN_*` vars from Preview. Optional: create a separate free Blob store (e.g. `aia-preview`) connected to **Preview only**.
- **C.** *(Done: check J shows every one of these missing on Preview.)* Same env page. Set these to **Production only**: `XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_LC_MODEL_API_KEY`, `AIA_CONNECT_SECRET`, `AIA_PIN_SALT`, `AIA_ADMIN_PIN`, `AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`. If previews need any of them, add **separate preview-only values**.
- **D.** *(DONE 2026-10-08 ~2:01 AM CT, `ssoProtection: preview`.)* `automate-it-away` → Settings → Deployment Protection → turn on **Vercel Authentication**, Standard Protection (previews need a Vercel login; production custom domains stay public).
- **E.** `runtime` → env vars. Keep GoHighLevel credentials Production only, and make sure `AIA_GHL_DRY_RUN` is not set to `0` for Preview.
- **F.** Give the Vercel connector read access to env var names and integrations, **or** run `vercel env ls` yourself and share the names and targets only (no values), so the UNKNOWN rows can be settled.

Code (a separate small PR, only if James approves; it changes shared AIA code, not Lead Catcher):
- **G.** `api/_lib.js`: when `VERCEL_ENV` is not `production`, use a separate Blob key (e.g. `aia-preview/store.json`) and never write `aia/store.json`.
- **H.** `api/worker.js`: require `Authorization: Bearer $CRON_SECRET` (Vercel sends it on cron calls), and skip outbound webhooks (`pingHooks`, `api/jobs.js` hook POST) outside production.
- **I.** `PUBLIC_HOST`: outside production, use the deployment's own URL.
- **J.** *(DONE 2026-10-08 ~2:48 AM CT, approved by James.)* `scripts/env-presence.js` as the preview build step, names/booleans only; `scripts/check-env-presence.js` E01–E14.

How to confirm afterwards (G22 / L3 acceptance): when the check J line on a new preview build shows `blob=missing` (after B), take a checksum of the production `aia/store.json` before and after one signed-out preview request. They must match. Only then may anyone sign in on a preview.

Isolation recheck 2026-10-08 ~3:30 AM CT after Blob store Preview/Development unticked (James, store connection for `automate-it-away`): this commit triggers a new preview build; result of its check J line recorded below once read.
