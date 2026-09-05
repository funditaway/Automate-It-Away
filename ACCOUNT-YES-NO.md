# AIA account — yes / no

Owner: James Oddo. Product: one AIA account, many desks.

## YES (James said push on 2026-09-03)

- Persist `accounts`, `sessions`, `approvals`, `locks` in the same store as jobs.
- `X-Session` + HttpOnly cookie. Second phone can keep a seat without typing the pin every tap.
- Email + password door. Hash only. No email reset.
- Desk name + code still works and now mints a real `acct_*` id.
- Unique account ids (time + random). Email cannot be on two accounts.
- Eight bad email tries → 429 for 15 minutes.
- Account actions: login, password, details, plan, attach, mint, logout, logout-all, sessions, export, mfa.
- Export copy has no pin and no password hash.
- Plan switch stays `charged: false`.
- Account page lists phones, export, leave every phone.
- `.aia` email identities `{local}@{account}.aia` for Automations. Create/manage on Account, Studio, Desks. Inbound `/api/hook` → Drop/Capture on the bound desk. Mailbox is not the assignee. AI-bound identities assign the named desk AI and draft. Outbound Send HOLD. No live SMTP/MX.
- `scripts/check-account.js` — nine passing contract tests.

## YES (AIA Internet / `.aia` TLD status — 2026-09-05)

- Account card next to Wallet. Status from a cached Decentraweb probe: Bridge locked | Available to register | Owned.
- Probe `GET /bridge/lockDomain/aia` and `POST /domain-validation` only. Never `approve-registration` from this server (that can reserve a name).
- `/api/status` exposes `aiaTld: { available, bridgeLocked, ownedByConnected }`. Owned only when the connected wallet matches a real registry owner. Never invent owned.
- Locked copy: “Bridge locked on Decentraweb — watching. When unlocked, Connect wallet then Register.”
- Wallet connected + still locked: short address + “Ready to mint when Bridge clears.”
- Unlocked + wallet: **Register `.aia`** on this desk — browser `approve-registration` with owner=connected address, then James signs commit, waits ~60s, signs register. Fee (~0.041–0.045 ETH + 10% buffer, or DWEB) shown before send.
- Unlocked + no wallet: Connect first. Locked: unchanged watching copy. If approve-registration still returns Bridge lock, UI stays locked.
- Server never calls `approve-registration` (that can reserve a name). Server may return calldata/quotes only. No keys. No silent Collect. No demo balance.
- `scripts/check-aia-tld.js` and `scripts/check-aia-register.js`.

## YES (AIA Wallet Connect — EIP-1193, 2026-09-04)

- Browser wallet on Account. `window.ethereum` / MetaMask-first. No WalletConnect infra.
- Persist `walletAddress` + `walletChainId` on the open desk session and the account blob.
- Short address (`0x1234…abcd`) + chain label + Disconnect. Disconnect clears local session storage.
- `/api/status` and Account UI show connected only when an address is actually stored. No fake connected.
- Identity / TLD ownership only on the Wallet card. Register .aia lives on the TLD card when Bridge is clear. Collect stays HOLD.
- Bind/revoke writes `Pipe · wallet bound` / `Pipe · wallet revoked` on the existing audit log. No tx broadcast.
- No custodial keys on the server. No demo seed balance. No silent Collect.
- `scripts/check-connect-wallet.js`.

## YES (wallets / Ext / X Money — ledger only, 2026-09-03)

- Each adult seat can hold its own wallet. Bills hit THAT wallet.
- Ext (off-desk) work can bill that same seat.
- X Money is a named pay rail. Handle on the seat. Status hold.
- Owner override of a HOLD needs a second tap and a reason.
- People cards show Can / Never / Money / Ext / X handle.
- `scripts/check-wallets.js` isolation tests.

## YES (Creators / earnings honesty — 2026-09-05)

- Studio (`/studio`, `/dev`, `/developer`) states: no public payout baseline; you earn by pricing packs; Collect stays HOLD until human Yes + a real Collect money pipe; private project / company / family desks stay off Market.
- Agency or client consulting retainers are off-platform — the creator’s client rates, not an AIA published schedule.
- No affiliate portal or referral percent on automateitaway.com.
- `scripts/check-studio-earnings.js` — Studio + Marketplace copy stay honest; Collect HOLD unchanged.

## YES (World users launch help — 2026-09-05)

