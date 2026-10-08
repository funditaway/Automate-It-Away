# Lead Catcher — Progress Manifest (updated 2026-10-08)

Branch `lead-catcher-slice` on `funditaway/Automate-It-Away`, based on main `798f269`; main is now `b19bfce` (its one new commit touches none of this branch's files; main untouched by this work). **Pushed via the GitHub connector. Draft PR pending James's submit. Vercel preview builds READY. Not merged, not on the live site.** See "Push status".

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
| **Customer reply → same card → new package**; Queue "Customer replied" | api/_lc-engine.js customerReply, desk-queue-lead-catcher.js | W06 PASS; /workspace/lc-shots/a-queue-lead-catcher.png |
| Tests in repo chain | scripts/check-lead-catcher.js (package.json test chain) | PASS 30 · FAIL 0 · NOT RUN 1 |
| Mutation check | scripts/lead-catcher-mutations.sh | 45/45 caught |
| Local dev preview + curl smoke (now serves AIA's own /api on a temp store; keys removed, outbound blocked) | scripts/lead-catcher-dev.js, scripts/lead-catcher-smoke.sh | evidence/local-smoke.txt |
| Docs | SPEC (§0 working model, §13 Queue, §14–§16), GAP_REGISTER (.md/.csv, 47 rows), TEST_RESULTS, ARCHITECTURE, KNOWN_LIMITATIONS, README, /.env.example | this folder |

## IN PROGRESS
- Several packs per desk (workaround in place; AIA model change needed) — G06.
- Ownership on the AIA account record (kept in Lead Catcher store for now) — G07.
- Demo script — G41.
- Draft PR — pushed branch, PR pending James's submit (G20).

## BLOCKED
- Live channels and live send (T12) — need James's channel choice + provider (G03, G04).
- Durable store and preview/production Blob separation — need Vercel access/decision (G21, G22).
- Terms (refund, cancellation, tax, liability, termination) — need legal review (G33).

## NOT STARTED
- Track 3–5 documents: proposal, SOW, staff guide, privacy note, sales page (marked DRAFT), unit economics — listed in GAP_REGISTER, not written by design until reviewed.
- Desk-approved reply templates (G17); calendar/estimate tooling for decisions (G19); System Admin contact on the card page (G18).
- Lead Catcher events on the main AIA History tab (G05b); helper kind-of-job tie-break (G12); rate limiting (G25); retention/export/delete (G26); monitoring (G27); notifications (G11); handling-time sampling (G10).

## Test results
PASS 30 · FAIL 0 · NOT RUN 1 (T12). Mutations 45/45 caught. Whole repo per-script (re-run 2026-10-08 vs main b19bfce): main 31/80, branch 32/81 (no new failures). Reference build: 14 PASS, 12/12 mutations caught.

## Open defects
| Defect | Owner | Note |
|---|---|---|
| AIA `npm test` stops at check-desk-nav on main (49 per-script failures, pre-existing) | AIA maintainers | Not caused by this branch |
| Preview may share production Blob token (unverified) | James / Vercel access | Lead Catcher never writes the shared store |
| No Lead Catcher defects open | — | desk-AI seat gap found by mutation check was fixed (now uses AIA actorIsDeskAi) |

## Push status
- Remote branch `lead-catcher-slice` held the first upload of 68cfd21 (head ae9f381; text identical to 68cfd21). The Queue update (local cb5e0bc) and the working-model update are pushed together on top of it through the GitHub connector, onto `lead-catcher-slice` only. The resulting head is in the session report (a doc can't name the commit it's in).
- Not carried by the connector (text only): the PNG screenshots (kept at `/workspace/lc-shots/` and `/workspace/lc-screens/` on the box) and the executable bit on `scripts/*.sh` (run them with `bash`).
- Vercel builds two previews per push (`automate-it-away`, `runtime`). ae9f381 → READY (automate-it-away-awwj2irde-james-oddos-projects.vercel.app); the new head's state is in the session report. Nobody has signed in on a preview. Don't, until G22 is confirmed.
- Draft PR: pending James's submit. Main is untouched by this work. Nothing is merged.

## Next tasks (in order)
1. James submits the draft PR (never merge to main without review).
2. Confirm preview env vars do not include the production Blob token (G22) before anyone signs in on the preview.
3. James picks the first live channel; contract it and run T12 in its sandbox.
4. Pick a durable isolated store (G21).
