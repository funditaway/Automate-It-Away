# Lead Catcher — an Official AIA Pack (preview)

Lead Catcher turns each customer request into one AIA card. Each card gets an owner, a next step, and a reply a person approves. **Preview only:** test and demo data, nothing is sent (MOCK outbox), nothing is charged (Collect off), and nothing runs on the live site.

## Run it locally (127.0.0.1 only)
```bash
npm install                                  # AIA's existing dev deps; nothing new is added
node scripts/check-lead-catcher.js           # checks: expect PASS 19 · FAIL 0 · NOT RUN 1
bash scripts/lead-catcher-mutations.sh       # breaks one rule at a time; expect 17/17 caught
node scripts/lead-catcher-dev.js             # DEV ONLY preview → http://127.0.0.1:4318/lead-catcher
bash scripts/lead-catcher-smoke.sh           # curl walk-through against the dev preview (run on a fresh dev start)
```
Dev preview sign-in: open `http://127.0.0.1:4318/__dev-signin?ws=riverbend-demo&pin=1111` (fake desk; owner 1111, staff 2222 and 3333, desk AI 7777). Settings: see `/.env.example` (no secrets).

## Use it (as the desk owner)
1. Open **Lead Catcher** (`/lead-catcher`). Tick **Yes** to add the pack to your AIA account (no charge).
2. Tick **Yes** to turn it on for this desk. Copy the website-form key (shown once).
3. Requests arrive as **New** cards. Give each one an owner, a next step and a due time.
4. Confirm the customer's contact, check the draft reply, and press **Yes**. Then **Run** (writes to the MOCK outbox).
5. Record what happened. **Kill** closes a card with no action (needs a reason and a second tap).

## Docs
SPEC.md (the rules) · GAP_REGISTER.md/.csv · TEST_RESULTS.md · ARCHITECTURE.md · KNOWN_LIMITATIONS.md · PROGRESS_MANIFEST.md · evidence/
