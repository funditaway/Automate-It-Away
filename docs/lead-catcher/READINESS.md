# Lead Catcher — Go-Live Readiness (Track lc3)

DRAFT for James's review, 2026-10-08 (written ~10:00 AM CT against branch `lead-catcher-slice` at `c7faa5d`; main was `78548bc`). Not legal advice. This file only reports what the evidence in this folder shows. It doesn't approve anything.

## (a) Verdict

**Ready for a supervised demo on the local test build with made-up data. NOT ready for a paying client, real customer data or live sending.**

Why: every Lead Catcher check passes locally on test data, sending only goes to a test outbox, and payments are off. But the checks have never been run on the hosted preview, no live channel exists (T12 not run), the data store is temporary, terms and the data note haven't had legal review, and the go-live decisions below are still open.

## (b) Launch gates

Status words: **READY** = passed, with the evidence named. **BLOCKED** = can't pass until work or a decision (usually James's) is done. **NOT RUN** = the check is defined but nobody has run it. Simulated or mocked results are never counted as READY for a live gate.

| # | Gate | Status | Evidence / test id | Notes |
|---|---|---|---|---|
| 1 | Lead Catcher checks pass on the test build (local) | READY | TEST_RESULTS.md; evidence/check-lead-catcher.txt, check-results.json (T01–T15, P01–P05, S01, Q01–Q04, W01–W07) | PASS 31 · FAIL 0 · NOT RUN 1 (T12). Local handler, test data only. |
| 2 | Checks catch broken code (mutation check) | READY | evidence/mutations.txt | 56 of 56 caught. |
| 3 | Local demo walk-through works end to end | READY | evidence/local-smoke.txt; business/DEMO_SCRIPT.md (draft) | Local dev preview only, made-up desks (riverbend-demo / northside-test). |
| 4 | Nothing reaches a real customer (test outbox only) | READY | T06–T09, T15, W05 PASS; SPEC §5, §10 | Sending writes to a MOCK outbox labelled "MOCK — NOT SENT". This is a safety gate, not a live channel. |
| 5 | Lead Catcher refuses to run on the live site | READY | S01 PASS; api/lead-catcher.js / api/_lc-store.js | API refuses when `VERCEL_ENV=production`. Code and local test, not tried on production. |
| 6 | One business can't see another's cards | READY | T13, T04 PASS | Local test data. Must be repeated on the client's hosted desk (gate 21). |
| 7 | Payments stay off (no charge, Collect off) | READY | P01, P02 PASS; register L6 | Pack price 0, `charged: false`. Draft prices exist in docs only. |
| 8 | No new failures in the whole repo vs main | READY | PROGRESS_MANIFEST "Test results" (~5:15 AM CT) | Main `542d0fe` 31/81 scripts pass, branch 33/83. Main's own `npm test` is red (50 old failures, G24). Not re-run on main `78548bc`. |
| 9 | Vercel function limit not exceeded | READY | G23; branch has 11 `api/` functions; preview builds READY | 11 of 12 on the Hobby plan. One left. |
| 10 | No data-store keys or secrets on Preview builds | READY | PREVIEW_ISOLATION.md check J (`blob=missing` in the preview build log); E01–E14 PASS 25 / FAIL 0 | Names only, values never printed. |
| 11 | Code refuses the shared AIA store off production (fix G) | READY | check-store-guard 79 PASS / 0 FAIL, 6/6 mutations; production `/api/health` 05:09 CT `store.driver: "shared"` | Mocked-env tests plus one real production read. |
| 12 | A preview function is shown unable to reach production data at runtime | NOT RUN | PREVIEW_ISOLATION.md "Fix G in this branch" | By design no preview API was called. Needs approval 4. |
| 13 | Lead Catcher checks run against the hosted preview (L1) | NOT RUN | register L1 | Needs approval 4 (sign-in on a preview). |
| 14 | Preview links point at the preview, not the live site (`PUBLIC_HOST`) | BLOCKED | PREVIEW_ISOLATION.md row `PUBLIC_HOST` = NO; G28 | See section (d). |
| 15 | `runtime` project can't reach GoHighLevel from a preview | NOT RUN | PREVIEW_ISOLATION.md row `runtime` GHL = UNKNOWN; G29 | See section (d). |
| 16 | Durable, separate data store for Lead Catcher (L3) | BLOCKED | G21 | Today `/tmp`: temporary, one per server instance. Needs approval 10. |
| 17 | First live channel set up and tested (T12, L2) | NOT RUN | T12 NOT RUN; G03, G04 | No channel chosen. Needs approvals 2 and 3. |
| 18 | Public intake has rate and size limits | BLOCKED | G25 (not built) | Only a per-desk hashed key today. |
| 19 | Retention, export and deletion (and backups) | BLOCKED | G26 (not built); PRIVACY_NOTE §6 placeholders | Needs legal review first (approval 8). |
| 20 | Error monitoring and alerts | BLOCKED | G27 (not built) | Depends on the durable store (G21). |
| 21 | SOW acceptance checks on the client's hosted desk | NOT RUN | business/SOW.md §6 | Needs a client, a hosted desk and a live channel. |
| 22 | Self-approval rule decided and enforced | BLOCKED | G09; SOW §5 open questions | Today an Approver can Yes their own draft, and a Responder can Run someone else's Yes. Approval 6. |
| 23 | Terms reviewed by a qualified lawyer (L4) | BLOCKED | G33 | Terms aren't drafted. Proposal/SOW carry placeholders. Approval 8. |
| 24 | Data-handling note reviewed | BLOCKED | G34; business/PRIVACY_NOTE.md (DRAFT outline) | Approval 8. |
| 25 | Business drafts reviewed by James (proposal, SOW, staff guide, training, demo, workbook) | NOT RUN | G30–G32, G40, G41, G51 (all draft) | Care Plan scope open (approval 7). |
| 26 | Name check on "Lead Catcher" | NOT RUN | G43 | Approval 9. |
| 27 | Staff training sign-off on the client's desk | NOT RUN | business/TRAINING.md checklist | Needs a client. |
| 28 | PR #295 merged to main | BLOCKED | PR #295: open, draft, GitHub shows mergeable `clean` (read ~10:00 AM CT) | Approval 1. |
| 29 | James's explicit Yes to go live for one client (L5) | BLOCKED | register L5 | Waits on every gate above. |

