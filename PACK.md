# Packs

The drop is the raw work. The pack is how that card looks and how it acts.

Same words on two desks become two different cards. That is why a pack is worth getting.

## Card state (one machine)

Every card uses the same states. Packs do not add a second machine. They change which waits fire and which face you see.

**Status** (what the queue thinks the card is):

- `exception` — just captured, not qualified yet
- `waiting` — on the queue
- `held` — a rail stopped Yes (bind, payout, credit, money)
- `out` — handed off a pipe, waiting writeback
- `shipped` — owner tapped Yes and it left
- `killed` — owner tapped Stop

**Step** (where it sits in the five):

1. Capture — Drop stamped the card
2. Qualify — desk asks what is missing, Grok drafts
3. Do — owner taps Yes / Stop / Copy / Text / Email / Hand
4. Collect — money / payout / bind / credit if the pack has one
5. Follow — one nudge, then stop

**Also on the card:** `waitingOn` (`owner` | `helper` | `info`), `pack`, `custom.face` `{who,what,when,where,how}`, `next`, `draft`, `rail`.

Human still taps Yes or Stop. Agents only draft.

## Pack config syntax

Official files live in `packs/{id}.json`. Using a pack copies `rules` onto the desk.

```json
{
  "id": "vita",
  "name": "Insurance desk",
  "family": "Quote It Away",
  "face": {
    "who": { "key": "contactName", "label": "Who it is for" },
    "what": { "key": "need", "label": "What they need" },
    "when": { "key": "timing", "label": "When" },
    "where": { "key": "state", "label": "State" },
    "how": "Draft a packet. Bind stays off. Illustration send is an owner tap."
  },
  "capture": ["note", "call", "form", "quote"],
  "qualify": ["this week", "who it is for", "illustration"],
  "do": ["packet draft"],
  "collect": ["bind stays off the desk"],
  "follow": ["one nudge"],
  "taps": ["illustration send", "bind"],
  "kill": ["not a fit", "already covered"],
  "fields": {
    "capture": ["title", "kind", "contactName", "phone", "notes", "pack", "timing"],
    "qualify": ["timing", "risk", "why"],
    "do": ["draft", "artifact"],
    "collect": ["confirm"],
    "follow": ["followed"],
    "rail": ["killReason", "whoTapped"]
  },
  "rails": ["Bind stays off the desk."],
  "rules": [
    { "text": "Cap this-week cards.", "when": "qualify", "then": "wait", "contains": "this week" },
    { "text": "Stop if this is an illustration.", "when": "do", "then": "stop", "contains": "illustration" },
    { "text": "Wait on bind.", "when": "do", "then": "wait", "contains": "bind" }
  ]
}
```

Rule keys (When → If → Then):

- `when` — **Trigger**: `drop` | `pipe` | `inbound` | `status`. Playbook steps still work: `qualify` | `capture` | `do` | `collect` | `follow`
- `then` — **Action**: `draft` (desk AI, HOLD) | `queue` (Queue card / alert) | `notify` (draft HOLD) | `tag` | `escalate` | `wait` | `stop` | `note`
- **If** — `contains`, `ifTag`, `ifStatus`, `ifUnassigned`, `ifOlder` (hours), `ifMoney`, `ifField` + `ifValue`
- `tag` — word to put on the card when Then is tag (or alongside draft)

A **rule** is one When → If → Then on this desk.

**Workflows / Sequences** are packs that string rules (optional `delay` / `branch`). Still thin JSON. No dashboard fork.

```json
{
  "workflows": [
    {
      "id": "lead-click",
      "name": "Lead clicked",
      "rules": [
        { "text": "Click + Lead → tag Interested. Draft HOLD.", "when": "drop", "ifTag": "Lead", "contains": "click", "then": "draft", "tag": "Interested" }
      ]
    }
  ]
}
```

`taps` are owner-only. `rails` are the face hints. `face` is who / what / when / where / how.

## Named desk AIs

Pack JSON may declare one or more desk AIs. Installing the pack attaches them to that desk. They draft under the desk’s rules. They never Yes, Stop, money, or mail.

