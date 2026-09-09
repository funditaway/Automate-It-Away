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

## YES (Connect existing wallet — not Wallet.AIA — 2026-09-07)

- Evolve Account + Desk. Same bind. Not a greenfield Wallet.AIA product.
- Connect MetaMask / Connect WalletConnect — user’s own injected wallet (EIP-1193 / EIP-6963). No AIA-hosted keys.
- Copy: “Your wallet. AIA does not hold keys. Collect and pack pay stay HOLD until Yes + real pipe. .aia Register when Bridge unlocks.”
- Missing provider → honest EMPTY (install / open in that wallet’s browser). No fake QR, no custodial create, no deposit, no pre-fill.
- No WalletConnect relay, Privy, ethers, or hosted seed. No crypto Collect. No silent send. No AIA token / gas currency.
- Card title is Connect existing wallet. Not Wallet.AIA.
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
- Pack quality maps to Drop → Qualify → Do → Collect HOLD → Follow. Fallbacks = Rules + Rail. Slack / Sheets / Notion pipes HOLD until Yes / keys. No “always works.” No invented review-rate stats. Help `/help#world` Four models / Pack quality, and Studio `/dev` `#world` mirrors, use that desk-true spine — not Capture → Qualify. Collect still HOLD until Yes + a real money pipe. `scripts/check-desk-switch.js` covers the leak.
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
- Wallet Connect one-liner (Account + Help Login): your MetaMask or WalletConnect. AIA does not hold keys. Collect and pack pay stay HOLD until Yes + real pipe. `.aia` Register when Bridge unlocks. Not Wallet.AIA. Not compute credits or a creator payout ledger.
- Creator takeaways (`/help#creator-takeaways`): pack quality (JSON, buyer keys, fallbacks); People `@handle` Owner/Helper; Collect HOLD; no merchant-of-record money desk / email Team seats / social OAuth.
- `scripts/check-pack-sell.js` covers risk / worth-it / wallet / takeaways honesty.
- Build a pack / desk AI (`/help#build-pack` + Studio one-liner): When (pipe / `name@account.aia` / status / optional wait) → If → Then (desk AI drafts card) → Yes/Stop/Kill. Fallbacks Needs you / Talk to AIA. Thin `.aia` from `/dev`; buyer pipes/keys. Sample JSON illustrative only — desk words, not a bindings product. Thin App / webhook pack example on Help `#build-pack`, Examples, and Studio (copy, do not seed): When = www hook / pipe, If = tag Lead, Then = draft. Buyer binds their own keys on Pipes. Yes / Stop / Kill before outbound. Not a listed SKU. Not a bindings product. Webhook is the live pipe. Yes is not a collect charge. Collect HOLD.
- First `.aia` pack developer docs (`/dev#first-pack` + More link): real Studio — open desk → name a desk AI → When → If → Then → buyer keys on Pipes → Drop / www hook test → Yes / Stop / Kill before outbound → Download `.aia` (Give) or Install `.aia` with Yes (Update). Webhook is the live pipe. Not a CLI, signed DID, or stake publish. No AAM mainnet, paymasters, AIA token, DAO slash, DePIN, Grandma brand, `BUYER_ENVIRONMENT_BINDINGS` product, IPFS mint, streaming USDC, or aia-studio CLI.
- Desk orchestration (`/help#desk-orch`) = When · If · Then. Sequential / conditional / human-in-the-loop map to desk words. Not a Router Node, sub-agent mesh, or node canvas.
- Ideas → queue (`/help#ideas-queue`): Drop → Qualify → card → Yes / Stop. History past / now / next. No effort or token estimate UI.
- FAQ: work with / for AIA = build packs + Talk to AIA; agency / DFY off-platform; no careers portal / certified partner program. AIA License = no separate license SKU — desk account + pack install; Collect and payouts HOLD; no Free / Pro / Agency license tiers, merchant-of-record, or auto EULA.
- `scripts/check-build-pack.js` covers build-pack / orchestration / FAQ honesty.
- How the queue runs (`/help#queue-runs`): Pipes → Rules When · If · Then → pack / desk AI drafts → Yes / Stop / Kill → Needs you / Talk to AIA. Not codegen, deploy, or GitHub auto-patch. Collect HOLD.
- FAQ plan tiers: no public Free / Pro / Team / Enterprise SKUs or credit pricing yet. One desk account. Collect and payouts HOLD. No merchant-of-record.
- FAQ Create / Drop a goal → draft card → Yes. Needs you / prompt ask-who when the desk asks. No autonomous ETA engine. No SaaS codegen.
- FAQ Needs you: named desk AI / gone HOLD (`Shop Bot · not on this desk`) / prompt ask-who. Reply on the Queue card does not Yes or send. Queue / Cap / Open / History / Explore / People paint the same.
- FAQ install / give / update a `.aia` with Yes on History. Give is the file. Update is install again. Recurring update HOLD. Installed packs auto-shape — no pack pick on every Drop. Collect HOLD. No silent charge.
- FAQ Connect existing wallet: MetaMask / WalletConnect. Your wallet. AIA does not hold keys. Not Wallet.AIA. Collect and pack pay stay HOLD until Yes + real pipe. Help First day People dd names Needs you / prompt ask-who.
- `scripts/check-help-faq.js` covers Help FAQ + People dd + Studio / More FAQ honesty.
- How (`/how`) Paid / Collect: Collect stays HOLD until a person taps Yes and a real Collect money pipe is live. Not “Collect when due.” Not “money waits only if you wrote that rule.” Helper can prep the draft. Yes is not a collect charge. Shop-week means name when money would be due on the card — they do not collect. No fake pricing, credits, or AIA coin.
- `scripts/check-how-paid.js` covers how.html Paid / Collect HOLD honesty.
- How facts / Do film, Help Owner vs helper / Talk / Log in, desk Talk (`api/intake.js`), and Queue handoff still named Send as the HITL rail after Collect HOLD. Desk buttons are Yes / Stop / Kill. Send-it-yourself (copy, text, email) stays. Not “Send or Stop.” Not “Nothing leaves until Send.” Not “taps Send or Stop.” `scripts/check-how-paid.js`, `scripts/check-help-faq.js`, and `scripts/check-queue-help.js` cover that leftover.
- How lead / Talk / public Drop leftover after that pass: still said Yes or No (and Talk cards “Human before send”) after Yes / Stop became the rail. How lead is Yes or Stop. Talk (`api/intake.js`) start / reply / card why / setup name Yes or Stop and Human before Yes. Drop / widget sub matches. Onboard first card why matches. Not “yes or no.” Not “press No.” Send-it-yourself stays. `scripts/check-world-home.js`, `scripts/check-queue-help.js`, and `scripts/check-drop-ux.js` cover that leftover.
- Create / market / engine / grok leftover after that pass: still said Yes or No on live Create form hints / success, Marketplace Do-the-work default, engine queue next, and Grok SYSTEM after Yes / Stop became the rail. Create (`create-desk.js`) hints and done lines name Yes or Stop. Market pack how names Yes or Stop. Engine fallback next is You tap Yes or Stop. Grok SYSTEM Human taps Yes or Stop. Collect HOLD. No silent send. `scripts/check-desk-nav.js`, `scripts/check-packs.js`, `scripts/check-engine.js`, and `scripts/check-desk-grok.js` cover that leftover.
- Desk home / card / queue / handoff leftover after that pass: still said Yes or No on Queue how-in, card rec fallback, We-type-it sheet, desk.html next fallback, unused desk-queue decide fallback, and Rail/Doer handoff after Yes / Stop became the rail. `desk-home.js` says Yes or Stop. `desk-card.js` rec / type-it tap Yes or Stop. `desk.html` fallback next is Yes or Stop. `desk-queue.js` decide fallback is Yes or Stop. `_handoff` Rail/Doer Owner/You tap Yes or Stop. Thin card busy while Reply / Yes / Stop pending — Working. Nothing sent yet. Collect HOLD. No silent send. `scripts/check-desk-switch.js`, `scripts/check-card-needs.js`, `scripts/check-desk-ai-cards.js`, and `scripts/check-desk-prompt-reply.js` cover that leftover.
- Pipes / Connections leftover after that pass: still named Send as the HITL rail on Draft accounts after Yes / Stop became the rail. `pipes.html` / `connections.html` say You still tap Yes or Stop. Connect-drafts flash (`api/connections.js`) is You still tap Yes or Stop. Health Do is draft only — Yes and Stop stay on the desk. Not “cannot Send, Stop.” Not “tap Send and Stop.” Buyer still binds own keys. Collect HOLD. No silent send. Outbound Send HOLD on `.aia` mail stays. `scripts/check-pipes-switch.js` covers that leftover.
- Pipes placeholder leftover after that pass: Search and On this desk webhook sat in a flex row that clipped the honest placeholder on a phone — “Search Gmail, X, Shopify, any s” and “Webhook URL if you picked tha.” Those two fields now take a full row. Same copy. Collect HOLD. No silent send. `scripts/check-pipes-switch.js` covers that leftover.
- Pipes field tips leftover after that pass: `/pipes` and `/connections` had no `?` / Ask AIA while How / Drop / Help already did. Unused `"pipes"` tip in `aia-tip.js` is now on Search, any-site, webhook, and inbound hook. Desk name / Desk code use the same tips as Drop / Login. Buyer still binds own keys. Collect HOLD. No silent send. `scripts/check-aia-tip.js` and `scripts/check-pipes-switch.js` cover that leftover.
- Desk AI field tips leftover after that pass: unused `"desk-ai"` tip in `aia-tip.js` stayed unwired while Create already had **Name this desk AI** and Studio already had **AI 1 name** / **AI 2 name**. Those existing fields now tap `?` / Ask AIA. Create start **What is it?** / **How / what** reuse Drop’s kind and need tips. Did not invent a Name-a-desk-AI field. Yes / Stop / Kill stay human. A bot cannot send or pay. Collect HOLD. No silent send. `scripts/check-aia-tip.js` covers that leftover.
- Studio Open leftover after that pass: Creators Studio dropped the open-desk code when a leftover `aia_session` was present (`hdr()` sent X-Session and skipped X-Pin). Boot GET then failed, and Open Studio posted an empty Owner code — “Account name or code does not match.” — even though Create / Drop still held `aia_pin`. Studio now sends the saved pin with the session, and the Open Studio gate prefills Owner code like Drop / Desk / Pipes. Wrong or empty code still 401. No silent open. No Bind gate bypass. `scripts/check-desk-ais.js` and `scripts/check-account.js` cover that leftover.
- Studio Open leftover after that pass: UI prefill + `X-Pin` with leftover session were live, but POST `/api/account` login still 401’d for an Owner desk `/api/auth` just created. Warm `/api/account` did not re-read the shared blob, so `plans.loginAccount` never saw the open-desk store. `ready()` re-reads the blob each request. Owner onboard issues a session. Login accepts the same Owner slug+pin on the account, the desk, or the owner seat. Wrong or empty code still 401. No silent open. Collect HOLD. `scripts/check-account.js` covers the onboard → openLab path.
- Studio Open leftover after that pass: Preview probe still 401 on `/api/account` login after `/api/auth` login 200 with the same slug+pin. Blob read is 403 (`tmp-file` per Lambda). Auth and account were separate functions, so onboard lived only in the auth `/tmp`. A rewrite alone is not enough while `api/account.js` is still its own Lambda — fold it into auth like `/api/status` into health (`api/_account-http.js` + `/api/auth?via=account`). Login, open, and GET with the onboard session share that memory. Wrong or empty code still 401. No silent open. Collect HOLD.
- Studio mail leftover after that pass: Studio Open with leftover `aia_session` + saved pin now paints the lab (`hdr()` sends both), but `aia-mail.js` still sent `X-Session` and skipped `X-Pin`. Mail GET then 401’d and painted “Open this account…” on the open lab. Mail now sends the saved pin with the session, same as Studio. Leftover session without a pin still 401. Wrong or empty code still 401. Outbound Send HOLD. No silent open. Collect HOLD. `scripts/check-aia-mail.js` and `scripts/check-account.js` cover that leftover.
- index.html follow-up / Bills, help.html Collect dd, consign.html 4 Paid: same Collect HOLD until Yes + a real money pipe. Not “money waits only if you wrote that rule.” Not “Owner lets the money move.” Not live “Square payout.” Helper can prep the draft. Yes is not a collect charge. No fake pricing, credits, or AIA coin. `drop-pack.js` stays unloaded.
- Leftover public surfaces after that pass: how.html film reel, setup.html / examples.html / setup-demo.js Consign cards, marketplace catalog + consign pack face / queue empty / engine hold rec, pricing.html Desk card, legal.html lead + billed-jobs line. Same Collect HOLD until Yes + a real money pipe. Not “4 Paid.” Not “Payout waits on you.” Not live “Per shipped job.” `drop-pack.js` stays unloaded.
- `scripts/check-collect-hold.js` covers those leftover Collect-as-live surfaces.
- World-home nav (`index.html`, `how.html`, `setup.html` + `theme.js` `SITE_LINKS`): How · Setup · Help · Desk. Page CTAs Open desk, Talk, Give pack, Update pack, Desk, Help. Talk + give/update in plain words. One AIA account maps desk AI / bots, packs, more desks, Creators Studio, pipes, company / automation business, Connect existing wallet (not Wallet.AIA). No grandma brand. No mint / Decentraweb / DNS lesson for strangers. Collect HOLD until Yes + a real money pipe. No silent send. `drop-pack.js` stays unloaded.
- `scripts/check-world-home.js` covers that world-home nav / CTA honesty.
- World Help playbook (`help.html` `#playbook-card` + `desk-playbook.js` embed): four steps on one AIA account. `ai.aia` is the door, not a mint lesson. No implementation-path / DNS / `www.ai.aia` how-to on world Help. Studio / More full playbook keeps `ai.aia` orange until DNS (admin HOLD). `examples.html` Stay on this phone — no hashed-session / X-Session jargon. Collect HOLD. `drop-pack.js` stays unloaded.
- `scripts/check-world-home.js` also covers world Help playbook + examples session honesty.
- World Help leftover after that pass (`help.html` lead, First day Desk AI, Words on the buttons Yes): Yes is the rail, not “sends the draft — or Stops it.” First day Desk AI does not teach orange-until-DNS mint. Yes is the human tap — you send the draft yourself, not “post it.” `#aia-inbound` MX/DNS HOLD and Studio / More playbook DNS banner stay. Collect HOLD. `drop-pack.js` stays unloaded.
- `scripts/check-world-home.js` and `scripts/check-help-faq.js` cover that leftover Help lead / First day / Yes honesty.
- World-home field tips (`aia-tip.js` on `index.html`, `how.html`, `setup.html`, `onboard.html`, `login.html`, `drop.html`, `widget.html`, `account.html`, `examples.html`, `help.html`, `support.html`, `pipes.html`, `connections.html`, `create.html`, `developer.html`): tap `?` for extra info. Ask AIA opens Help chat (`/support`) with a richer context payload — field id + plain tip text + optional page. Help chat answers draft / help first. Need a person? Drop a card on the AIA Admin desk (existing queue — not Zendesk). Yes / Stop stay human for outbound. Give pack / Update pack named CTAs + tips on world doors, Help, and Account. A pack puts When → If → Then on this desk queue; buyer binds their own keys; webhook is the live pipe. Thin App / webhook pack example on Help `#build-pack`, Examples, and Studio — copy, do not seed; not a listed SKU; not a bindings product. Drop / widget Title, What-do-you-need, I am, kind, phone, photo, Put data on paste / tell, and injected kind-fields What is needed / When / Preferred outcome / Where / Who it is for / From / Amount note / Callback number tips. Support Title / What-broke / page tips. consign.html Drop it / Yes, not Send to engine. Collect HOLD. No silent send. No ETH escrow, micro-wei, streaming ETH, L2 state channel, NFT license, DID login, IoT / robotics / virtual-phone marketplace, future-Pack SKU, pack-partners market, AIA coin, or `drop-pack.js`.
- `scripts/check-aia-tip.js` covers that tooltip + Ask AIA context + Admin card honesty.
- Help chat Quiet leftover after Ask AIA: Quiet always rewrote `#thread` to the stock prompt. Hear this sits beside Quiet, so stopping speech after a field deep link also erased the painted answer. Quiet now stops speech and restores HOME — the Ask AIA answer when present, the stock prompt when there is no deep link. Hear this still reads the thread. Collect HOLD. No silent send.
- `scripts/check-aia-tip.js` also covers that Quiet leftover.
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
- Saved Drop chips open a token-only email-session desk without asking for a leftover pin. `pick()` uses `AIADesks.hasAuth` / token. `deskOpen` / `deskIsOpen` follow `shopOpen()` (session or pin).
- `scripts/check-drop-session.js` covers that chip path.
- Queue Ask Grok on `/desk` posts `recommend` through `helpWithAi` on `desk-needs.js` (already loaded on the queue). Drafts onto the card. Yes / Stop / Kill stay human. Collect HOLD. Not Studio pack Ask Grok. No Grok OAuth / SpaceX login.
- `scripts/check-desk-grok.js` covers that tap.
- When → If → Then `draft` on Qualify writes the named desk AI onto the card (prompt / does). Generic pack brain does not win. No named AI still Then-drafts HOLD. Incoming Drop draft stays. Yes / Stop / Kill stay human. Collect HOLD. No silent send.
- `scripts/check-orch-then.js` covers that Then.
- Queue cards on `/desk` (`desk-needs.js` `card()`) surface title / why / draft / assignee (esc’d), the named Then draft, Needs you / ask-the-human, Ask Grok, Yes / Stop / Kill, HOLD / nothing sent alone, photos/files, and Cap rows in the same visual system. Not pack boilerplate. Not a Drop rewrite. Collect HOLD. AI still cannot Yes / Kill.
- `scripts/check-desk-queue-cards.js` covers that face.
- Prompt reply on the q-card: when Needs you / Ask the human / a desk AI asks, the owner (and a seated helper) types a reply on the card. Reply lands on thread / history and can unblock the next Then. Reply does not Yes, ship, or send money. Desk AI cannot reply as Yes. Nothing sent alone.
- Then-after-Yes: after a person taps Yes, When=do Then can continue on a new card or the next Then. HITL stays. Collect HOLD. No silent send.
- `scripts/check-desk-prompt-reply.js` covers the prompt face + reply API + helper seat + desk-AI 403.
- `scripts/check-orch-then.js` covers Then-after-Yes spawn.
- Named desk AIs on queue cards: `desk-needs.js` `card()` shows which desk AI drafted / owns the Then (name + short does / prompt chip). Ask Grok / Then draft / Needs you name that AI when one is set. `/desk` `#desk-ais` paints each bot as a card (name, does, prompt summary, queue-card face). People Agents cards show the same. Ask Grok `recommend` stamps the named AI. Yes / Stop / Kill stay human. Collect HOLD. Prompt reply + Then-after-Yes stay.
- `scripts/check-desk-ai-cards.js` covers the named-AI face + bot cards + recommend stamp.
- Edit desk AI on bot cards: owner updates name / does / prompt from the Desk AI strip or People Agents via existing `save-ai`. Queue chips follow. Helpers do not edit.
- Assign / reassign named AI on a queue card: owner picks which desk AI owns Then / Ask Grok / Needs you. `bind-ai` stamps that AI. Chips update honestly. Desk AI cannot bind itself. Yes / Stop / Kill stay human.
- Clearer AI ↔ human thread on the q-card when replies + Then drafts stack. Escaped. Nothing sent alone. Collect HOLD.
- `scripts/check-desk-ai-edit.js` covers edit / bind / stacked thread + helper 403 + desk-AI 403.
- Rules Then bind: owner picks which named desk AI writes Then=draft. `aiId` / `aiName` persist on the rule. Matching cards stamp that AI, not the first eligible bot. Unknown name 400. Gone AI drafts HOLD without pretending another bot is bound. Helpers stay 403. Incoming Drop draft stays. Yes / Stop / Kill stay human. Collect HOLD. No silent send.
- `scripts/check-rule-ai-bind.js` covers Rules Then bind + two-AI pick + helper 403 + gone-AI honesty.
- Then-bind HOLD after Qualify: Drop capture, hook, Ask Grok / qualify, and the worker must not first-eligible overwrite a named Then bind. Gone AI keeps `thenAiGone` and stays HOLD — no James-on-Shop-Bot-card. Notify Then stamps the bound AI, or names the missing bot. Queue / Open paint `Shop Bot · not on this desk` escaped. Owner bind-ai clears the hold. Yes / Stop / Kill stay human. Collect HOLD. No silent send.
- `scripts/check-then-bind-hold.js` covers capture / hook / worker / notify / gone-AI paint honesty.
- History paints the same AI ↔ human thread / Then draft / replies the q-card already shows. Escaped. Explore sheet too. Cap and Open-job catch up. Search finds thread text. When `thenAiGone` is on the item, History / Explore / Cap paint `Shop Bot · not on this desk` instead of a live Then draft — including ask / rec `talkHtml` labels, not only the Then block. A gone rec/ask with no `from` does not fall back to Desk AI. Nothing sent alone. Collect HOLD.
- `scripts/check-history-thread.js` covers History / Cap / open-job thread honesty, including gone HOLD paint and gone talk labels.
- People shared-trail open cards (yours / theirs) paint the same Then draft, named desk AI or gone HOLD, ask / reply turns, and “On the card. Nothing sent alone.” Escaped. `historyCard` carries draft / deskAi / thenAiGone / thread. Gone ask / rec labels match Then (`Shop Bot · not on this desk`), never Desk AI. Nothing sent alone. Collect HOLD.
- `scripts/check-people-open-cards.js` covers People open-card API + paint honesty.
- Queue Ask Grok / `namedAskWho` holds a gone Then bind. `thenAiGone` (or a gone Then AI) does not first-eligible to `primaryAi()`. Paint is `Ask Grok · Shop Bot · not on this desk` / HOLD ask, escaped. The recommend banner does not say a live primary drafted. Owner `bindAiHtml` holds the gone bind as the selected option and does not first-select the live primary. Unbound cards still name the live primary. Yes / Stop / Kill stay human. Collect HOLD. Nothing sent alone.
- `scripts/check-ask-grok-gone.js` covers gone Ask Grok / namedAskWho / bindAiHtml honesty + esc.
- Queue `promptHtml` / Needs you ask-who holds a gone Then bind. `thenAiGone` paints `Shop Bot · not on this desk` on the Needs you chip and prompt ask-who, not anonymous Needs you / The desk AI asked. Shared `goneHoldLabel` / `namedNeedsWho` match `namedAskWho` + talkHtml gone paint. Escaped. Live named Needs you / prompt still name that AI. Unbound cards still say Needs you. Yes / Stop / Kill stay human. Collect HOLD. Nothing sent alone.
- `scripts/check-prompt-gone.js` covers gone Needs you / promptHtml honesty + esc.
- Cap `loadCap` / `capCardHtml` and Open-job `threadSheetHtml` paint the same Needs you / prompt ask-who gone HOLD as Queue. Shared `promptHtml` / `chipsHtml` / `namedNeedsWho` (Open fallback `namedNeedsWhoOf`). Escaped. Cap chips stay honest via `cardNeeds`. Live named Needs you / prompt still name that AI. Unbound still say Needs you. Yes / Stop / Kill stay human. Collect HOLD. Nothing sent alone.
- `scripts/check-cap-prompt-gone.js` covers Cap / Open-job gone Needs you / promptHtml honesty + esc.
- History / Explore and People open cards paint the same Needs you / prompt ask-who gone HOLD as Queue. Shared `promptHtml` / `namedNeedsWho` / `goneHoldLabel` / `chipsHtml`. Gone Then paints `Shop Bot · not on this desk` on the Needs you chip and prompt ask-who, not anonymous Needs you / The desk AI asked. Read-only on History / People — no reply send. Escaped. Live named Needs you / prompt still name that AI. Unbound still say Needs you. Yes / Stop / Kill stay human. Collect HOLD. Nothing sent alone.
- `scripts/check-history-prompt-gone.js` covers History / Explore / People open-card gone Needs you / promptHtml honesty + esc.
- History / Explore show a world-user account roadmap (past / now / next) on the existing History surface. Now: one account → one desk, Drop → Qualify → Do → Collect HOLD → Follow, named desk AIs, Yes / Stop / Kill, people share, install `.aia` with Yes. Give pack = download / share `.aia` (`download-pack`). Update pack = install this `.aia` again (`install-aia`). Recurring update pass HOLD. Silent desk-to-desk give HOLD. `.aia` identity HOLD until mint. Browser wallet mentioned only as identity / prep — no custody. Explore sheet + People shared trail + Account point at the same roadmap. Escaped. No invented charge pipes. No AIA coin, custodial Wallet.AIA, on-chain pack buy/sell, cloud hosting, credits, ads, OAuth, or robots as live.
- `scripts/check-history-roadmap.js` covers History / Explore / People / Account roadmap honesty + esc.
- Installed packs auto-shape queue cards. Drop / hook / desk chat do not ask you to pick a pack each time. Qualify stamps `pack` + `custom.face` (who / what / when / where / how) from the desk pack. Pack rules already on the desk still fire. Creator `.aia` packs keep their face — they do not fall through to Home. Yes / Stop / Kill stay human. Collect HOLD. No silent send. No pack marketplace picker on every Drop.
- `scripts/check-pack-queue-shape.js` covers installed-pack capture face, creator-pack honesty, Drop skip-pick, and queue paint.

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
- Public Grok Bot API as a login gate. Grok OAuth / SpaceX login as a desk door.
- Whatnot.
- Treating a demo ship as a live payout.
- Killing a live job from the account page.
- Moving money from the account page.
- A second dashboard.
- Live SMTP / MX for `.aia`. DNS for ai.aia / *.aia does not resolve yet.
- A live Gmail forward wizard, an email vault, or a voice / SMS receptionist.
- A signed-in header after a failed or pending `/onboard` open.
- Embedded wallets, key generation, or gas sponsorship.
- Wallet.AIA — a custodial AIA-hosted wallet, deposit / pre-fill, crypto Collect, silent send, or an AIA token / gas currency.
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
- A WalletConnect cloud relay or QR that pretends AIA hosts the keys.
- $47–$197 / $50/hr / 300 hours / 10–15 minutes tables on “When a pack is worth it.”
- A node canvas, Router Node, or sub-agent mesh. `BUYER_ENVIRONMENT_BINDINGS` or other invented schema products.
- A careers portal or certified partner program. A separate AIA License SKU, Free / Pro / Agency license tiers, merchant-of-record, or auto EULA.
- An effort or token estimate UI on History or the queue. Yes as a collect charge.
- Public Free / Pro / Team / Enterprise SKUs or credit pricing. Codegen, deploy, or GitHub auto-patch from this desk. An autonomous ETA engine or SaaS codegen.
- `render_desk_card`, interactive_review layout, or code_diff / confidence / token badge field types as product. Yes as auto-send mail, push git, or a Collect charge.
- Give pack as a silent push to another desk.
- A live recurring pack-update subscription engine.

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
