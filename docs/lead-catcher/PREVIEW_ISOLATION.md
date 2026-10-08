# Lead Catcher — Preview Isolation Evidence

First checked 2026-10-08 ~1:30 AM CT (read-only). Updated 2026-10-08 ~2:01 AM CT after James approved changes **D** and **A/C**, again ~2:35 AM CT after James was sent the Vercel env-vars link for A/C, ~2:50 AM CT with the result of check **J** (what Preview actually has; below), ~3:35 AM CT with the **recheck after B** (James unticked Preview and Development on the Blob store connection; below), and ~3:58 AM CT with the **checksum test** (below). Env vars are listed by name and target only, never values.

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

## Recheck after B, 2026-10-08 ~3:30 AM CT: Blob store vars gone from Preview
James unticked **Preview** and **Development** on the Blob store's project connection for `automate-it-away` (proposal **B**), keeping Production. To re-run check J, a doc-only commit (`913e3f9`, the recheck line at the end of this file) was pushed to `lead-catcher-slice` with the GitHub connector. Nothing else was changed: no env var, setting or code; no request to any preview; no share link or bypass token; the env listing (403) was not retried; production was not touched.

Preview build `dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta` (`automate-it-away-idjcwoojq-…vercel.app`, commit `913e3f9`, build `bld_doabltyrd`, built 03:29:32–03:29:52 CT, **READY**), read from the build log with `list_deployment_events` (read-only). `vercel-build` ran 11 times in this build; all 11 lines are identical:

```
AIA_ENV_PRESENCE env=preview blob=missing pinSalt=missing adminPin=missing session=missing connectSecret=missing aiKeys=missing registry=missing webhook=missing cron=missing ghl=missing other=present system=present presentNames=FAKEROOTKEY,NEXT_PRIVATE_MULTI_PAYLOAD,VERCEL_ARTIFACTS_TOKEN,VERCEL_DEPLOYMENT_KEY,VERCEL_ENV_ENC_KEY,VERCEL_EVAL_LAMBDA_GROUPING_RATIO,VERCEL_HASH_SALT,VERCEL_OIDC_TOKEN
```

| Group | Check J, 2:50 AM CT (`7b701b9`) | Recheck after B, 3:29 AM CT (`913e3f9`) |
|---|---|---|
| `blob` (any `BLOB_*` / `AIA_BLOB_*` name) | **present**: `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY` | **missing**: no `BLOB_*` or `AIA_BLOB_*` name at all |
| `pinSalt`, `adminPin`, `session`, `connectSecret`, `aiKeys`, `registry`, `webhook`, `cron`, `ghl` | missing | missing (unchanged) |
| `system`, `other` | present | present, same names (unchanged; Vercel build vars and build machine, not project env vars) |

What this shows: **B took effect.** The Blob store connection no longer gives the Preview build its token, store id or webhook key. With A and C, no Blob or secret project env var reaches the Preview build.

What it does **not** show (not proven yet):
- `VERCEL_OIDC_TOKEN` is still present (Vercel sets it on every build), so `blobReady()` in `api/_lib.js` is still true and preview code still *tries* the Blob store in hydrate/ready/persistScrub/save. With no token and no store id it should fail and fall back to `/tmp`, but that is from reading the code, not a test. The check J assumption (Preview build env = Preview runtime env) still applies.
- **Checksum test:** NOT RUN at ~3:35 AM CT; run 3:37–3:55 AM CT, see "Checksum test" below (PASS as defined, but no preview code ran).
- Proposal **G** (code guard on `VERCEL_ENV`) is still not done. *(~4:40 AM CT: built on branch `preview-store-guard`, not merged; see "Fix G built" below.)*

## Checksum test 2026-10-08 ~3:37–3:55 AM CT
Method: James reads `aia/store.json` in Blob store `automate-it-away-blob` (Vercel dashboard), we send one signed-out GET of `/` to the `blob=missing` preview `automate-it-away-idjcwoojq-…vercel.app` (`dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta`), James re-checks. Runtime logs (Vercel connector `get_runtime_logs`, read-only) show who could have written in between. ETags shown by prefix/suffix only.

