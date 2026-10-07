# Lead Catcher — Specification (canonical)

Status: **DRAFT v0.2 — 2026-10-07.** Official AIA Pack, preview. Not on the live site. Not legally reviewed. Commercial terms are a draft service offer, not proven profitable.
Owner: James Oddo (Automate It Away). This file is the one source of truth for Lead Catcher behavior. Code lives on branch `lead-catcher-slice` of `funditaway/Automate-It-Away`. A standalone reference build with the same rules lives at `/workspace/aia-lead-catcher` (box only).

Words used: **desk** = one business's AIA workspace (the tenant). **card** = one customer request. **Yes / Stop / Kill** = AIA's human taps (approve / cancel an approval / close with no action).

## 1. What it does (product behavior)
1. A request comes in (website form, typed in by staff; email, text and missed call are **MOCK** until a channel is contracted). It becomes **one card**. The customer's words, the source, and the arrival time are saved exactly as received and can't be edited.
2. AIA's rule-based helper suggests name, phone, email, kind of job, urgency, and flags anything missing or unsure. It does **not** confirm the contact. A person confirms it and says how.
3. A person gives the card an **owner**, an optional **backup**, a **next step** and a **due time**.
4. AIA drafts a reply. Staff can edit it. Every edit is a new version.
5. A person with Yes authority presses **Yes** on the exact reply. The Yes covers the exact words, recipient, channel, attachments and any commitment. Any change cancels it.
6. A person presses **Run**. In this preview the reply is written to a **MOCK outbox** file. Nothing reaches the customer.
7. Staff record the outcome (booked, quoted, referred, no answer, not a fit, lost, spam, other). "Booked" needs a "how we know".
8. Every step goes into the card's history, which is append-only and hash-chained.

**Locked AIA Card rules (James, 2026-10-07)**, and how they're met:
| Rule | How Lead Catcher meets it |
|---|---|
| One card, one idea | One request = one card. Duplicates fold into the first card (T02). |
| New card only when it needs its own history | Repeats log onto the existing card. They don't open a new one. |
| Clear plain-word history | Every event has a plain-English summary. History never changes (T10). |
| Draft only; a person presses Yes/Stop/Kill | AIA writes drafts only. Yes, Stop and Kill are human actions. Desk AIs hold no seat (P04, T11). |
| Stop and ask when unsure; first work easy to undo | Unsure and missing flags are shown. Nothing runs without a Yes. Stop cancels a Yes. Kill needs a reason and a second tap. |
| One job | Catch the request, get it an owner, get a human-approved first reply, and track it to an outcome. |
| Plain words | User-facing copy is plain English. No IDs or jargon beyond a short fingerprint. |
| No silent money | No price, no charge, no payment pipe. Collect is off. Lint flags any money words in a draft and needs a tick before Yes. |
| Use only what the card stores | Drafts use only card fields. Customer text is never copied into a reply. |

## 2. Card fields
| Field | Meaning | Who sets it |
|---|---|---|
| `original_request`, `original_fields` | Customer's exact words and the fields as received | Intake. Can't be changed (integrity hash `original_hash`, shown as `original_intact`) |
| `source_channel`, `source_is_mock`, `source_ref`, `arrived_at` | Where it came from, whether that channel is MOCK, the channel's own id, and when it arrived | Intake. Can't be changed |
| `data_label` | `test` or `demo`. `live` is refused in this build | Intake |
| `customer_name`, `customer_phone`, `customer_email` | Who it is (suggested by the helper or typed) | Helper fills blanks only; people can edit |
| `contact_verified`, `verified_channel`, `verified_value`, `verified_by`, `verified_at` | Contact confirmed by a person, and how | Person only |
| `missing_flags`, `uncertain_flags` | e.g. missing service address; more than one phone; request contains instructions | Helper |
| `category`, `urgency` | plumbing / hvac / electrical / roofing / restoration / other; emergency / high / normal / low | Helper suggests, person decides |
| `owner_id`, `backup_id` | Who owns it and who covers | Assign |
| `next_action`, `next_action_due` | Next step and when it's due | Assign |
| drafts[] (`version`, `channel`, `recipient`, `content`, `attachments`, `commitment`, `payload_hash`, `lint_flags`, `author_kind`, `state`) | Reply versions | Helper or person |
| approvals[] (`approver_id`, `approver_role`, `approved_at`, `draft_version`, `payload_hash`, `action_id`, `status`, `ended_reason`) | Yes history | Approver |
| actions[] (`action_id`, `adapter`, `adapter_mode`=MOCK, `status`, `executed_by`, timings) | External action status | Run |
| `outcome`, `outcome_note`, `outcome_attribution`, `outcome_at` | What happened and how we know | Person |
| `waiting_reason`, `follow_up_at`, `close_reason` | Lifecycle details | Person |
| `first_assigned_at`, `first_response_at` | Metric timestamps | System |
| history[] | Append-only, hash-chained activity | System |