```json
{
  "ais": [
    {
      "name": "James’s AI",
      "role": "Doer",
      "does": "Drafts desk work for this project",
      "prompt": "Do not send. Do not invent a price.",
      "steps": ["qualify", "do", "follow"],
      "deny": ["send", "stop", "money", "mail", "yes", "kill"]
    }
  ]
}
```

`ais` (or `bots` as an alias) are bound to the desk. `steps` are the stages they may draft. Collect is never allowed. Owner Use / private-install is the Approve tap. List on Market with an ask, or keep private for this account’s desks. Collect stays HOLD.

## Creators / earnings (Marketplace money)

AIA has no public payout baseline and no published creator rate card. Creators earn by pricing a pack — a listed ask. Collect stays HOLD until a person taps Yes and a real Collect money pipe is live. No silent charge. No demo seed ($250 never). Private project, company, or family desks stay off Market.

Agency or client consulting retainers are off-platform — your client rates, not an AIA published schedule. There is no affiliate portal or referral percent on automateitaway.com. Do not invent AI Creator income bands, affiliate percents, or influencer payout tables.

## Selling packs — risk honesty

Not legal advice. A pack is thin JSON. It drafts on the buyer’s desk. Yes / Stop / Kill stay human. Collect stays HOLD. Buyers bring their own keys and pipes — never hardcode the creator’s. Do not promise 100% safe or never banned. The creator stands behind the pack; get counsel for EULA / privacy. Bad packs (key leaks): Talk to AIA / Admin desk; Marketplace can unlist. Do not invent merchant-of-record chargeback holds, payout freezes, a sandbox throttle ladder, or Lemon Squeezy / Paddle as AIA money pipes. A short AS IS note lives in the creator’s own pack docs — not an AIA attach flow.

## When a pack is worth it

Worth it: the process already works by hand; multi-step qualify → draft with fallbacks. Not worth it: a broken offer or process; abandoned when APIs change; a trivial webhook → note you can Drop yourself. No $47–$197, $50/hr, 300 hours, or 10–15 minutes tables on this card.

## Build a pack / desk AI

When (pipe / `name@account.aia` / status / optional wait) → If → Then (desk AI drafts the card) → Yes / Stop / Kill. Fallbacks: Needs you / Talk to AIA. Thin `.aia` from `/dev`. Buyer pipes and keys. Sample JSON is illustrative only — desk words (`when` / `if` / `then`), not a bindings product. Thin App / webhook pack example (copy, do not seed): When = www hook / pipe, If = tag Lead, Then = draft. Buyer binds their own keys on Pipes. Yes / Stop / Kill before outbound. Not a listed SKU. Not a bindings product. Webhook is the live pipe. Yes is not a collect charge. Collect stays HOLD.

First `.aia` pack docs live on Studio `/dev#first-pack` and match real Studio: open a desk → name a desk AI → When → If → Then (webhook is the live pipe) → buyer binds their own keys on Pipes → test via Drop or www hook → Yes / Stop / Kill before outbound → Download `.aia` (Give) or Install `.aia` with Yes (Update). Not a CLI. Not a signed DID. Not a stake publish. No AAM mainnet, paymasters, AIA token, DAO slash, DePIN, or Grandma brand.

Desk orchestration = When · If · Then. Sequential = one rule after another. Conditional = If. Human in the loop = Yes / Stop / Kill. Not a Router Node, sub-agent mesh, or node canvas.

Ideas → queue = Drop → Qualify → card → Yes / Stop. History is past / now / next — the card trail and this account’s roadmap. No effort or token estimate UI.

Give pack = download / share the `.aia` file (`download-pack`). They install with Yes. No silent push to another desk.

Update pack = install this `.aia` again (`install-aia`) with owner Yes. Recurring update pass / subscription HOLD. No silent refresh. Collect HOLD.

FAQ: work with / for AIA = build packs + Talk to AIA; agency / DFY off-platform; no careers portal / certified partner program. AIA License = no separate license SKU — desk account + pack install; Collect and payouts HOLD; no Free / Pro / Agency license tiers, merchant-of-record, or auto EULA.