**Counts: READY 11 · BLOCKED 10 · NOT RUN 8 (29 gates).** The 11 READY gates cover the test build and safety guards. None of them is a live-client gate.

## (c) Approvals needed from James

Each item needs your explicit Yes before the live action it unlocks. Until then, the default applies.

1. **Merge PR #295 into main.**
   - Unlocks: Lead Catcher code on main and the live build. The page would ship, but its API refuses to run on production (gate 5).
   - Risk if wrong: shared AIA files change on the live site (`package.json` test chain and `vercel-build` step, `vercel.json` rewrites, `api/_packs.js`, `desk-nav.js` Queue loader, `packs-you-own.js`), and the 12-function headroom drops to 1 on production.
   - Recommended default: **No for now.** Keep it a draft until the hosted-preview checks (gate 13) pass.
2. **First live channel (email, text or phone) and who pays its fees.**
   - Unlocks: G03/G04, T12 and the cost line in the proposal (G52).
   - Risk if wrong: real messages to real people, provider costs nobody agreed to, and consent and opt-out rules (flagged for legal review in PRIVACY_NOTE) not handled.
   - Recommended default: **Hold.** When you choose, pick one channel, start in the provider's sandbox and list every fee in the proposal before deciding "included" or "client-paid".
3. **An authorized test recipient for T12.**
   - Unlocks: running T12 against the live channel.
   - Risk if wrong: a message reaches someone who didn't agree to receive it.
   - Recommended default: an address or number you control, named in writing. Nobody else.
4. **Signing in on a hosted preview.**
   - Unlocks: gates 12 and 13 (hosted checks, runtime isolation proof) and a demo on the hosted preview.
   - Risk if wrong: if the guard somehow failed, a preview could touch production data. The guard is proven by code, mocked tests and build logs, not yet by a live preview call.
   - Recommended default: **Yes, limited:** Vercel team login only, a test desk created on the preview (it starts from an empty store), no production PINs, and one before/after check of the production store.
5. **Real customer data.**
   - Unlocks: a pilot with a real business.
   - Risk if wrong: data lost when a server instance restarts (`/tmp`), no export or delete, and a data note nobody has reviewed.
   - Recommended default: **No** until gates 16, 19 and 24 are done.
