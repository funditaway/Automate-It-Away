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

Rule keys:

- `when` — stage: `qualify` | `do` | `collect` | `follow`
- `then` — `wait` (hold for owner) | `stop` | `note` (`cap` becomes `wait`)
- `contains` — only fire if that word is on the card. Empty means the whole stage.

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