How the queue runs: Pipes → Rules When · If · Then → pack / desk AI drafts → Yes / Stop / Kill → Needs you / Talk to AIA. Not codegen, deploy, or GitHub auto-patch. Collect HOLD.

how.html Paid / Collect: Collect stays HOLD until a person taps Yes and a real Collect money pipe is live. Not “Collect when due.” Shop-week examples name when money would be due — they do not collect. Yes is not a collect charge. No fake pricing, credits, or AIA coin.

how.html facts / Do film, help.html Owner vs helper / Talk / Log in, desk Talk, and Queue handoff: Yes / Stop / Kill is the rail. Not “Send or Stop.” Not “Nothing leaves until Send.” Send-it-yourself (copy, text, email) stays. AIA does not send.

index.html follow-up / Bills, help.html Collect dd, consign.html 4 Paid: same Collect HOLD until Yes + a real money pipe. Not “money waits only if you wrote that rule.” Not “Owner lets the money move.” Not live “Square payout.”

Leftover public surfaces after that pass: how.html film reel, setup.html / examples.html / setup-demo.js Consign cards, marketplace catalog + consign pack face / queue empty / engine hold rec, pricing.html Desk card, legal.html lead + billed-jobs line. Same Collect HOLD until Yes + a real money pipe. Not “4 Paid.” Not “Payout waits on you.” Not live “Per shipped job.”

World-home (`index.html`, `how.html`, `setup.html`): How · Setup · Help · Desk in the header. Open desk, Talk, Give pack, Update pack, Desk, Help as page CTAs. Give pack = the file. Update pack = install again with Yes. One AIA account. Connect existing wallet, not Wallet.AIA. No grandma brand. No mint / Decentraweb / DNS lesson on those pages. Collect HOLD. No silent send.

World Help playbook (`help.html` `#playbook-card`): four steps on one AIA account. `ai.aia` is the door, not a mint lesson. Studio / More keep the DNS HOLD line. `examples.html` Stay on this phone — no hashed-session / X-Session.

World Help leftover (`help.html` lead, First day Desk AI, Yes button words): Yes is the rail, not Send-or-Stop. First day Desk AI does not teach orange-until-DNS mint. You send the draft yourself — Yes does not “post it.” `#aia-inbound` MX/DNS HOLD stays.

Field tips + Ask AIA: `aia-tip.js` on How, Setup, Home, onboard, login, Drop, widget, Account, Examples, Help, and Support. Extra info on the field. Ask AIA opens Help chat (`/support`) with field id + plain tip text + page. Help chat stays draft / help. Need a person? Drop a card on the AIA Admin desk. Yes / Stop stay human. Give pack / Update pack named CTAs on world doors, Help, and Account. A pack puts When → If → Then on this desk queue; buyer binds their own keys; Yes / Stop / Kill before outbound; webhook is the live pipe. Thin App / webhook pack example on Help `#build-pack`, Examples, and Studio — copy, do not seed; not a listed SKU; not a bindings product. consign.html Drop it / Yes. Not a ticket portal. Not a new chat product. No ETH escrow, micro-wei, streaming ETH, or L2 state channels.

## Desk cards

When → If → Then: a named desk AI drafts a queue card (fields / notes), not a raw chat blob. Yes / Stop / Kill stay human. Yes is not auto-send mail, push git, or a Collect charge. Collect HOLD. Thin `.aia` from Studio; test via Drop or the www hook. A desk holds up to 12 card fields — real cap. Sample JSON is illustrative only — desk words. Do not invent `render_desk_card`, interactive_review layout, or code_diff / confidence / token badge field types.

Plan tiers FAQ: no public Free / Pro / Team / Enterprise SKUs or credit pricing yet. One desk account. Create / Drop a goal → draft card → Yes. No autonomous ETA engine. No SaaS codegen.

## World users · launch an automation business

Help (`/help#world`) and Studio (`#world`) fold this into one short path. Days are a guide, not a promise.

Spine = AIA playbook: Audit → Pipes → named desk AI → Rules (When → If → Then) + Yes / Stop / Kill. Collect stays HOLD until Yes + a live money pipe.

