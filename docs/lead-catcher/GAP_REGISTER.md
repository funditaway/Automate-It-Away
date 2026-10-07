# Lead Catcher — Gap Register

DRAFT 2026-10-07. Status words: DONE / IN PROGRESS / BLOCKED / NOT STARTED / OPEN. "DONE (preview)" means built and tested locally on test data only — not live.
Machine-readable copy: `GAP_REGISTER.csv`.


## 1 Working product

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G01 | Card fields, lifecycle, seats, payload-bound Yes (Lead Catcher pack) | api/_lc-engine.js, api/_lc-policy.js; check-lead-catcher.js P01–P04,T01–T11,T13–T15 PASS | DONE (preview) | Keep tests green as AIA changes | — | npm test step check-lead-catcher.js: PASS 19 / FAIL 0 |
| G02 | Website-form intake adapter | api/_lc-intake.js web_form; T01/T02 PASS with per-desk intake key | DONE (test data only) | Embed form on a client site; rate-limit; spam filter | Client site access; James approval | Real form post on a staging client site lands one card; spam post is labelled |
| G03 | Email / text / missed-call intake | Adapters exist as MOCK (mock_email, mock_sms, mock_missed_call) | BLOCKED | Pick provider, contract, verify sender, signed webhooks | James: which channel first; provider account; budget | T12 PASS against the chosen provider sandbox |
| G04 | Live outbound delivery | MOCK outbox only (api/_lc-store.js outbox, labelled MOCK — NOT SENT) | BLOCKED | Real adapter behind the same Yes/Run gate, delivery receipts, retry without double-send | G03; consent/opt-out rules (TCPA/CAN-SPAM review) | T12 PASS; T15 still PASS with live adapter in sandbox |
| G05 | Lead Catcher cards in the main AIA Queue | Separate /lead-catcher page reusing AIA header, desk nav, theme | NOT STARTED | Show Lead Catcher cards in AIA Queue/History views | Decision on merging stores (G07) | A New Lead Catcher card appears in the AIA Queue with a link to its card |
| G06 | Several packs on one desk | AIA installPackOnDesk sets a single shop.pack; Lead Catcher keeps its own per-desk on/off and never overwrites shop.pack | IN PROGRESS (workaround) | Change AIA pack model to a list of packs per desk | James approval to change the shared pack model | Desk with Studio pack + Lead Catcher on: both work; turning one off leaves the other |
| G07 | Pack ownership on the AIA account record | Ownership kept in the isolated Lead Catcher store under accountKey | IN PROGRESS (workaround) | Move ownership into AIA accounts/packs once the store is reviewed | Store review (G21) | Packs-you-own reads Lead Catcher ownership from the AIA account with no side store |
| G08 | Optional AI model extractor | api/_lc-model.js off by default, allow-list filter; mutation no-model-allowlist caught | DONE (off) | Choose a model, cost cap, data-processing terms | James: whether to use a model at all | Model on in staging: suggestions only, allow-list holds, T14 still PASS |
| G09 | Self-approval policy | Approver can Yes own draft; Responder can Run another person's Yes | NOT STARTED (decision) | Enforce whichever rule James picks | James decision | Test: the chosen forbidden combination returns 403 |
| G10 | Staff handling-time metric | Not measured; sampling plan in SPEC §9 | NOT STARTED | Supervisor timing sample, 20 cards/week | Pilot client | Weekly sample recorded on the numbers page |
| G11 | Notifications to staff (new card, overdue) | None | NOT STARTED | In-app badge first; email/SMS later behind G04 | G04 for external | New card shows a badge for its owner within 1 minute |

## 2 Technical delivery

| ID | Item | Existing evidence | Status | Required work | Dependency | Acceptance test |
|---|---|---|---|---|---|---|
| G20 | Branch, commit, draft PR, Vercel preview | Local branch lead-catcher-slice (see PROGRESS_MANIFEST for push status) | IN PROGRESS | Push branch, open DRAFT PR, confirm preview builds | GitHub connector permission | Preview URL loads /lead-catcher; main untouched |
| G21 | Durable, isolated store for Lead Catcher | Isolated JSON file (/tmp by default); atomic writes; on Vercel /tmp is throwaway | BLOCKED | Pick durable store (separate Blob store or Postgres) with per-desk rows | James approval; free tier check | T10 PASS across two serverless instances |
| G22 | Preview may share production Blob token | Vercel filter_project_envs returned 403 — unverified. Existing AIA ready()/persistScrub can write on any request (pre-existing, not caused by Lead Catcher). Lead Catcher never writes the shared store (S01). | BLOCKED (unverified) | Confirm preview env vars; scope BLOB token to production only or give previews a separate store | Vercel project access | Preview request leaves production Blob unchanged (checksum before/after) |
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
| G42 | Screenshots for pitch | docs/lead-catcher/evidence/screens/*.png (local dev preview) | DONE (local) | Retake on Vercel preview | G20 | Screens show AIA brand and MOCK labels |
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
| L1 | All required tests PASS on the deployed preview | Local only: PASS 19 / FAIL 0 / NOT RUN 1 | BLOCKED | Run check on preview build | G20, G21 | Same counts recorded against preview URL |
| L2 | At least one named channel live and tested (T12) | T12 NOT RUN | BLOCKED | Contract + test one channel | G03, G04 | T12 PASS |
| L3 | Durable isolated store; preview cannot touch production data | Not verified | BLOCKED | G21 + G22 | Vercel access | Checksum test PASS |
| L4 | Terms reviewed and signed off | Open | BLOCKED | G33 | Lawyer | Signed terms |
| L5 | James approves going live for one client (explicit Yes) | Not requested | NOT STARTED | Present evidence pack | L1–L4 | Written approval from James |
| L6 | Collect / money stays off unless separately approved | Pack price 0, charged:false, Collect off; P01/P02 PASS | DONE | Keep off; any payment needs its own review | — | P01, P02 PASS |