| Time (CT) | Event | Evidence |
|---|---|---|
| ~03:37 | Baseline: 960 kB, last modified "about 1 hour ago", ETag `ca16b917308…17` | James's screenshot |
| 03:37:47 | One signed-out GET `/` on the preview: **302** to `vercel.com/sso-api` | curl; stopped by Vercel Authentication (D), never reached the app |
| 03:40:56 | Production GET `/api/desks` | runtime log, `dpl_CeKCG93zMkWwdgp9gDxvvdLf1y4x` (production, main `e661a62`), domain `www.automateitaway.com` |
| 03:41:35–03:41:36 | Production POST `/api/admin` ×2 | same; most `/api/admin` POST actions call `save()` (the action isn't in the log) |
| 03:41:37 | Production GET `/api/connections`, GET `/api/health` | same; `/api/health` (`health()` in main's `api/health.js`) calls `save()` whenever `blobReady()`, so it **re-writes `aia/store.json`** on every call |
| 03:42:25 | New production deployment `dpl_5cpfa9P43r6UFZpwubPnpJK3Pf8K` (main `1ecee9b`), not by this work | `list_deployments`; main has no build script, so the build doesn't touch the store |
| 03:48 | Re-check: 960 kB, ETag `ca16b917308…17` (**same**), last modified "6 minutes ago" (~03:42) | James's screenshot |
| 03:50:08 | Rerun: one signed-out GET `/` on the same preview: **302** to `vercel.com/sso-api` | curl |

Runtime logs:
- **Preview invocations: 0.** `dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta` and `dpl_5WZcYLNyBtX2Zhr4rC7aCvzewyv8`, 03:25–03:55 CT: no entries. All preview deployments of the project, same window: no entries.
- Production, 03:25–03:55 CT: only the 5 requests above (03:40:56–03:41:37), all on `www.automateitaway.com`. User agents aren't in the runtime log output, so who sent them is not known (not this work). Rerun window 03:48:08–03:55:08 CT: **no entries** at all.

Verdict: **PASS as defined** (content unchanged by size and ETag; the ~03:42 re-save lines up with production `/api/health` at 03:41:37, which always saves, and/or the two `/api/admin` POSTs; zero preview invocations). Limits:
- The runtime log output lists requests that printed something. Every production entry here is Node's `DEP0169` warning, which each `api/*.js` instance printed, so a preview function call would very likely have shown up too, but it is not a full request log. "6 minutes ago" is coarse (about 03:41–03:42).
- **What it does not prove:** both test requests got the Vercel login (D), and `/` is a static page anyway, so no preview code ran. It shows a signed-out visitor can't make a preview touch the store. It does not show that preview functions, which still `blobReady()` via `VERCEL_OIDC_TOKEN`, can't reach it. The shared-store row stays **UNKNOWN**; the tally is unchanged.
- To settle that row (needs James's go-ahead; not done): someone signed in to Vercel (not to AIA) makes one GET to a preview API route that loads `api/_lib.js` (not `/api/health`, which always saves), with James's before/after and the same log read. The preview log must show the call, and the last modified time must not move except at logged production requests. Or do G.

## Fix G built 2026-10-08 ~4:40 AM CT (not merged)
Approved by James. Built on its own branch `preview-store-guard` (head `1167dd4`, based on main `1ecee9b`), separate from this branch. The shared Blob store `aia/store.json` is usable only when `VERCEL_ENV` is exactly `production`. Everywhere else, `blobReady()` and every Blob read/write/upload path refuse, even with `VERCEL_OIDC_TOKEN` or `BLOB_*` present, and fall back to the existing file store (`api/data` or `/tmp`). This replaces the separate preview Blob key in proposal G below with no Blob at all off production. Local tests (mocked env, no network): `scripts/check-store-guard.js` 79 PASS / 0 FAIL, 6/6 mutations caught; no newly failing scripts vs main. The preview build `dpl_7SJJZcyLpgcqn8RazE3L2VbWZdzT` is READY; its API endpoints were not called. **Not merged, not on production.** The shared-store row (and the rows waiting on it) can move to **YES** only once G is merged and verified: production `/api/health` still shows `store.driver: "shared"`, and a preview function shows it can't reach the store. **The tally is unchanged.**

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
| Shared AIA store (Vercel Blob `aia/store.json`: desks, PINs, sessions, jobs, connections) | Since B (recheck ~3:30 AM CT): **no** Blob token, store id or other `BLOB_*` var on Preview; `VERCEL_OIDC_TOKEN` still present. (Check J at 2:50 AM CT had `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` and `BLOB_READ_WRITE_TOKEN_STORE_ID`.) | Recheck line `blob=missing` (`dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta`); `_lib.js` `blobReady()` is still true via `VERCEL_OIDC_TOKEN`, so hydrate/ready/persistScrub/save still *try* the Blob store with no preview check; without a token or store id they should fail (code reading, not tested) | **UNKNOWN** (was NO; the credentials are gone; checksum test 3:37–3:55 AM CT PASS as defined, but its requests got the Vercel login and ran no preview code, so no-access is not proven) | A preview request that actually runs a function loading `api/_lib.js` (signed in to Vercel, not AIA) with no store write (see "Checksum test"), or the code guard (proposal G). A and B done. |
| Lead Catcher store and MOCK outbox | `/tmp` per instance (defaults); no env needed | `api/_lc-store.js`; S01 PASS (no shared-store writes, refuses on production) | **YES** | Already isolated. Not durable (G21). |
| Sign-in / auth (PINs, sessions, admin PIN, PIN salt) | `AIA_PIN_SALT` and `AIA_ADMIN_PIN` **missing** on Preview (check J: C took effect; admin PIN sign-in is off on previews); PINs, accounts and sessions still live in the shared store | `_lib.js` hashPin uses `AIA_PIN_SALT` (falls back to a default); `_desk.js` uses `AIA_ADMIN_PIN`; sessions saved via `save()` | **UNKNOWN** (was NO; keys gone; sign-ins touch the production store only if the preview can still reach it, row 1, not yet tested) | Store isolation (row 1), and Production-only values for `AIA_PIN_SALT` and `AIA_ADMIN_PIN` (proposal C) |
| Who can open a preview (deployment protection), `automate-it-away` | Vercel Authentication **on** for previews (`preview`), since 2026-10-08 ~2:01 AM CT; password off | `get_project` before/after; `curl -sI` preview → 302 to Vercel login; production domains unchanged (200 / 308 → www) | **YES** (only signed-in team members can open previews) | Done (proposal D). Note: a team member who signs in on a preview still reaches whatever store and keys Preview has (rows above/below). |
| Who can open a preview, `runtime` | Vercel Authentication on, all except custom domains | `get_project` | **YES** | — |
| Scheduled cron (`/api/worker?all=1`, 14:00 and 22:00 UTC) | Defined in `vercel.json` | Vercel docs: crons run on production deployments only | **YES** (scheduled runs) | — |
| Worker endpoint called by hand on a preview (`/api/worker`) | No auth on the endpoint itself; since D, strangers get the Vercel login instead (team members can still call it) | `api/worker.js`: no `CRON_SECRET` check; runs all desks' jobs and POSTs to stored customer webhooks (`pingHooks`); curl 302 on previews | **UNKNOWN** (was NO; strangers blocked by D; a team member's call runs every desk's jobs from whatever store the preview reaches, which follows row 1) | Store isolation, plus a `CRON_SECRET` check and no outbound hooks outside production (proposals A, D, H) |
| Outbound webhooks (`api/jobs.js`, `api/worker.js`) | Hook URLs come from whichever store Preview reaches (row 1, UNKNOWN since B); no webhook env vars on Preview (check J `webhook=missing`) | `fetch(hook, POST)` in both files | **UNKNOWN** (was NO; follows row 1) | Same as the row above (proposal H) |
| AI model keys (`XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_GROK_API_KEY`, `AIA_SPACEXAI_API_KEY`, `AIA_LC_MODEL_API_KEY`) | All **missing** on Preview (check J `aiKeys=missing`) | `_grok.js` calls api.x.ai / OpenAI / Anthropic only when a key is set; Lead Catcher model is off by default | **YES** | Production-only, or a separate low-limit preview key (proposal C) |
| Connection-token secret (`AIA_CONNECT_SECRET`, falls back to `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` / `XAI_API_KEY`) | Since B (recheck), `AIA_CONNECT_SECRET`, `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` and `XAI_API_KEY` are all **missing** on Preview, so preview code falls back to the built-in default `aia-draft-pilot` | `_grok.js`, `connections.js` line 11/14 fallback order; recheck line | **YES** (was UNKNOWN; the preview key can no longer be the Blob token. Caveat: production's env isn't readable (403); only if production had none of the three would it use the same default, which would be a production problem in itself) | Production-only value (proposal C) |
| File uploads (`api/upload.js`) | Uses Blob only when plain `BLOB_READ_WRITE_TOKEN` is set, which is **missing** on Preview (check J) | `upload.js` driverOf (line 42) / put (line 83) | **YES** (preview uploads go to `/tmp`) | — |
| .aia registry / web3 keys (`AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`) | All **missing** on Preview (check J `registry=missing`) | `_aia-net.js`, `_aia-tld.js` | **YES** | Done (C) |
| API base URL (`PUBLIC_HOST`) | Hard-coded `https://www.automateitaway.com` | `_lib.js` line 928; hook URLs and links built from it | **NO** (preview builds production links) | Use the preview's own URL outside production (proposal I). Low risk. |
| Integrations / connected stores (Marketplace, Blob store connections) | Since B (recheck ~3:30 AM CT) the Blob store connection gives Preview **no** vars (`blob=missing`); check J at 2:50 AM CT showed `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `_STORE_ID`, `_WEBHOOK_PUBLIC_KEY` | Recheck line (`dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta`); `list_integration_configurations` 403 (the connection settings themselves were not read) | **YES** (was NO; build-log evidence) | Done (proposal B, by James) |
| `runtime` project GoHighLevel adapter (`AIA_GHL_DRY_RUN`) | Target unknown (separate project; check J only covers `automate-it-away`) | `runtime/dist/ghl.js` | **UNKNOWN** | Keep `AIA_GHL_DRY_RUN` unset or not `0` on Preview; GHL credentials Production-only (proposal E) |

Summary of 15 surfaces (updated ~3:35 AM CT after the recheck after B; unchanged by the checksum test at ~3:58 AM CT): **YES 9** (Lead Catcher store and outbox, `automate-it-away` preview protection, `runtime` preview protection, scheduled crons, AI keys, connection-token secret, file uploads, registry keys, Blob store connection). **NO 1** (`PUBLIC_HOST`). **UNKNOWN 5** (shared store, sign-in/auth, worker called by hand, outbound webhooks: all four wait on proof that preview code can't reach the store; plus `runtime` GHL). Was YES 7 / NO 6 / UNKNOWN 2 at ~2:50 AM CT. A, B and C took effect: no Blob or secret project env var reaches the Preview build. **Preview sign-in is still NOT cleared**: `VERCEL_OIDC_TOKEN` keeps preview code trying the Blob store, and that it can't get in is not yet tested. Checksum test 3:37–3:55 AM CT: PASS as defined (ETag unchanged, the ~03:42 re-save lines up with production requests, 0 preview invocations), but no preview code ran, so the tally is unchanged. Strangers can't open previews (D). Next: a Vercel-signed-in preview function request with before/after (James's call), or G.

## Env names the code reads (names only; which ones Preview has: see check J above)
Shared store: `BLOB_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_STORE_ID`, `AIA_BLOB_TOKEN`, `AIA_STORE_PATH`, `AIA_UPLOAD_DIR`; system `VERCEL_OIDC_TOKEN`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`.
Auth: `AIA_PIN_SALT`, `AIA_ADMIN_PIN`. Secrets: `AIA_CONNECT_SECRET`, `AIA_FAKE_SECRET_TOKEN` (test only).
AI: `XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_GROK_MODEL`; Lead Catcher `AIA_LC_MODEL_ENABLED`, `AIA_LC_MODEL_ENDPOINT`, `AIA_LC_MODEL_NAME`, `AIA_LC_MODEL_API_KEY`.
Registry: `AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`, `AIA_TLD_PROBE`.
Lead Catcher: `AIA_LC_STORE_PATH`, `AIA_LC_OUTBOX_PATH`, `AIA_LC_APPROVAL_TTL_MIN`, `AIA_LC_RESULTS_JSON` (tests only).
runtime project: `AIA_GHL_DRY_RUN`, `AIA_RUNTIME_PORT`.

## Proposed changes (D done; C done (check J); A and B done (recheck ~3:30 AM CT, `blob=missing`); J done; the rest await James)
Vercel settings (James, in the Vercel dashboard):
- **A.** *(Approved. Check J at 2:50 AM CT: plain `BLOB_READ_WRITE_TOKEN` is off Preview, but `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY` are still on Preview; finish via B. Recheck after B at ~3:30 AM CT: `blob=missing`, done.)* `automate-it-away` → Settings → Environment Variables. For `BLOB_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, `BLOB_READ_WRITE_TOKEN_STORE_ID`, `BLOB_STORE_ID` and `AIA_BLOB_TOKEN` (whichever exist), set the environments to **Production only**: untick Preview and Development.
- **B.** *(DONE by James before 3:29 AM CT; the recheck shows `blob=missing` on Preview.)* Storage → the Blob store connected to `automate-it-away` → Projects → set its environments to **Production only** (untick Preview and Development). This removes the three `BLOB_READ_WRITE_TOKEN_*` vars from Preview. Optional: create a separate free Blob store (e.g. `aia-preview`) connected to **Preview only**.
- **C.** *(Done: check J shows every one of these missing on Preview.)* Same env page. Set these to **Production only**: `XAI_API_KEY`, `GROK_API_KEY`, `AIA_GROK_KEY`, `AIA_LC_MODEL_API_KEY`, `AIA_CONNECT_SECRET`, `AIA_PIN_SALT`, `AIA_ADMIN_PIN`, `AIA_DOT_AIA_KEY`, `AIA_REGISTRY_KEY`, `AIA_WEB3_KEY`. If previews need any of them, add **separate preview-only values**.
- **D.** *(DONE 2026-10-08 ~2:01 AM CT, `ssoProtection: preview`.)* `automate-it-away` → Settings → Deployment Protection → turn on **Vercel Authentication**, Standard Protection (previews need a Vercel login; production custom domains stay public).
- **E.** `runtime` → env vars. Keep GoHighLevel credentials Production only, and make sure `AIA_GHL_DRY_RUN` is not set to `0` for Preview.
- **F.** Give the Vercel connector read access to env var names and integrations, **or** run `vercel env ls` yourself and share the names and targets only (no values), so the UNKNOWN rows can be settled.

Code (a separate small PR, only if James approves; it changes shared AIA code, not Lead Catcher):
- **G.** `api/_lib.js`: when `VERCEL_ENV` is not `production`, use a separate Blob key (e.g. `aia-preview/store.json`) and never write `aia/store.json`. *(Approved ~4:01 AM CT; built on branch `preview-store-guard` as "no Blob off production", not merged; see "Fix G built".)*
- **H.** `api/worker.js`: require `Authorization: Bearer $CRON_SECRET` (Vercel sends it on cron calls), and skip outbound webhooks (`pingHooks`, `api/jobs.js` hook POST) outside production.
- **I.** `PUBLIC_HOST`: outside production, use the deployment's own URL.
- **J.** *(DONE 2026-10-08 ~2:48 AM CT, approved by James.)* `scripts/env-presence.js` as the preview build step, names/booleans only; `scripts/check-env-presence.js` E01–E14.

How to confirm afterwards (G22 / L3 acceptance): when the check J line on a new preview build shows `blob=missing` (after B), take a checksum of the production `aia/store.json` before and after one signed-out preview request. They must match. Only then may anyone sign in on a preview. Status ~3:58 AM CT: the first part is met (`blob=missing`, `dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta`); the checksum test ran 3:37–3:55 AM CT and **PASSES as defined** (see "Checksum test"), but its requests never reached preview code, so preview sign-in is not treated as cleared here; James decides.

Isolation recheck 2026-10-08 ~3:30 AM CT after Blob store Preview/Development unticked (James, store connection for `automate-it-away`): commit `913e3f9` triggered preview build `dpl_HuTgcAaYiZMf2bDnYpSftUX4eHta`; its check J line shows `blob=missing` (see "Recheck after B" above). Checksum test NOT RUN at that point; run 3:37–3:55 AM CT (see "Checksum test" above).