On-desk: open a desk, create / name a desk AI, pack `.aia`, Marketplace or private, Simulate inbound / www hook. Fresh rules stay empty. No demo seed ($250 never).

Off-platform: OpenAI / Anthropic keys, Make / Zapier, CRMs — connect as pipes when the owner provides keys + Yes. Do not invent live connectors or live MX. Agency / DFY / co-pilot are off-platform labels.

1. **Core setup** — offer type packs / agency / DFY; niche 1–2; stack = AIA desk + pipes. On-desk path: open desk → name a desk AI → pack `.aia` → Marketplace or private. Price bands ($47–$197 packs, retainers, $997 DFY) are illustrative / off-platform — not an AIA rate card.
2. **First pack suite** — ideas, not seeded demo rules: Lead capture + follow-up; Content multiplier; Document / email processing. Map Trigger → Condition → Action.
3. **Package & monetize** — lead magnet → mid pack → high-ticket VIP / setup. You set prices. Collect HOLD. No affiliate percent.
4. **GTM** — 60s clips; publish on Marketplace / Studio; local SMB / risk-free trial. Do not promise platform-search rank.

Paid ads (off-platform, optional): ROAS / CAC / funnel (lead magnet → tripwire → pack → upsell). Example thinking only. AIA does not run ads or guarantee ROAS. No $29/$97/$297 tables. No monthly P&L.

**Four models** (label on-desk vs off-platform):

1. Automation Agency (AAA) — off-platform client work on the AIA desk. Sell outcomes. AIA is the desk engine (Drop → Qualify → Do → Collect HOLD → Follow). Fees are example / off-platform — not AIA rates. Do not publish $1.5k–$5k / $300–$1k as AIA rates.
2. DFY — off-platform service wrapping a repeatable install (example: lead qualify in 48h). Flat fees illustrative only.
3. Marketplace — on-desk Studio. You set the price. Lead magnet → core pack → VIP / club is your ladder. No public payout baseline. Do not treat $47–$147 as platform prices.
4. Co-pilot — off-platform revenue-share. 10–15% cuts are examples only, not AIA terms.

First 3 clients: Audit (playbook step 1 · Find the leaks) → 60s proof → risk-free trial. No invented close rates.

**Pack quality:** ship operational infrastructure (Drop → Qualify → Do → Collect HOLD → Follow), not dead templates. Fallbacks = Rules + Rail. Visual outcomes on Follow / Collect. Slack / Sheets / Notion via pipes when connected (HOLD until Yes / keys). Structured prompts on named desk AIs. Recommend a 2-min quickstart. No review-rate stats.

**Funnel tiers:** Tripwire / Core / High-ticket DFY. You set prices. Illustrative only. High-ticket implementation is mostly off-platform wrapping packs.

**Expansion:** recurring update pass — Collect HOLD; do not invent a subscription engine. Industry bundles = repackage `.aia`. `$0.05/exec` micro-SaaS is off-platform or a future pipe — AIA does not host per-run billing.

**Workflow & Agent Pack Creator (on-desk):** package named desk AIs, webhooks, and CRM pipes when connected into a `.aia`. Solve a specific problem (lead qualify, review responder, social *repurposing drafts*). Not auto-publish unless a live pipe exists. You set prices. Collect HOLD. Social auto-post is a future / off-platform pipe — not live OAuth. Account door: desk name + code, or email + password — not social SSO. Marketplace GTM: clear titles + niche keywords. No top-ranking guarantee.

**Build automation packs** (map to this desk):

1. Niche problem — real estate / e-com / agency ideas, not seeded demo rules. Measurable time or leads.
2. Core logic stack = desk engine. Trigger (webhook / Drop / pipe / inbound `.aia`) → Qualify + named desk AI prompts (JSON / structured) → Fallbacks (Rules + Rail Yes/Stop/Kill / alert — no silent crash) → Destination pipes when connected. Collect HOLD.
3. Plug-and-play — clear credential vars, dashboards via pipes, 2-min quickstart in pack docs.
4. Tiers — Free / core / DFY. Illustrative $ only; you set the price; Collect HOLD. DFY mostly off-platform service.

