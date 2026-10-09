# Lead Catcher — Progress Manifest (updated 2026-10-08)

Branch `lead-catcher-slice` on `funditaway/Automate-It-Away`, originally based on main `798f269`. **Since 2026-10-08 ~5:18 AM CT it includes current main `542d0fe` (fix G: only production may use the shared Blob store), via merge commit `e1e5ec0` + `package.json` resolution `2854c05`.** Main is untouched by this work; it has since moved to `78548bc` (4 commits not in this branch; a local test merge is clean). **Go-live readiness: see READINESS.md** (supervised demo on the local test build only; not ready for a paying client, real data or live sending). **Draft PR #295 is open and still a draft. Vercel preview builds READY. Not merged, not on the live site.** See "Push status".

## DONE
| Item | Files | Evidence |
|---|---|---|
| Official AIA Pack definition + listing | packs/lead-catcher.json, api/_packs.js (OFFICIAL + PACK_FILES + 409 guard on use/install/buy) | P01, P02 PASS |
| Add once (Yes), turn on per desk (Yes), turn off (Yes) | api/_lc-engine.js getPack/turnOn/turnOff | P03 PASS; smoke |
| Packs-you-own row with on/off state | packs-you-own.js | manual (dev preview) |
| Card fields, lifecycle, seats, permission matrix | api/_lc-engine.js, api/_lc-policy.js | T04, T11, P04 PASS |
| Intake: website form (key per desk), typed in; email/text/missed call MOCK | api/_lc-intake.js, api/lead-catcher.js | T01, T02, T03 PASS |
| Rule-based helper; optional model (off, allow-list) | api/_lc-extract.js, api/_lc-model.js | T05, T14 PASS |
| Payload-bound Yes, Stop, TTL, idempotent Run to MOCK outbox | api/_lc-engine.js, api/_lc-draft.js, api/_lc-store.js | T06–T09, T15 PASS |
| Hash-chained history, original-request integrity | api/_lc-engine.js | T01, T10 PASS |
| Desk (tenant) isolation; isolated store; live-site refusal | api/_lc-store.js, api/lead-catcher.js | T13, S01 PASS |
| Desk page (AIA header, nav, theme, logo) | lead-catcher.html, lead-catcher.js, vercel.json rewrites | /workspace/lc-screens/gate.png, card.png; smoke 200s |
| **Lead Catcher cards on the main AIA Queue** (read-only, Open → card) | desk-queue-lead-catcher.js, desk-nav.js (loader), api/_lc-engine.js queueItems, api/lead-catcher.js action=queue | Q01–Q04 PASS; /workspace/lc-screens/queue-lead-catcher.png |
| Pack stays owned after AIA links the desk to an account (bug found in dev preview, fixed) | api/lead-catcher.js accountKeys, api/_lc-engine.js ownsPack | P05 PASS |
| **Working model: scoped AI context** (one builder; only this card + seat; no other cards/desks/credentials/store) | api/_lc-context.js, api/_lc-model.js (gets the context only), api/lead-catcher.js action=ai-context | W01 PASS |
| **AI work package** beside the request, Accept / Fix / Reject per item, draft-quality counts | api/_lc-package.js (pure), api/_lc-engine.js proposePackage/reviewItem/metrics, lead-catcher.js | W02, W04 PASS; /workspace/lc-shots/b-water-heater-package.png |
| **Split decisions** for time and price; draft promises neither; booking lint | api/_lc-package.js, api/_lc-draft.js | W02, W03 PASS |
| **Checks before Run**, MOCK connection up/down, retry, Needs attention, I sent it myself | api/_lc-engine.js preRunChecks/execute/manualSent/setConnection, lead-catcher.js | W05 PASS |
| **"I sent it myself" = a MANUAL action** (separate row; reporter, seat, time, required channel, note, approved-words answer, approved version + fingerprint; "Sent by a person (manual)"; failed tries unchanged; no second system send; first response counted only with approved words, flagged manual) | api/_lc-engine.js manualSent/execute/queueItems/detail/metrics, lead-catcher.js | W07 PASS; 11 mutations; smoke |
| **Customer reply → same card → new package**; Queue "Customer replied" | api/_lc-engine.js customerReply, desk-queue-lead-catcher.js | W06 PASS; /workspace/lc-shots/a-queue-lead-catcher.png |
| Tests in repo chain | scripts/check-lead-catcher.js (package.json test chain) | PASS 31 · FAIL 0 · NOT RUN 1 |
| **Preview isolation check J** (approved): build-time env presence line, names/booleans only, never values; runs as `vercel-build`, always exits 0, skips production | scripts/env-presence.js, scripts/check-env-presence.js, package.json | E01–E14: PASS 25 · FAIL 0; 9/9 leak/wiring mutations caught; line read from the preview build log |
| Mutation check | scripts/lead-catcher-mutations.sh | 56/56 caught |
| **Fix G in this branch** (main `542d0fe` merged in; previews can't use the shared Blob store) | api/_lib.js, api/upload.js, scripts/check-store-guard.js, package.json (both sides' scripts kept) | check-store-guard 79/0, 6/6 mutations; preview `2854c05` READY with `blob=missing`; see PREVIEW_ISOLATION "Fix G in this branch" |
| Local dev preview + curl smoke (now serves AIA's own /api on a temp store; keys removed, outbound blocked) | scripts/lead-catcher-dev.js, scripts/lead-catcher-smoke.sh | evidence/local-smoke.txt |
| **Track 3–5 business docs (DRAFT, for James's review)**: proposal, SOW, staff guide, data-handling outline, training, setup workbook (text copy), sales page draft, demo script | docs/lead-catcher/business/ (PROPOSAL.md, SOW.md, STAFF_GUIDE.md, PRIVACY_NOTE.md, TRAINING.md, DEMO_SCRIPT.md, SALES_PAGE_DRAFT.html, workbook/*.md); .xlsx on the box only at /workspace/lead-catcher-business/Lead-Catcher-Setup-Workbook.xlsx | DONE (draft): G30, G31, G32, G34, G40, G41. G51 IN PROGRESS (draft calculator; real costs need a pilot). Not reviewed, not approved, not published. Legal terms (G33) not drafted. |
| **Go-live readiness assessment (Track lc3)** | docs/lead-catcher/READINESS.md | Verdict, 29 launch gates (READY 11 · BLOCKED 10 · NOT RUN 8), 13 approvals needed from James, open isolation items, recommended order. Draft for James's review; approves nothing. |
| Docs | READINESS, SPEC (§0 working model, §9 metrics, §13 Queue, §14–§16, §15 manual send), PREVIEW_ISOLATION, GAP_REGISTER (.md/.csv, 50 rows; G28 PUBLIC_HOST and G29 runtime GHL added ~10:00 AM CT), TEST_RESULTS, ARCHITECTURE, KNOWN_LIMITATIONS, README, /.env.example | this folder |

## IN PROGRESS
- Several packs per desk (workaround in place; AIA model change needed) — G06.
- Ownership on the AIA account record (kept in Lead Catcher store for now) — G07.
- Unit economics — G51: draft calculator written (workbook tab, all inputs blank assumptions); real setup/care hours and third-party costs need a pilot client.
- Draft PR #295 ("Lead Catcher: official AIA Pack (test build, draft)", base main) is open and **still a draft**, not merged. Merge needs James's explicit go (G20).
- Preview isolation — PREVIEW_ISOLATION.md: **YES 13 / NO 1 / UNKNOWN 1** (~5:25 AM CT; was YES 9 / NO 1 / UNKNOWN 5). A, B, C, D, J done. G (code guard) is merged to main as `542d0fe`, production is verified (05:09 CT, `store.driver: "shared"`), and since `2854c05` it's in this branch, with Preview still `blob=missing`. The four store-dependent rows moved to YES on code, mocked tests and build-log evidence; no preview function was exercised at runtime. Left: `PUBLIC_HOST` (NO, proposal I, now G28) and `runtime` GHL (UNKNOWN, proposal E, now G29). **Preview sign-in remains James's call** (G22).

## BLOCKED
- Live channels and live send (T12) — need James's channel choice + provider (G03, G04).
- Durable store for Lead Catcher — needs Vercel access/decision (G21). (Preview/production Blob separation is done by B + fix G; G22's remaining step is James's call on preview sign-in.)
- Terms (refund, cancellation, tax, liability, termination) — need legal review (G33).

## NOT STARTED
- Track 3–5 still open: terms (G33, needs a lawyer; placeholders only), third-party cost disclosure (G52, decision), trademark search (G43). The other Track 3–5 docs are now DONE (draft), awaiting James's review.
- Desk-approved reply templates (G17); calendar/estimate tooling for decisions (G19); System Admin contact on the card page (G18).
- Isolation leftovers: `PUBLIC_HOST` fix (G28), `runtime` GHL Preview check (G29).
- Lead Catcher events on the main AIA History tab (G05b); helper kind-of-job tie-break (G12); rate limiting (G25); retention/export/delete (G26); monitoring (G27); notifications (G11); handling-time sampling (G10).

## Test results
PASS 31 · FAIL 0 · NOT RUN 1 (T12). Mutations 56/56 caught. Env presence check: PASS 25 · FAIL 0 (9/9 mutations caught). Whole repo per-script (2026-10-08 ~5:15 AM CT): main `542d0fe` 31/81 pass, this branch after merging main 33/83 pass (before the merge 33/82); no new failures vs main. `check-icons` fails on both main and the merged branch; it's pre-existing on main from main's icon commits. Fix G: check-store-guard 79 PASS / 0 FAIL, 6/6 mutations caught. Reference build: 14 PASS, 12/12 mutations caught.

## Open defects
| Defect | Owner | Note |
|---|---|---|
| AIA `npm test` stops early on main (50 per-script failures on `542d0fe`, including check-icons and check-desk-nav; pre-existing) | AIA maintainers | Not caused by this branch |
| ~~Previews can read and write the production Blob store~~ **Resolved:** B removed the Blob vars from Preview, and fix G (`542d0fe`, in this branch since `2854c05`) refuses Blob off production | — | See PREVIEW_ISOLATION.md "Fix G in this branch"; preview sign-in is still James's call |
| No Lead Catcher defects open | — | desk-AI seat gap found by mutation check was fixed (now uses AIA actorIsDeskAi) |

## Push status
- Last docs update: 2026-10-08 ~5:25 AM CT (fix G brought into this branch; earlier: ~2:52 AM CT check J result). Check J code pushed as `7b701b9`; its preview `automate-it-away-ni7zz3s10` READY 02:49 CT; presence line read from its build log.
- Remote branch `lead-catcher-slice`: first upload ae9f381, then the Queue and working-model updates (head c5f8b0e). This update ("I sent it myself" as a MANUAL action, preview isolation evidence) is pushed on top of c5f8b0e through the GitHub connector, onto `lead-catcher-slice` only. The resulting head is in the session report (a doc can't name the commit it's in).
- Not carried by the connector (text only): the PNG screenshots (kept at `/workspace/lc-shots/` and `/workspace/lc-screens/` on the box) and the executable bit on `scripts/*.sh` (run them with `bash`).
- Vercel builds two previews per push (`automate-it-away`, `runtime`). c5f8b0e → READY (automate-it-away-laqok0j49-james-oddos-projects.vercel.app); the new head's state is in the session report. Nobody has signed in on a preview. Don't, until G22 is confirmed.
- Draft PR #295 is open and still a draft. Main is untouched by this work. Nothing is merged.
- ~5:18 AM CT: main `542d0fe` (fix G) merged into this branch: `d3d1ac3` (temporary main `package.json`), `e1e5ec0` (merge commit made with the connector's PR-branch update, approved by James), and `2854c05` (combined `package.json`). The remote tree matches a local `git merge` exactly, including binary icons. Preview `dpl_yd1sGtKDQc8TdsQE7BNrdZRL55bs` READY 05:18:26 CT, `blob=missing`, with no request made to it. PR #295 is still a draft. Nothing was pushed to main.
- ~5:45 AM CT: Track 3–5 draft business docs pushed to this branch only (docs/lead-catcher/business/, text files only; the setup workbook .xlsx stays on the box at /workspace/lead-catcher-business/). All marked DRAFT for James's review; nothing published, nothing merged, nothing pushed to main.
- ~10:00 AM CT: READINESS.md (Track lc3) added; GAP_REGISTER (.md/.csv) G20, G22, G24, L1, L3, L5 updated and G28/G29 added; KNOWN_LIMITATIONS items 2 and 12 brought up to date. Pushed to this branch only; nothing merged, nothing pushed to main, no preview requested.

## Next tasks (in order)
Full list with reasons: READINESS.md section (e). Every live step needs the matching approval in READINESS.md section (c).
1. Draft PR #295 stays a draft; never merge to main without James's explicit go (approval 1).
2. James reviews READINESS.md and the business drafts; decides self-approval (G09) and Care Plan scope.
3. James decides preview sign-in (G22, approval 4). If yes: Vercel team login on a preview of this branch (it starts from an empty AIA store), run the checks there (L1) and one before/after production-store check.
4. Fix `PUBLIC_HOST` on its own branch (G28); James checks the `runtime` Preview setting (G29).
5. Pick a durable isolated store (G21, approval 10), then monitoring (G27) and rate limits (G25).
6. Legal review and name check (G33, G34, G43), then retention/export/delete (G26).
7. James picks the first live channel, fees and a test recipient; run T12 in the provider's sandbox.
