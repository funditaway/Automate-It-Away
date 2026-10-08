# Lead Catcher — Known Limitations (updated 2026-10-08)

1. **Nothing is sent.** Outbound goes to a MOCK outbox file labelled "MOCK — NOT SENT". Email, text and missed-call intake are MOCK adapters. T12 (live channel) is NOT RUN.
2. **Not on the live site.** Tested on a local handler only. The branch builds as a Vercel preview (READY), but no checks were run against the preview and nobody has signed in on it. Whether a preview can reach the production Blob store is **unverified** (Vercel env and integration listings returned 403, retried once). `automate-it-away` previews are public (no Vercel Authentication). See PREVIEW_ISOLATION.md for the table and the changes proposed for James. Note that AIA's existing `ready()` can write to the shared store on any request; this was true before Lead Catcher.
3. **Store is not durable on Vercel.** Default `/tmp` is per-instance and temporary. Two serverless instances would not share Lead Catcher data.
4. **One pack per desk in AIA.** AIA's `shop.pack` holds one pack. Lead Catcher works around this with its own on/off and doesn't touch `shop.pack`.
5. **Ownership lives in the Lead Catcher store**, not on the AIA account record.
6. **Queue yes, History no.** Active Lead Catcher cards now show on the main AIA Queue (/desk), read-only, in their own block above AIA cards (not interleaved, not in AIA's pack filter chips). Completed and closed Lead Catcher cards stay on the Lead Catcher page. Lead Catcher events are not on the main History tab yet. Acting on a card (Yes, Stop, Kill, Run) happens only on the Lead Catcher card page.
7. **Self-approval allowed.** An Approver can Yes their own draft, and a Responder can Run someone else's Yes. This is pending James's decision.
8. **No rate limiting** on the public intake. Only a per-desk hashed key.
9. **No retention, export or deletion** tooling.
10. **Staff handling time is not measured.**
11. **Fake clock in tests.** Time-based checks (TTL, overdue) use an injected clock.
12. **Whole-repo `npm test` is red on main** (stops at check-desk-nav). Per-script results: same 49 failures on main and branch.
13. **Helper is rule-based.** It reads English only and is tuned to the five trades. It flags rather than guesses.
14. **Commercial terms are DRAFT** and not legally reviewed. No trademark clearance has been done for "Lead Catcher".
15. **Function count is 11 of 12** on the Vercel Hobby plan (the Queue work added no function).
16. **Helper picks the first matching kind of job** when several match (e.g. "roof leak" → Plumbing) and flags it for a person to check (G12).
17. **Screenshots are on the box only** (/workspace/lc-shots, earlier /workspace/lc-screens). The GitHub connector carries text files only, so PNGs and the .sh executable bits are not on the remote branch (run the scripts with `bash`).
18. **The work package is rule-based.** It reads English only, picks the service from a fixed word list, and asks rather than guesses. The optional model adapter stays off; when on, it only adds allow-listed field suggestions.
19. **Reply templates are AIA defaults.** Desks can't edit or approve their own templates yet (G17). The context is built to read desk templates once they exist.
20. **Decisions are recorded, not handled.** Scheduling and price are separate "Needs a person" items. AIA has no calendar or estimate tool; a person checks the schedule and gives the estimate outside AIA (G19). Accepting a decision only records that a person took it.
21. **Connection up/down is a MOCK test switch** (desk owner only). There is no real connection health check because there is no real channel (G15, G04).
22. **Customer replies match by confirmed phone or email** on MOCK channels only, and only to a card whose reply already ran. Real threading (message ids) waits on a real channel (G16). A reply to a card with no reply run yet becomes a new card.
23. **System Admin can still see contact details on the card page.** The AI context and package hide them for that seat (G18).
24. **A package prepared before the card had an owner** uses "Someone from our team" in its draft. Press "Prepare again" after assigning to get a draft with the owner's name.
25. **"I sent it myself" is self-reported.** AIA records who reported it, the channel and whether the approved words were used, but can't verify the person actually sent it or what they said.