6. **Approver self-approval rule** (and whether a Responder may Run someone else's Yes).
   - Unlocks: G09 and the matching line in the SOW and staff guide.
   - Risk if wrong: too strict blocks one-person offices; too loose lets one person write, approve and send alone.
   - Recommended default: keep today's behavior for the pilot (allowed, every Yes recorded with name and seat), say so in the SOW and revisit if the client has two or more Approvers.
7. **Care Plan scope.**
   - Unlocks: a final PROPOSAL §5 and SOW.
   - Risk if wrong: unpaid ongoing work, or promises the build can't keep.
   - Recommended default: keep the draft scope with a monthly hours cap, using workbook row 28 (break-even hours) once your real costs are in. The Care Plan stays opt-in.
8. **Legal review of terms and the data note.**
   - Unlocks: G33, G34 and L4, so the proposal, SOW and data note can go to a client.
   - Risk if wrong: client-facing promises nobody has reviewed.
   - Recommended default: **No client-facing document goes out** until a qualified lawyer has reviewed it.
9. **Name check on "Lead Catcher".**
   - Unlocks: public use of the name (sales page, proposal).
   - Risk if wrong: renaming later, or a dispute over the name.
   - Recommended default: run a search before any public use. Keep the name internal until then.
10. **Durable store choice.**
    - Unlocks: G21, T10 across two server instances, and then monitoring (G27) and retention tools (G26).
    - Risk if wrong: Lead Catcher data mixed into the shared AIA store, unexpected cost or lost data.
    - Recommended default: a store used only by Lead Catcher (the register lists a separate Blob store or Postgres with per-desk rows), never the shared AIA Blob store. Check the free-tier limits first.
11. **Pack ownership on the AIA account record, and several packs per desk.**
    - Unlocks: G06 and G07 (removes the workarounds).
    - Risk if wrong: changes AIA's core account and desk model, which affects every desk, not just Lead Catcher.
    - Recommended default: keep the workarounds for the pilot and plan this as its own reviewed change later.
12. **Publishing the sales page.**
    - Unlocks: G40 going public.
    - Risk if wrong: public prices and claims before review.
    - Recommended default: **No** until approvals 8 and 9 are done. It stays noindex with no Buy link.
13. **Any charge or Collect.**
    - Unlocks: taking money inside the product.
    - Risk if wrong: charging without a reviewed agreement.
    - Recommended default: **stays HOLD.** Any payment needs its own review and its own Yes.

## (d) Remaining NO / UNKNOWN from preview isolation

The preview-isolation tally is **YES 13 / NO 1 / UNKNOWN 1** (PREVIEW_ISOLATION.md, ~5:25 AM CT).

- **NO — `PUBLIC_HOST`** (G28, proposal I). `api/_lib.js` hard-codes `https://www.automateitaway.com` (line 949 at `c7faa5d`), so a preview builds webhook URLs and links that point at the live site.
  - Fix: outside production, use the deployment's own URL. This is a small change in shared AIA code, so build it like fix G: its own branch and draft PR with a test and your go. Low risk, but anything that follows a preview link today lands on the live site.
- **UNKNOWN — `runtime` project GoHighLevel** (G29, proposal E). The code sends for real only when `AIA_GHL_DRY_RUN` is exactly `0` (`runtime/src/ghl.ts` line 93, `runtime/src/server.ts` line 77). Unset means dry run. We couldn't check that project's Preview settings, because env listing returns 403 and isn't retried.
  - Fix: you check in the Vercel dashboard (names and targets only) that `AIA_GHL_DRY_RUN` isn't `0` for Preview and that the GoHighLevel credentials are Production-only.
  - Optional code fix: force dry run whenever `VERCEL_ENV` isn't `production`, like fix G.

## (e) Recommended order of next steps

1. James reviews this file and the business drafts (gate 25), and decides approvals 6 and 7.
2. Approval 4 (sign-in on a hosted preview), then run the checks on the preview and do one before/after production-store check (gates 12, 13).
3. Close the isolation leftovers: fix `PUBLIC_HOST` on its own branch (G28), and James checks the `runtime` Preview setting (G29).
4. Approval 10 (store choice), then build the durable store and pass T10 across two instances (G21). Then monitoring (G27) and rate limits (G25).
5. Approvals 8 and 9 (legal review, name check), then retention, export and delete (G26) as the review requires.
6. Approvals 2 and 3 (channel, fees, test recipient), then T12 in the provider's sandbox.
7. Approval 1 (merge PR #295) once gates 13 and 16 pass.
8. With one client: SOW acceptance checks and staff training on their hosted desk (gates 21, 27). Only then approval 5 (real data) and James's go-live Yes for that client (gate 29).
9. Approval 12 (publish the sales page) only after step 5. Approval 13 (charges) stays HOLD throughout.
