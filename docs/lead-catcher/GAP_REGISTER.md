# Lead Catcher — Gap Register

DRAFT 2026-10-08. Status words: DONE / IN PROGRESS / BLOCKED / NOT STARTED / OPEN. "DONE (preview)" means built and tested locally on test data only — not live.
Machine-readable copy: `GAP_REGISTER.csv`.


## 1 Working product

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G01 | Card fields, lifecycle, seats, payload-bound Yes (Lead Catcher pack) | api/_lc-engine.js, api/_lc-policy.js; check-lead-catcher.js P01–P05, T01–T11, T13–T15, Q01–Q04, W01–W07, S01 PASS | DONE (preview) | Keep tests green as AIA changes | — | npm test step check-lead-catcher.js: PASS 31 / FAIL 0 / NOT RUN 1 |
| G02 | Website-form intake adapter | api/_lc-intake.js web_form; T01/T02 PASS with per-desk intake key | DONE (test data only) | Embed form on a client site; rate-limit; spam filter | Client site access; James approval | Real form post on a staging client site lands one card; spam post is labelled |
| G03 | Email / text / missed-call intake | Adapters exist as MOCK (mock_email, mock_sms, mock_missed_call) | BLOCKED | Pick provider, contract, verify sender, signed webhooks | James: which channel first; provider account; budget | T12 PASS against the chosen provider sandbox |
| G04 | Live outbound delivery | MOCK outbox only (api/_lc-store.js outbox, labelled MOCK — NOT SENT) | BLOCKED | Real adapter behind the same Yes/Run gate, delivery receipts, retry without double-send | G03; consent/opt-out rules (TCPA/CAN-SPAM review) | T12 PASS; T15 still PASS with live adapter in sandbox |
| G05 | Lead Catcher cards in the main AIA Queue | desk-queue-lead-catcher.js (loaded by desk-nav.js on /desk) + read-only action=queue; Q01–Q04 PASS; mutations queue-* caught; screenshot /workspace/lc-screens/queue-lead-catcher.png | DONE (Queue, read-only) | History tab still shows only AIA cards; Lead Catcher rows sit in their own block above AIA cards, not interleaved | — | Q01–Q04 PASS; a New Lead Catcher card shows on /desk with Open → its card |
| G05b | Lead Catcher events in the main AIA History tab | Lead Catcher history lives on each card (hash-chained) | NOT STARTED | Read-only Lead Catcher events on /history | — | A Yes on a Lead Catcher card shows on /history for that desk only |
| G06 | Several packs on one desk | AIA installPackOnDesk sets a single shop.pack; Lead Catcher keeps its own per-desk on/off and never overwrites shop.pack | IN PROGRESS (workaround) | Change AIA pack model to a list of packs per desk | James approval to change the shared pack model | Desk with Studio pack + Lead Catcher on: both work; turning one off leaves the other |
| G07 | Pack ownership on the AIA account record | Ownership kept in the isolated Lead Catcher store; checked across every key the owner may have (desk, account) so a later AIA account link keeps it (P05; bug found in dev preview and fixed) | IN PROGRESS (workaround) | Move ownership into AIA accounts/packs once the store is reviewed | Store review (G21) | Packs-you-own reads Lead Catcher ownership from the AIA account with no side store |
| G08 | Optional AI model extractor | api/_lc-model.js off by default, allow-list filter, sees only the scoped context (W01 stub checks the request body); mutations no-model-allowlist, model-gets-desk-cards caught | DONE (off) | Choose a model, cost cap, data-processing terms | James: whether to use a model at all | Model on in staging: suggestions only, allow-list holds, T14 still PASS |
| G09 | Self-approval policy | Approver can Yes own draft; Responder can Run another person's Yes | NOT STARTED (decision) | Enforce whichever rule James picks | James decision | Test: the chosen forbidden combination returns 403 |
| G10 | Staff handling-time metric | Not measured; sampling plan in SPEC §9 | NOT STARTED | Supervisor timing sample, 20 cards/week | Pilot client | Weekly sample recorded on the numbers page |
| G12 | Helper picks the first matching kind of job | 'Roof leak' suggests Plumbing and flags 'category: plumbing/roofing' for a person to check | OPEN (minor) | Prefer the more specific trade, or show both on the card until a person picks | — | 'Roof leak' suggests Roofing; T05 still PASS |
| G13 | Scoped AI context + AI work package (AI prepares, person checks) | api/_lc-context.js buildContext (one builder, frozen, allow-listed); api/_lc-package.js (pure); package beside the request with Accept/Fix/Reject; W01, W02, W04 PASS; 8 context/package/review mutations caught; screenshot /workspace/lc-shots/b-water-heater-package.png | DONE (preview) | — | — | W01, W02, W04 PASS |
| G14 | Time and price asked: separate decisions, draft promises neither | decision:schedule (needs confirmation) and decision:price (needs authorized estimate); confirms_booking lint; water-heater fixture + injection variant W02/W03 PASS; mutations package-echoes-time, no-split-decisions, no-booking-lint caught | DONE (preview) | — | — | W02, W03 PASS |
| G15 | Checks before Run; connection up/down; retry; manual fallback | Approver seat recheck, recipient and version recheck, idempotent on success only, MOCK connection switch (owner + Yes), 3 failures → Needs attention, I sent it myself (see G15b); W05 PASS; 7 mutations caught | DONE (MOCK) | Real adapter health check instead of the MOCK switch | G04 | W05 PASS with a real adapter in sandbox |
| G15b | "I sent it myself" records a MANUAL action, never a system success | Fixed 2026-10-08: separate sent_manually row with reporter (user, seat, name), time, required channel (phone/text/email/in person/other+note), optional note, approved-words answer, approved draft id/version/fingerprint; status words "Sent by a person (manual)" vs "Sent by AIA (test outbox)"; failed rows and history unchanged; no outbox write, no second system send; first response counted only with the approved words and flagged manual in metrics (by_route, manual_not_counted). W07 PASS; 11 mutations caught; smoke | DONE (MOCK) | Decide whether a supervisor must confirm manual reports for real clients | James | W07 PASS |
| G16 | Customer reply returns to the same card | MOCK text/email from the confirmed contact of a card with a run reply attaches to that card, new package, Queue 'Customer replied'; W06 PASS; reply-* mutations caught | DONE (MOCK) | Real channel threading (message ids, email In-Reply-To) instead of phone/email matching | G03 | W06 PASS against the chosen provider sandbox |
| G17 | Desk-approved reply templates | Context reads D.templates when present; until then AIA default templates (first_reply, time_and_price, need_info) | NOT STARTED | Owner screen to edit and approve templates, with a Yes and history | — | Owner-approved template text appears in the next package draft; unapproved edits do not |
| G18 | System Admin still sees customer contact on the card page | AI context and package hide contact for System Admin; the card page itself (pre-existing) still shows it | OPEN (minor) | Redact contact fields on the card view for seats without contact access | James decision on System Admin access | System Admin card view shows no phone/email; T11 still PASS |
| G19 | Scheduling and estimate decisions have no tooling | Decisions are marked 'Needs a person' and recorded when accepted; the person checks the schedule / gives the estimate outside AIA | NOT STARTED | Link to calendar availability and an estimate record with an authorized-by field | Calendar integration; James pricing rules | A confirmed time and an authorized estimate are recorded on the card with who authorized them |
| G11 | Notifications to staff (new card, overdue) | None | NOT STARTED | In-app badge first; email/SMS later behind G04 | G04 for external | New card shows a badge for its owner within 1 minute |

