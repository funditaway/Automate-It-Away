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

## AIA Internet · `.aia` packs

**AIA Internet** is the network/layer for world users, Studio, Marketplace, and connected desks.

**`.aia`** is the pack + desk-AI artifact format (and the TLD for identity: `james.aia`, `springfield-shop.aia`). Download, share, or install a pack as a `name.aia` file. JSON inside is fine. MIME/extension is `.aia`. Named desk AIs and guardrails travel with the file. Marketplace listings and private desk installs use `.aia`.

Validate `label.aia`. Names live on this desk now. Wallet / registry connect later as a Pipe HOLD. Do not invent on-chain ownership. Collect stays HOLD.

## `.aia` email identities

World users create `{ai-or-desk-name}@{accountname}.aia` to operate Automations and named desk AIs.

Examples: `james-ai@funditaway.aia`, `queue@springfield-shop.aia`.

Validate `local@account.aia`. The account label must match this AIA Internet account / `.aia` name (or the bound desk’s `.aia` name). Create and manage on Account, Studio, and Desks. Bind each identity to a desk or a named desk AI.

Inbound mail (or a simulated webhook) to that address Drops / Captures on that desk — same path as `/api/hook`. Automations can trigger from inbound. The mailbox is not the assignee; a named desk AI drafts when one exists.

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
2. Drop stamps `pack` + `custom.face` (who / what / when / where / how).
3. Capture makes a card in `exception` / Qualify.
4. Qualify fills `next` from the pack. Grok drafts in that pack's language.
5. Queue paints the pack face.
6. Open sheet shows only that pack's 5W and rail hint.
7. Yes runs desk rules. Pack `contains` keeps Insurance from holding every card.
8. Collect is pack-specific (bind, payout, credit). Follow is one nudge.

The state machine stays generic. The pack only changes the nouns and the waits.