- Help (`/help#world`) and Studio (`/studio`, `/dev`, `/developer` `#world`) show a 4-step launch path for World users who create their own AI / packs: Core setup → First pack suite → Package & monetize → GTM.
- Days are a guide, not a promise. Spine stays the AIA playbook: Audit → Pipes → named desk AI → Rules (When → If → Then) + Yes / Stop / Kill.
- On-desk path kept: open a desk → create / name a desk AI → pack `.aia` → Marketplace or private. Simulate inbound / www hook. Fresh rules stay empty. No demo seed. No silent Collect.
- Off-platform: OpenAI / Anthropic, Make / Zapier, CRMs wait on keys + Yes. Agency / DFY / co-pilot are off-platform labels. Price bands ($47–$197 packs, retainers, $997 DFY) are illustrative / off-platform — not an AIA rate card.
- Paid ads stay principles only (ROAS / CAC / funnel). Example thinking only. AIA does not run ads or guarantee ROAS. No $29/$97/$297 tables. No monthly P&L. No affiliate percent. No platform-search rank promise.
- Four models labeled on-desk vs off-platform: Agency / DFY / co-pilot off-platform; Marketplace on-desk Studio. First 3 clients: audit → 60s proof → risk-free trial. No invented close rates. 10–15% cuts are examples only, not AIA terms.
- Pack quality maps to Capture → Qualify → Do → Collect HOLD → Follow. Fallbacks = Rules + Rail. Slack / Sheets / Notion pipes HOLD until Yes / keys. No “always works.” No invented review-rate stats.
- Funnel tiers (Tripwire / Core / High-ticket DFY) and price bands stay illustrative — you set prices. Recurring update pass stays Collect HOLD; no invented subscription engine. $0.05/exec is off-platform or a future pipe — AIA does not host per-run billing.
- On-desk Pack Creator: named desk AIs + webhooks + CRM pipes when connected, packed as `.aia`. Social *repurposing drafts* only — not auto-publish unless a live pipe exists. Social auto-post is a future / off-platform pipe — not live OAuth.
- Account door: desk name + code, or email + password on /account. Not social SSO. Marketplace GTM is clear titles + niche keywords — no top-ranking guarantee.
- Build automation packs blueprint maps to this desk: niche problem → core logic stack (Trigger / Qualify + desk AI / Rules + Rail / destination pipes) → plug-and-play → Free / core / DFY tiers. Illustrative $ only. No silent crash.
- Learn packs: rebuild from memory on an empty desk; Trigger → Condition → Action in plain words; revisit Rules over days; one pack end-to-end. 20-hour competence is a guide, not a guarantee.
- Limits on create / sell (real only): 6 named AIs per desk (Studio draft 3), 8 Rules, 12 fields, 12 `.aia` emails per account. No published Marketplace listing cap. No published `.aia` file-size cap. Desk uploads 8 MB. External storefronts off-platform. Buyers bring their own keys.
- Stock FAQ: AIA / automateitaway.com is privately held, not listed. Retail cannot buy shares on brokers. Not investment advice. Do not invent founder/VC splits, secondary markets, or IPO plans.
- `scripts/check-studio-earnings.js` covers World users launch help + no fake $ ranges as AIA guarantees.

## NO (do not pretend these shipped)

- Live card charge. `charged` stays false.
- Live X Money pull. No X_MONEY_TOKEN path.
- Insurance premium, COLI, or producer trust through X Money.
- Owner wallet as fallback when a seat wallet is empty.
- A billed wallet on a child family seat.
- Agents sending or holding money.
- Charge Desk / Pro / Crew.
- Email or SMS reset codes.
- Authenticator on. API returns 409 HOLD.
- Public Grok Bot API as a login gate.
- Whatnot.
- Treating a demo ship as a live payout.
- Killing a live job from the account page.
- Moving money from the account page.
- A second dashboard.
- Live SMTP / MX for `.aia`. DNS for ai.aia / *.aia does not resolve yet.
- Embedded wallets, key generation, or gas sponsorship.
- Server-signed Decentraweb mint / Bridge. On-desk Register is client-only when Bridge is clear; James signs every tx.
- Collect charges through Square / Stripe / a wallet pipe.
- A public creator payout baseline, affiliate percent, or published agency rate card.
- Invented AI Creator income bands, affiliate percents, or influencer payout tables.
- A demo seed ($250) as a payout floor.
- Live usage / micro-SaaS / per-exec billing hosted by AIA.
- A platform subscription engine for pack updates.
- Live Slack / Sheets / Notion send without keys + Yes.
- Live social auto-post / auto-schedule / Login Kit / hands-off niche accounts. Social OAuth publish is not live.
- Social SSO as the account door. Live doors are desk name + code, or email + password.
- Public AIA stock, an IPO plan, founder/VC ownership tables, or a secondary-market sale on this desk.

## Ask me if

- Override would pass a HOLD.
- Money out is $250 or more.
- This is a Kill on a live job.
- A customer is named in an outbound message.
- A pipe token is missing, expired, or 401.
- Undo would touch money already moved.
- The artifact is a legal letter or contract.

## Test on a phone after deploy

1. Open `/onboard` — desk name + 4+ digit code.
2. Open `/account` on that phone — profile saves.
3. Set email + password.
4. Leave this phone.
5. Open `/login` with email + password on a second phone.
6. Confirm the same desks list.
7. Export the book. Open the file. No password hash.
8. Turn on authenticator — page should say HOLD.
9. Ship $251 on the desk — still 409 held if that desk has the money-wait rule.
