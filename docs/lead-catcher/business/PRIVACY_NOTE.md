DRAFT — for James's review. Not legal advice. Not published.

# Lead Catcher — How Data Is Handled (DRAFT outline)

[NEEDS QUALIFIED LEGAL/PRIVACY REVIEW: this whole document. It is an outline of what the test build does today. It is not a privacy policy, not a data-processing agreement, and makes no compliance claim of any kind.]

## 1. What this covers
How Lead Catcher stores and shows the information in each customer request. It describes the **test build** only. The test build uses made-up data. It does not accept real customer data.

## 2. What a card holds
Each customer request is one card. A card can hold:
- **The request as it came in:** the customer's words, how it came in (website form, typed in, or a simulated test channel), and when. These are saved exactly and can't be edited.
- **Contact details:** name, phone, email. AIA may suggest these from the message. A person confirms the contact and records how they confirmed it.
- **Job details:** kind of job, urgency, service address, what they want, missing or unclear items.
- **Work details:** owner, backup, next step, due time, waiting reason, follow-up date.
- **AI work packages:** what AIA prepared, and what staff accepted, fixed or rejected.
- **Replies:** every draft version, every Yes and Stop, and every send result (test outbox, failed, or sent by a person).
- **Customer replies** that came back to the card.
- **Outcome:** booked, quoted, referred, no answer, not a fit, lost, spam or other, and how we know.
- **History:** a record of every step, who did it and when. It can't be changed.
- **A record of access checks:** allowed and refused attempts on the desk.

## 3. Who can see it
- **Only people with a seat on the business's desk.** What each seat can do is set by the desk owner.
- Seats: Desk Owner, Approver, Supervisor, Responder, Technician. All can read cards and history.
- **Desk AIs can't hold a seat.** They can't approve or send anything.
- A System Admin seat exists only if the desk owner sets it. Today it can still see contact details on the card page. [PLACEHOLDER: James's decision on System Admin access to contact details.]
- [PLACEHOLDER: which AIA operators can access a client desk for support, and under what rules.]

## 4. Desk isolation
- Each business has its own desk. A desk is decided by who is signed in, never by what a request asks for.
- Every lookup is limited to the signed-in person's desk. Another business's card looks the same as a card that doesn't exist.
- Lead Catcher keeps its data in its own separate store, apart from the rest of AIA's data.

## 5. What the AI sees
- AIA prepares each work package from **that one card only**: the request, the latest replies on that card, the card fields that seat may see, the desk's reply wording, and the workflow rules.
- It never sees other cards, other desks, passwords, keys or the wider store.
- By default the work package is built by fixed rules, not an outside AI model. An optional model is off. [PLACEHOLDER: if a model is ever turned on, name the provider and its data terms here — needs review first.]
- Customer messages are treated as information, never as instructions.

## 6. Where data is stored and for how long
- Test build: a separate temporary file. On the hosted test build it can disappear at any time.
- [PLACEHOLDER: permanent storage location and provider — not chosen yet.]
- [PLACEHOLDER: how long data is kept — no retention policy exists yet.]
- [PLACEHOLDER: backups — none yet.]
- [PLACEHOLDER: how a client exports its data — no export tool yet.]
- [PLACEHOLDER: how data is deleted on request — no delete tool yet.]

## 7. Sending messages to customers
- Today nothing is sent to customers. Approved replies go to a test outbox.
- [NEEDS QUALIFIED LEGAL/PRIVACY REVIEW: consent and opt-out rules for email and text before any live channel.]
- [PLACEHOLDER: which outside provider carries live messages, once chosen, and what it stores.]

## 8. Payments
Lead Catcher collects no payment details. Payments are off.

## 9. Sharing and selling data
[PLACEHOLDER: James's statement on sharing or selling data. The product spec does not cover this, so no claim is made here.]

## 10. Questions and requests
[PLACEHOLDER: contact for data questions and requests.]

## Not claimed
This draft makes **no** claim of compliance with any law, standard or certification (for example HIPAA, SOC 2, GDPR, CCPA, TCPA or CAN-SPAM). Any such claim needs qualified review first.
