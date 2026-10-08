# Lead Catcher — an Official AIA Pack (preview)

Lead Catcher turns each customer request into one AIA card. **AI prepares, AIA manages, a person authorizes; proposing never grants permission.** Each card gets an owner, a next step, and a reply a person approves. **Preview only:** test and demo data, nothing is sent (MOCK outbox), nothing is charged (Collect off), and nothing runs on the live site.

## Run it locally (127.0.0.1 only)
```bash
npm install                                  # AIA's existing dev deps; nothing new is added
node scripts/check-lead-catcher.js           # checks: expect PASS 31 · FAIL 0 · NOT RUN 1
bash scripts/lead-catcher-mutations.sh       # breaks one rule at a time; expect 56/56 caught
node scripts/lead-catcher-dev.js             # DEV ONLY preview → http://127.0.0.1:4318/lead-catcher
bash scripts/lead-catcher-smoke.sh           # curl walk-through against the dev preview (run on a fresh dev start)
```
Dev preview sign-in: open `http://127.0.0.1:4318/__dev-signin?ws=riverbend-demo&pin=1111` (fake desk; owner 1111, staff 2222 and 3333, desk AI 7777). Settings: see `/.env.example` (no secrets).

## Use it (as the desk owner)
1. Open **Lead Catcher** (`/lead-catcher`). Tick **Yes** to add the pack to your AIA account (no charge).
2. Tick **Yes** to turn it on for this desk. Copy the website-form key (shown once).
3. Requests arrive as **New** cards. Give each one an owner, a next step and a due time.
4. Next to the customer's words, AIA shows what it prepared: summary, details, questions, a suggested next step, a draft reply, and separate **Scheduling** and **Price** decisions when they ask about time or cost. **Accept**, **Fix** or **Reject** each item. Accepting never sends anything and is not a Yes.
5. Confirm the customer's contact, check the draft reply, and press **Yes**. Then **Run** (writes to the MOCK outbox). If the test send fails, **Try again** or send it yourself and press **I sent it myself** (pick the channel, say whether you used the approved words; it shows as "Sent by a person (manual)" and the failed tries stay on record). The desk owner can flip the MOCK test connection down to practise this.
6. When the customer texts or emails back (MOCK), the reply lands on the same card and AIA prepares a new package.
7. Record what happened. **Kill** closes a card with no action (needs a reason and a second tap).
8. Open cards also show on the main **Queue** (`/desk`) in a Lead Catcher block. Tap **Open** to act on one; the Queue itself can't press Yes, Stop, Kill or Run.

## Docs
SPEC.md (the rules) · GAP_REGISTER.md/.csv · TEST_RESULTS.md · ARCHITECTURE.md · KNOWN_LIMITATIONS.md · PROGRESS_MANIFEST.md · PREVIEW_ISOLATION.md (what a preview can reach; changes proposed for James) · evidence/

## Business docs (draft)
DRAFT — for James's review. Not legal advice. Not published. Pricing is a draft offer ($1,250 setup, optional $350/month Care Plan), not final, subject to James's approval and legal review.
- [Founding-client proposal](business/PROPOSAL.md)
- [Statement of work](business/SOW.md) (legal terms left for qualified legal review)
- [Staff guide (one page)](business/STAFF_GUIDE.md)
- [Data-handling note (outline)](business/PRIVACY_NOTE.md) (needs legal/privacy review)
- [30-minute staff training](business/TRAINING.md)
- [Setup workbook, text copy](business/workbook/README.md) (the .xlsx lives on the box at `/workspace/lead-catcher-business/Lead-Catcher-Setup-Workbook.xlsx`; the connector carries text only)
- [Sales page draft](business/SALES_PAGE_DRAFT.html) (noindex; not published)
- [10-minute demo script](business/DEMO_SCRIPT.md) (test build and test outbox)