## 3. Lifecycle
`New → Assigned → In Review → Waiting → Completed`, plus `Closed — No Action`.
- New → Assigned happens only through **Assign**, which needs an owner (a person with a working seat on this desk; never a System Admin or desk AI), a next step and a due time.
- Saving a draft moves Assigned → In Review.
- **Every active card (Assigned, In Review, Waiting) must have an owner and a next step.** Clearing the next step is refused. New cards are the "no owner" queue.
- **Waiting needs a reason and a follow-up date.** Leaving Waiting records whether the follow-up date was met.
- **Completed needs a recorded outcome.**
- **Closed — No Action (Kill)** needs a reason (5+ characters) and a second tap (`confirm: true`), the same as AIA's existing Kill.
- Completed and Closed are final in this version. Closing cancels any open Yes.

## 4. Seats (roles) and permissions
AIA seat → Lead Catcher seat by default: owner → Desk Owner; staff/helper → Responder; member → Technician; desk AI, family, friend, pending → **none**. Approver, Supervisor and System Admin seats exist only when the desk owner sets them (set-role, needs a Yes). A desk AI (AIA's `actorIsDeskAi`: deskAi, kind agent, or role agent) can never hold a seat, even if one is stored.

| Action | Desk Owner | Responder | Approver | Technician | Supervisor | System Admin |
|---|---|---|---|---|---|---|
| See cards and history | Y | Y | Y | Y | Y | Y |
| Type in a request | Y | Y | Y | Y | Y | — |
| Assign owner / next step | Y | — | Y | — | Y | — |
| Edit customer / job fields | Y | Y | Y | Y | Y | — |
| Confirm contact | Y | Y | Y | — | Y | — |
| Run the helper | Y | Y | Y | — | Y | — |
| Set Waiting | Y | Y | Y | Y | Y | — |
| Set In Review | Y | Y | Y | — | Y | — |
| Mark Completed | Y | Y | Y | — | Y | — |
| Kill (close, no action) | Y | — | Y | — | Y | — |
| Draft (helper) / edit / throw away | Y | Y | Y | — | Y | — |
| **Yes** (customer commitment) | Y | — | Y | — | Y | — |
| **Stop** (cancel a Yes) | Y | — | Y | — | Y | — |
| **Run** an approved action | Y | Y | Y | — | Y | — |
| Record outcome | Y | Y | Y | Y | Y | — |
| See the people on this desk | Y | Y | Y | Y | Y | Y |
| Numbers | Y | — | Y | — | Y | Y |
| Attempts log / history check | Y | — | — | — | Y | Y |
| Add pack / turn on / turn off / set seats | owner only (AIA owner seat) | — | — | — | — | — |

**System Admin has no customer-commitment authority by default** (no draft, Yes, Run, outcome, assign or status change). Open decision for James: should a Responder be allowed to press Run on someone else's Yes? (Currently yes.) Should an Approver be blocked from approving their own draft? (Currently no.)

## 5. Approval engine (Yes)
- **Bound payload** = canonical JSON of `{desk, card, channel, recipient, content, attachments, commitment}`. Its SHA-256 is the draft's `payload_hash`.
- **Yes** must send the `payloadHash` the approver saw. The server recomputes it from the stored draft and refuses on mismatch. It records approver, seat, time, draft version, hash and a fresh `action_id`.
- **Material change cancels the Yes**: a new draft version, throwing the draft away, the confirmed contact changing, the card closing, the pack being turned off, or the Yes getting too old (default 60 min, `AIA_LC_APPROVAL_TTL_MIN`).
- **Run** needs a valid Yes for that card and `action_id`. Before running, the server rechecks the payload hash against the stored draft (catches direct tampering), checks the draft is still current, the recipient still equals the confirmed contact, and the card is active.
- **Idempotent**: one `action_id` runs at most once. Repeat or parallel Run presses return the first result. Pressing Yes again on a reply that already ran is refused; the reply needs a new version.
- **No bypass**: there is no API that sends arbitrary content. Every rule is enforced server-side in `api/_lc-engine.js`. Roles come from the signed-in AIA seat, never from the request body or headers.
- **All attempts logged**: every allowed or denied permission check goes to the desk's attempts log, including probes from other desks.
- **Credentials**: none exist in this build. If added later they stay server-side env vars, never in prompts, client code or history.

## 6. AI assistance limits
- Default extractor is deterministic rules (`api/_lc-extract.js`). The optional model adapter (`api/_lc-model.js`) is **off** unless `AIA_LC_MODEL_ENABLED=true` and an endpoint is set. Its output is filtered to an allow-list of five suggestion fields. Anything else is dropped and logged.
- AIA must never invent identity, diagnosis, price, availability, coverage or commitments. The draft template states none. Lint flags price, time promises, guarantees, coverage and diagnosis words, and needs a tick before Yes.
- Inbound text is **untrusted data**: it's stored verbatim, never followed as instructions, and flagged when it reads like instructions (T14).
- **Manual path**: typing in a request, writing the reply yourself and approving it all work with no AI (T03).

## 7. Commercial terms — DRAFT service offer (not wired to any payment)
DRAFT, not proven profitable, not legally reviewed. It's shown only in business docs and the sales page (not built yet). It is **not** the pack price. The pack itself has no charge in AIA, and Collect stays off.
- **$1,250 one-time founding-client setup**: one defined workflow, configuration, employee training, and the first 60 days of measurement and tuning. Setup payment is due before configuration starts.
- **$350/month optional Care Plan** after the pilot. The client must opt in explicitly. No recurring charge without authorization.
- Cancellation, refund, tax, liability and termination are **open decisions that need review**.
- Only named, implemented and tested channels are included. Today that's the website form (test data) and typed-in requests. Email, text and missed call are MOCK.
- No guaranteed revenue, bookings, recovery or savings.
- Third-party charges (for example, SMS provider fees) are disclosed as either included or client-paid. The choice is open.
- Market: local service businesses (plumbing, HVAC, electrical, roofing, restoration). Business lines: Learn, Build, Buy.

## 8. Support boundaries (draft)
In scope: the one workflow configured at setup, desk seats, the website form and typed-in intake, draft templates, and the numbers below. Out of scope until named and tested: live email/SMS/call providers, payments, calendar booking, CRM sync, after-hours answering, legal or insurance advice. AIA never diagnoses, prices or promises on the client's behalf.

## 9. Numbers (metric definitions)
| Metric | Definition |
|---|---|
| First customer-response time | Arrival → first **human-approved** customer reply that actually ran. Internal assignment does **not** count. Here "ran" means written to the MOCK outbox. Median and p90 in minutes, plus a count of cards with no reply yet. |
| Internal triage time | Arrival → first owner assigned. |
| Unassigned active | Cards in New. |
| Late (overdue) | Active cards past their next-step due time, or Waiting cards past their follow-up date. |
| Unresolved after 48 h | Active cards that arrived more than 48 h ago, split into not-waiting and waiting (with waiting reasons counted separately). |
| On-time follow-up rate | Waiting periods that ended on or before their follow-up date ÷ (ended Waiting periods + open ones already past their date). |
| Draft quality | AIA drafts Yes'd as-is / human edits of AIA drafts that got a Yes / human-written drafts that got a Yes / AIA drafts thrown away. |
| Booked opportunities | Cards with outcome `booked`, by attribution: staff_recorded, customer_said, calendar_match. Not revenue. |
| Staff handling time | **Not measured yet.** Plan: a supervisor times a sample of 20 cards per week (open to done, active minutes only). |

## 10. Data handling (only what is built)
- Test and demo data only. `live` is refused. The API refuses to run when `VERCEL_ENV=production`.
- Lead Catcher data is stored in its **own isolated JSON store** (`AIA_LC_STORE_PATH`, default `/tmp/aia-lead-catcher.json`), written atomically. It is **never** written to the shared AIA store or Vercel Blob (check S01). On Vercel `/tmp` is per-instance and temporary: preview data disappears.
- Who you are comes from AIA's existing session/PIN lookup (`personOf`), which reads the shared AIA store.
- The MOCK outbox file holds the approved payload (synthetic contact plus reply text).
- No retention, export or deletion policy exists yet (gap).

## 11. Tenant isolation
Desk = tenant. The desk comes from the signed-in AIA session/PIN, never from a card id or body field. Every card, draft, approval, action, history entry and attempt carries `desk`, and every lookup filters by the caller's desk. Another desk's card returns the same 404 as a missing card. Intake keys are per desk and stored hashed. Seats from another desk can't be assigned (T13, T04).

## 12. Packaging — Official AIA Pack
- Pack id `lead-catcher`, name **Lead Catcher**, brand AIA, family Automate It Away, aisle AIA, `official: true`, price 0, `charged: false`, Collect off. Definition: `packs/lead-catcher.json`. Listing: `OFFICIAL` in `api/_packs.js`.
- **Added once to the AIA account** (`get-pack`, owner only, needs `confirm: true`). **Turned on per desk** (`turn-on`, owner only, needs `confirm: true`, issues that desk's website-form key once). Turning off needs a Yes, keeps cards, and cancels open Yes presses.
- **Several packs per desk**: Lead Catcher keeps its own on/off state per desk and doesn't replace the desk's existing `shop.pack`. Market's Use/Install/Buy for `lead-catcher` returns 409 with a link to `/lead-catcher`. It never installs silently (P02).
- **Packs you own** lists Lead Catcher with its on/off state for the open desk.
- What turning it on changes on a desk: card fields (§2), lifecycle (§3), seats (§4), intake adapters (website form, typed in; email/text/missed call MOCK), and payload-bound Yes (§5).
- Ownership and on/off state are kept in the isolated Lead Catcher store, not on the AIA account record. Moving them there is a gap that needs review.
