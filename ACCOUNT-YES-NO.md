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
- Add people: search a world @handle on People under More; they Accept there. Email is not a world name. AIA does not send invite mail. Owner vs Helper as on Help. Do not share the owner desk code. Each person their own seat.
- Onboard this desk (`/help#onboard-desk`): four beats — Pipes (copy `www.automateitaway.com/api/hook`; Zapier/Make can post today; Search a site / Log in = vendor console, draft only; Calendar, SMS, Square, eBay HOLD until keys + Yes) · Account / desk identity (desk name + desk code; `james.aia`-style name on Account; no live Business Details / brand-kit page) · People (link `#people-desk`; Owner vs Helper; no Team email seats) · Packs (Studio `/dev` write or install `.aia`; Marketplace browse; fresh desks empty until drop or install; Collect HOLD; no silent charge; no mapping shared OpenAI keys into packs).
- `scripts/check-studio-earnings.js` covers World users launch help + no fake $ ranges as AIA guarantees.
- `scripts/check-world-people.js` covers Add people + Onboard this desk honesty (no invented Integrations Connect Tool, Connected Accounts OAuth, Team email seats, or Import Pack workspace keys).
- Selling packs — risk honesty (`/help#sell-packs` + Studio one-liner): thin JSON; drafts on buyer desk; Yes/Stop/Kill human; Collect HOLD; buyer keys; never hardcode yours; no 100% safe / never banned; creator stands behind pack; Help is not legal advice; bad packs → Talk to AIA / Admin desk; Marketplace can unlist; AS IS note in creator’s own pack docs, not an AIA attach flow.
- When a pack is worth it (`/help#pack-worth`): process already works; multi-step qualify → draft with fallbacks. Not worth: broken offer/process; abandoned when APIs change; trivial webhook → note you can Drop yourself. No $47–$197 / $50/hr / 300 hours / 10–15 minutes tables on that card.
- Wallet Connect one-liner (Account + Help Login): browser wallet for `.aia` / registry when Bridge unlocks — not compute credits or a creator payout ledger. Collect and payouts HOLD.
- Creator takeaways (`/help#creator-takeaways`): pack quality (JSON, buyer keys, fallbacks); People `@handle` Owner/Helper; Collect HOLD; no merchant-of-record money desk / email Team seats / social OAuth.
- `scripts/check-pack-sell.js` covers risk / worth-it / wallet / takeaways honesty.
- Build a pack / desk AI (`/help#build-pack` + Studio one-liner): When (pipe / `name@account.aia` / status / optional wait) → If → Then (desk AI drafts card) → Yes/Stop/Kill. Fallbacks Needs you / Talk to AIA. Thin `.aia` from `/dev`; buyer pipes/keys. Sample JSON illustrative only — desk words, not a bindings product. Yes is not a collect charge. Collect HOLD.
- Desk orchestration (`/help#desk-orch`) = When · If · Then. Sequential / conditional / human-in-the-loop map to desk words. Not a Router Node, sub-agent mesh, or node canvas.
- Ideas → queue (`/help#ideas-queue`): Drop → Qualify → card → Yes / Stop. History past / now / next. No effort or token estimate UI.
- FAQ: work with / for AIA = build packs + Talk to AIA; agency / DFY off-platform; no careers portal / certified partner program. AIA License = no separate license SKU — desk account + pack install; Collect and payouts HOLD; no Free / Pro / Agency license tiers, merchant-of-record, or auto EULA.
- `scripts/check-build-pack.js` covers build-pack / orchestration / FAQ honesty.
- How the queue runs (`/help#queue-runs`): Pipes → Rules When · If · Then → pack / desk AI drafts → Yes / Stop / Kill → Needs you / Talk to AIA. Not codegen, deploy, or GitHub auto-patch. Collect HOLD.
- FAQ plan tiers: no public Free / Pro / Team / Enterprise SKUs or credit pricing yet. One desk account. Collect and payouts HOLD. No merchant-of-record.
- FAQ Create / Drop a goal → draft card → Yes. No autonomous ETA engine. No SaaS codegen.
- Support Talk (`support-talk.js`) calls `AIASpeech.listen(fn, fn)` like Drop / Login. World door still posts to desk `aia` with no pin.
- `scripts/check-queue-help.js` covers queue-run Help + Support Talk listen contract.
- Desk cards (`/help#desk-cards` + Studio one-liner): When → If → Then drafts a queue card (fields / notes), not a chat blob. Yes is not auto-send mail, push git, or a Collect charge. Thin `.aia`; test via Drop or www hook. Real cap: 12 card fields. Sample JSON illustrative — desk words only. Not `render_desk_card`, interactive_review, code_diff / confidence / token badge field types.
- Public Drop (`/drop?ws=`) must honor the URL desk in `drop-preview.js` `deskSlug()` so strangers are not asked “Which desk?” after the link already named one.
- `scripts/check-desk-cards.js` covers desk-cards Help + public Drop `?ws=` honesty.
- `.aia` inbound (`/help#aia-inbound` + Studio one-liner): users create `name@account.aia`; When for packs and rules. Live: `www.automateitaway.com/api/hook` can write a card; unknown `.aia` → 400. MX/DNS for `*.aia` HOLD (`ai.aia` orange until DNS). No live Gmail forward wizard, email vault, or voice/SMS receptionist.
- History person filter is a non-link `#who-chip`; `theme.js` must not steal it (`chip.tagName !== "A"`). Header Sign-in still paints as `a.who-chip`.
- `scripts/check-aia-inbound.js` covers inbound Help + History `#who-chip` honesty.
- Onboard (`/onboard`) writes `aia_ws` / `aia_pin` / `AIADesks.open` only after `/api/auth` succeeds and is not `pending`. Failed open or Ask-to-join pending must not paint a signed-in header.
- `scripts/check-onboard-session.js` covers onboard session order.
- History and Rules `esc()` encode `& < > "` for `innerHTML` (titles / rule text). A card like `2 < 3` must not break the list.
- `scripts/check-history-esc.js` covers History / Rules escape honesty.
- Pipes / Connections saved-desk picker calls `AIADesks.open` (not a missing `AIADeskSwitch`) so `aia_pin` follows the tapped desk.
- `scripts/check-pipes-switch.js` covers that switch.
- People (`/people`) `esc()` must parse and encode `& < > "` so `people.js` loads. A broken quote map is a syntax error — More → People stays empty.
- `scripts/check-people-esc.js` covers that parse + encode.
- Public Drop (`/drop`, `/widget`) uploads `#photo` via `/api/upload` before capture so a photo or file rides on the card. Success must not clear the picker if upload never ran.
- `scripts/check-drop-photo.js` covers that attach.
- Drop preview `gateSend` must not `stopImmediatePropagation` when desk + title are set. Featured quick drops (Need a ride, Drop files) still post. Preview may ask; Drop it still drops.
- `scripts/check-drop-gate.js` covers that gate.
- Public Drop capture 4xx when the named desk is not a real workspace (`No desk with that name`). A real empty desk still takes the card.
- `scripts/check-drop-desk.js` covers ghost slug vs empty-desk Drop.

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
- A live Gmail forward wizard, an email vault, or a voice / SMS receptionist.
- A signed-in header after a failed or pending `/onboard` open.
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
- Email invite mail, User Groups, shared model keys, Connected Accounts for auto-post, or an AIA Studios social scheduler.
- Settings → Integrations LLM/CRM “Connect Tool.” AIA Studios Connected Accounts OAuth (TikTok / Instagram / Threads / X / YouTube). Team email invites with Admin / Creator / Viewer roles. Import Pack that writes workspace API keys or user groups.
- A live Business Details / brand-kit settings page. Calendar, SMS, Square, or eBay as live pipes without keys + human Yes. Mapping shared OpenAI keys into packs.
- Merchant-of-record chargeback holds, payout freezes, a sandbox throttle ladder, or Lemon Squeezy / Paddle as AIA money pipes. A 100% safe / never-banned pack promise. An AIA attach flow for AS IS / EULA.
- Wallet Connect as compute credits or a creator payout ledger.
- $47–$197 / $50/hr / 300 hours / 10–15 minutes tables on “When a pack is worth it.”
- A node canvas, Router Node, or sub-agent mesh. `BUYER_ENVIRONMENT_BINDINGS` or other invented schema products.
- A careers portal or certified partner program. A separate AIA License SKU, Free / Pro / Agency license tiers, merchant-of-record, or auto EULA.
- An effort or token estimate UI on History or the queue. Yes as a collect charge.
- Public Free / Pro / Team / Enterprise SKUs or credit pricing. Codegen, deploy, or GitHub auto-patch from this desk. An autonomous ETA engine or SaaS codegen.
- `render_desk_card`, interactive_review layout, or code_diff / confidence / token badge field types as product. Yes as auto-send mail, push git, or a Collect charge.

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
