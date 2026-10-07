# Lead Catcher — Known Limitations (2026-10-07)

1. **Nothing is sent.** Outbound goes to a MOCK outbox file labelled "MOCK — NOT SENT". Email, text and missed-call intake are MOCK adapters. T12 (live channel) is NOT RUN.
2. **Not deployed.** Tested on a local handler only. No Vercel preview has been verified. Whether a preview can reach the production Blob store is **unverified** (Vercel env listing returned 403). Note that AIA's existing `ready()` can write to the shared store on any request; this was true before Lead Catcher.
3. **Store is not durable on Vercel.** Default `/tmp` is per-instance and temporary. Two serverless instances would not share Lead Catcher data.
4. **One pack per desk in AIA.** AIA's `shop.pack` holds one pack. Lead Catcher works around this with its own on/off and doesn't touch `shop.pack`.
5. **Ownership lives in the Lead Catcher store**, not on the AIA account record.
6. **Separate page.** Lead Catcher cards don't appear in AIA's main Queue/History yet.
7. **Self-approval allowed.** An Approver can Yes their own draft, and a Responder can Run someone else's Yes. This is pending James's decision.
8. **No rate limiting** on the public intake. Only a per-desk hashed key.
9. **No retention, export or deletion** tooling.
10. **Staff handling time is not measured.**
11. **Fake clock in tests.** Time-based checks (TTL, overdue) use an injected clock.
12. **Whole-repo `npm test` is red on main** (stops at check-desk-nav). Per-script results: same 49 failures on main and branch.
13. **Helper is rule-based.** It reads English only and is tuned to the five trades. It flags rather than guesses.
14. **Commercial terms are DRAFT** and not legally reviewed. No trademark clearance has been done for "Lead Catcher".
15. **Function count is 11 of 12** on the Vercel Hobby plan.