**Learn packs** (short, on this desk): rebuild a pack from memory on an empty desk; say Trigger → Condition → Action in plain words. Revisit packs / Rules over days. Practice Qualify prompts, fallback Rules, and pipe connect with Simulate inbound. Deconstruct a niche → read just enough Help → open the desk → one pack end-to-end. 20-hour competence is a guide, not a guarantee.

**Limits on create / sell** (real numbers only):

- Named desk AIs: 6 on a desk (`shop.ais` cap). Studio draft form saves 3.
- Rules: 8 on a desk (`RULE_MAX`). Pack JSON also slices rules to 8, workflows to 4.
- Card fields: 12 on a desk.
- 12 .aia emails per account.
- No published Marketplace listing cap. Do not invent a free-tier listing quota.
- No published `.aia` pack file-size cap. Desk card uploads cap at 8 MB (`api/upload.js`).
- External storefronts (Lemon Squeezy / Paddle / Shopify) are off-platform.
- Third-party API quotas: buyers bring their own keys. AIA does not host per-run billing.
- When APIs change, version the pack. An update pass is illustrative — not a live subscription engine.
- Catalog quality: 3–5 strong packs beat 50 thin ones.

## AIA Internet · `.aia` packs

**AIA Internet** is the network/layer for world users, Studio, Marketplace, and connected desks.

**`.aia`** is the pack + desk-AI artifact format (and the TLD for identity: `james.aia`, `springfield-shop.aia`). Download, share, or install a pack as a `name.aia` file. JSON inside is fine. MIME/extension is `.aia`. Named desk AIs and guardrails travel with the file. Marketplace listings and private desk installs use `.aia`.

Validate `label.aia`. Names live on this desk now. Wallet / registry connect later as a Pipe HOLD. Do not invent on-chain ownership. Collect stays HOLD.

## `.aia` email identities

World users create `{ai-or-desk-name}@{accountname}.aia` to operate Automations and named desk AIs.

Examples: `james-ai@funditaway.aia`, `queue@springfield-shop.aia`.

Validate `local@account.aia`. The account label must match this AIA Internet account / `.aia` name (or the bound desk’s `.aia` name). Create and manage on Account, Studio, and Desks. Bind each identity to a desk or a named desk AI.

Inbound mail (or a simulated webhook) to that address Drops / Captures on that desk — same path as `/api/hook`. Automations can trigger from inbound. The mailbox is not the assignee; a named desk AI drafts when one exists.

Live today: `www.automateitaway.com/api/hook` can write a card. An unknown `.aia` address returns 400. MX and DNS for `*.aia` still HOLD (`ai.aia` orange until DNS). No live Gmail forward wizard, email vault, or voice / SMS receptionist.

Outbound Send stays HOLD. No silent mail. Rail / Yes. Status orange until a real MX pipe. Do not claim live SMTP / MX. DNS for `ai.aia` / `*.aia` does not resolve yet. Identities work on the desk now; internet mail when the MX pipe is connected.

```json
{
  "format": "aia.pack.v1",
  "name": "Family lane",
  "aia": "springfield-shop.aia",
  "file": "springfield-shop.aia",
  "ais": [{ "name": "James’s AI", "aia": "james.aia" }],
  "chain": false,
  "owned": false,
  "collect": "hold"
}
```

## Pack logic

1. World user drops onto a desk.
2. Qualify stamps `pack` + `custom.face` (who / what / when / where / how) from the pack already installed on that desk. Drop does not ask you to pick a pack each time.
3. Capture makes a card in `exception` / Qualify.
4. Qualify fills `next` from the pack. Grok drafts in that pack's language.
5. Queue paints the pack face.
6. Open sheet shows only that pack's 5W and rail hint.
7. Yes runs desk rules. Pack `contains` keeps Insurance from holding every card.
8. Collect is pack-specific (bind, payout, credit). Follow is one nudge.

The state machine stays generic. The pack only changes the nouns and the waits.
