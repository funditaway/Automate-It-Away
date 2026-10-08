DRAFT — for James's review. Not legal advice. Not published.

# Lead Catcher — 10-Minute Demo Script (DRAFT)

**What this demo is:** a walk-through of the **test build** on a fake demo business. Every reply goes to the **test outbox**. Nothing reaches a real customer. No live email, text or phone channel is connected. Say this out loud at the start and again at the end.

## Before the call (James only, not shown)
- Run the local test build: `node scripts/lead-catcher-dev.js` and open `http://127.0.0.1:4318/lead-catcher`. (Don't sign in on a hosted preview until the preview sign-in decision is made.)
- Sign in as the demo desk owner ("Dana Owner", Riverbend Plumbing (DEMO)). Keep a second window signed in as "Rae Responder".
- Add Lead Catcher and turn it on for the demo desk (two Yes taps), or do it live in minute 1.
- Have the three practice requests from TRAINING.md ready to paste. All names and numbers are made up.
- Check the TEST / DEMO labels and "test channel" tags are visible on screen.
- Don't show: fingerprints, settings files, terminals.

---

## 0:00–1:00 — Set the frame
> "This is Lead Catcher, running on a test build with a made-up plumbing business. Nothing you see today goes to a real customer. Replies go to a test outbox. We'd pick your first live channel together."
> "The idea is simple: AI prepares the work. A person on your team checks it and says Yes. AIA only sends what was approved."

Show the AIA Queue with the Lead Catcher block.

## 1:00–2:00 — A request comes in
- Press **Type in a request**. Paste the water-heater request (Pat Example).
- Show it appear on the Queue as **No owner**. Tap **Open**.
> "Every request is one card. The customer's words are saved exactly. Nobody can edit them."

## 2:00–4:00 — AI prepares, a person checks
- Point to the two sides: **What they said** and **Prepared by AIA — check each item**.
- Walk through summary, details, missing info, kind of job, next step and draft reply.
- Point to **Scheduling — needs confirmation** and **Price — needs an authorized estimate**.
> "They asked for tomorrow and a price. AIA doesn't promise either. Those are decisions for a person."
- Press **Accept** on the name and phone. Press **Fix** on one item.
> "Accepting doesn't send anything. It's not a Yes."

## 4:00–6:00 — Approve the exact reply
- Set the owner, next step and due time. Press **Prepare again** so the draft uses the owner's name.
- Confirm the contact ("Called back and they answered").
- Switch to Rae Responder: there's no Yes button for her seat.
> "Front-desk staff can prepare. Only the people you choose can approve."
- Back as Dana: press **Yes — approve this exact reply**.
- Edit one word and save. Show the Yes is gone.
> "Any change cancels the Yes. What's approved is exactly what goes."
- Press **Yes** again, then **Run test send**. Show "Sent by AIA (test outbox)".
> "Test outbox. In a live setup, this is where it would go to the customer, once."

## 6:00–7:30 — When a send fails
- As desk owner, turn the test connection **down** (it's labelled as a test switch).
- Approve and **Run test send** on a second card. Show the failure: nothing was sent, the Yes still stands.
- Show **Try again** and **I sent it myself**. Record a manual send: "Phone call", "Yes, word for word".
- Show "Sent by a person (manual)" and the failed try still on record. Bring the connection back **up**.
> "AIA never pretends it sent something it didn't."

## 7:30–8:30 — The customer writes back
- (Pre-staged) a simulated test text from the water-heater customer lands on the same card. Show **Customer replied** on the Queue.
- Open it: new package, new **Needs a person** items.
> "Replies stay with the job. No new card, no lost thread."

## 8:30–9:15 — Close the loop
- Record outcome **booked**, how we know: "Staff recorded it". Mark Completed.
- Show **Kill — close with no action** on a spam card: reason + second tap.
- Show the card history.

## 9:15–10:00 — Honest status and next step
> "Where this stands: it's a test build. Website form and typed-in requests work in testing. Email, text and missed calls are simulated. No live channel yet — we'd choose the first one together. Payments are off."
> "The founding-client offer is a draft: a one-time setup, and an optional monthly Care Plan you'd only start if you say Yes. Final terms come after review."
> "If it's a fit, the next step is a kickoff call to fill in the setup workbook."

**Don't say:** "live", "connected", "sends texts", "guaranteed", any number about lost leads or revenue, or any client name.

## Questions you may get
- *"Can it book jobs or quote prices?"* — No. A person does that. AIA flags it as a decision.
- *"Can AI send without us?"* — No. Every reply needs a person's Yes.
- *"Is my data safe?"* — Each business has its own desk, and other desks can't see it. The full data note is still in draft and needs review. Don't make other claims.
- *"When can we go live?"* — After the first channel is chosen, set up and tested, and the go-live checks pass. No date promised yet.
