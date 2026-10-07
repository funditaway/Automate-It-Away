# Lead Catcher — Progress Manifest (2026-10-07, CDT)

Branch `lead-catcher-slice` in `/workspace/aia-lc-repo`, based on main `798f269`. **Committed locally only. Not pushed, no PR, not deployed** (see "Push status").

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
| Desk page (AIA header, nav, theme, logo) | lead-catcher.html, lead-catcher.js, vercel.json rewrites | screens/gate.png, card.png; smoke 200s |
| Tests in repo chain | scripts/check-lead-catcher.js (package.json test chain) | PASS 19 · FAIL 0 · NOT RUN 1 |
| Mutation check | scripts/lead-catcher-mutations.sh | 17/17 caught |
| Local dev preview + curl smoke | scripts/lead-catcher-dev.js, scripts/lead-catcher-smoke.sh | evidence/local-smoke.txt |
| Docs | SPEC, GAP_REGISTER (.md/.csv, 38 rows), TEST_RESULTS, ARCHITECTURE, KNOWN_LIMITATIONS, README, /.env.example | this folder |

## IN PROGRESS
- Several packs per desk (workaround in place; AIA model change needed) — G06.
- Ownership on the AIA account record (kept in Lead Catcher store for now) — G07.
- Demo script — G41.

## BLOCKED
- Live channels and live send (T12) — need James's channel choice + provider (G03, G04).
- Durable store and preview/production Blob separation — need Vercel access/decision (G21, G22).
- Terms (refund, cancellation, tax, liability, termination) — need legal review (G33).
- Push branch / draft PR / Vercel preview — see Push status.

## NOT STARTED
- Track 3–5 documents: proposal, SOW, staff guide, privacy note, sales page (marked DRAFT), unit economics — listed in GAP_REGISTER, not written by design until reviewed.
- Lead Catcher cards in the main AIA Queue (G05); rate limiting (G25); retention/export/delete (G26); monitoring (G27); notifications (G11); handling-time sampling (G10).

## Test results
PASS 19 · FAIL 0 · NOT RUN 1 (T12). Mutations 17/17 caught. Whole repo per-script: main 31/80, branch 32/81 (no new failures). Reference build: 14 PASS, 12/12 mutations caught.

## Open defects
| Defect | Owner | Note |
|---|---|---|
| AIA `npm test` stops at check-desk-nav on main (49 per-script failures, pre-existing) | AIA maintainers | Not caused by this branch |
| Preview may share production Blob token (unverified) | James / Vercel access | Lead Catcher never writes the shared store |
| No Lead Catcher defects open | — | desk-AI seat gap found by mutation check was fixed (now uses AIA actorIsDeskAi) |

## Push status
GitHub connector is signed in as `funditaway` and supports pushing files and opening draft PRs. **Not used.** The connector only accepts file contents typed into the call, so pushing means re-typing 33 text files (about 260 KB) by hand with a real chance of a silent change. The 2 PNG screenshots can't be sent that way at all. The box has no git login. Kept local. Ready to push from: `/workspace/aia-lc-repo` (commit on `lead-catcher-slice`) or `/workspace/lead-catcher-slice.bundle` / `.patch`.

## Next tasks (in order)
1. Push `lead-catcher-slice` and open a DRAFT PR (James runs `git push -u origin lead-catcher-slice`, or a verified connector push), then confirm the Vercel preview builds — never main.
2. Confirm preview env vars do not include the production Blob token (G22) before anyone signs in on the preview.
3. James picks the first live channel; contract it and run T12 in its sandbox.
4. Pick a durable isolated store (G21).