## 2 Technical delivery

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G20 | Branch, commit, draft PR, Vercel preview | Branch pushed via GitHub connector (text files only; PNGs and .sh exec bits not carried). Draft PR: the connector showed James a submit form on 2026-10-08 (title 'Lead Catcher: official AIA Pack (test build, draft)', base main, draft); pending his submit (form shown again 2026-10-08 ~2:33 AM CT; no PR yet). Main untouched by this work (main now db708bd; touches none of this branch's files). See PROGRESS_MANIFEST for the current head. | IN PROGRESS | James submits the draft PR form; nobody signs in on previews until G22 is confirmed | James | Draft PR open against main, not merged; preview READY for the branch head |
| G21 | Durable, isolated store for Lead Catcher | Isolated JSON file (/tmp by default); atomic writes; on Vercel /tmp is throwaway | BLOCKED | Pick durable store (separate Blob store or Postgres) with per-desk rows | James approval; free tier check | T10 PASS across two serverless instances |
| G22 | Preview may share production data (Blob token, auth, keys) | 2026-10-08 (PREVIEW_ISOLATION.md): D done (Vercel login on automate-it-away previews; production domains public). Check J (build-time env presence line, names/booleans only; check-env-presence.js E01–E14) on preview 7b701b9: every secret key missing on Preview (C took effect), but the connected Blob store's BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN / _STORE_ID / _WEBHOOK_PUBLIC_KEY are still on Preview, and _lib.js uses them to read and write aia/store.json. 15 surfaces: YES 7 / NO 6 / UNKNOWN 2. Preview sign-in not safe. Lead Catcher never writes the shared store (S01). | BLOCKED (Blob store still on Preview) | B: James unticks Preview (and Development) on the Blob store's connection to automate-it-away; next build's check J line must show blob=missing; then the checksum test; then G (code guard) | James / Vercel access | Preview request leaves production Blob unchanged (checksum before/after) |
| G23 | Vercel Hobby function limit | 11 of 12 functions used after adding api/lead-catcher.js | OPEN RISK | Merge functions or upgrade plan before adding more | James (plan cost) | vercel build lists ≤12 functions |
| G24 | Baseline AIA test suite red on main | npm test on main stops at check-desk-nav; per-script: main 31/80 pass, branch 32/81 (+Lead Catcher), same 49 failures | OPEN (pre-existing) | Fix or re-baseline AIA checks so npm test is a real gate | AIA maintainers | npm test exits 0 on main |
| G25 | Rate limiting and abuse on public intake | Per-desk hashed intake key only | NOT STARTED | Per-key rate limit, size limit, captcha option | G21 | Burst of 100 posts/min is throttled; normal posts land |
| G26 | Backups, retention, export, deletion | None | NOT STARTED | Retention policy, export per desk, delete on request | Legal review (G33) | Export and delete a desk's data in staging; history of deletion kept |
| G27 | Monitoring and error alerts | None | NOT STARTED | Error log + alert on failed intake/run | G21 | Forced error produces one alert |

## 3 Client/business docs

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G30 | Founding-client proposal | Not found on box, repo or Drive | NOT STARTED | Write proposal using DRAFT offer ($1,250 setup / $350 Care Plan opt-in) | G33 legal terms | James approves text |
| G31 | Statement of work (one defined workflow) | Not found | NOT STARTED | SOW naming channels in scope, training, 60-day measurement | G03 channel choice | James approves; channels listed all PASS tests |
| G32 | Employee handbook / quick guide | Not found | NOT STARTED | One-page Yes/Stop/Kill guide for staff | Slice green (it is) | A new staff member completes a card using only the guide |
| G33 | Terms: refund, cancellation, tax, liability, termination | Open decisions | BLOCKED | Draft and legal review | James; lawyer | Signed-off terms document |
| G34 | Privacy / data-processing note | None | NOT STARTED | Describe what is stored, where, how long | G21, G26 | Matches SPEC §10 and actual store |

## 4 Sales/demo

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G40 | Sales page (DRAFT offer) | Not found | NOT STARTED | Page marked DRAFT; no Buy button; no payment wiring | G33 | Page review: draft label present, no checkout link |
| G41 | Demo script and demo desk | Seed desks riverbend-demo / northside-test in check script and dev preview | IN PROGRESS | 5-minute demo script with demo data | G20 preview | Dry run under 5 minutes, all MOCK labels visible |
| G42 | Screenshots for pitch | /workspace/lc-shots/a-queue-lead-catcher.png and b-water-heater-package.png (+ full-page versions); earlier /workspace/lc-screens/*.png; on the box only, not in git (connector is text-only) | DONE (local) | Retake on Vercel preview | G20 | Screens show AIA brand and MOCK labels |
| G43 | Trademark / name clearance for 'Lead Catcher' | None — no clearance claimed | NOT STARTED | Search before public use | James | Clearance note on file |

## 5 Measurement/economics

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G50 | Metric definitions and numbers page | SPEC §9; api metrics; T08 asserts first-response time from the MOCK run | DONE (test data) | Baseline from the pilot client's current process | Pilot client | Two weeks of baseline vs pilot numbers |
| G51 | Unit economics of $1,250 / $350 offer | None — offer is DRAFT, not proven profitable | NOT STARTED | Track setup hours, care hours, third-party costs | Pilot | Cost per client recorded for first 3 clients |
| G52 | Third-party cost disclosure (included vs client-paid) | Open | NOT STARTED (decision) | Pick per channel | G03 | Proposal lists each cost and who pays |
| G53 | Booked-job attribution | Outcome 'booked' needs attribution (staff_recorded/customer_said/calendar_match) | DONE (manual) | Calendar match later | Calendar integration | Booked count matches client's own calendar for a sample week |

## Launch gate

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| L1 | All required tests PASS on the deployed preview | Local only: PASS 31 / FAIL 0 / NOT RUN 1; preview builds READY but checks not run against it | BLOCKED | Run check on preview build | G20, G21 | Same counts recorded against preview URL |
| L2 | At least one named channel live and tested (T12) | T12 NOT RUN | BLOCKED | Contract + test one channel | G03, G04 | T12 PASS |
| L3 | Durable isolated store; preview cannot touch production data | Failing: check J shows the Blob store token still on Preview (PREVIEW_ISOLATION.md: YES 7 / NO 6 / UNKNOWN 2; secrets off Preview, previews need a Vercel login) | BLOCKED | G21 + G22 | Vercel access | Checksum test PASS |
| L4 | Terms reviewed and signed off | Open | BLOCKED | G33 | Lawyer | Signed terms |
| L5 | James approves going live for one client (explicit Yes) | Not requested | NOT STARTED | Present evidence pack | L1–L4 | Written approval from James |
| L6 | Collect / money stays off unless separately approved | Pack price 0, charged:false, Collect off; P01/P02 PASS | DONE | Keep off; any payment needs its own review | — | P01, P02 PASS |
