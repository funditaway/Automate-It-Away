---
name: aia-packs
description: >-
  Read and design Automate It Away pack JSON. Use when creating or editing packs,
  explaining pack faces/rails/rules, or loading consign/vita/aia/fund/home/land packs.
---

# AIA packs

A pack is how a card looks and which waits fire. Packs live at `/packs/{id}.json` in the AIA repo and on https://automateitaway.com/packs/{id}.json.

Fetch with `aia_list_packs` (`id` = `consign`, `vita`, `aia`, `fund`, `home`, `land`, `wanted`, `aia-adoption`, `aia-implement`, …).

## Shape

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
    "how": "Draft a packet. Bind stays off."
  },
  "capture": ["note", "call", "form"],
  "qualify": ["this week", "who it is for"],
  "do": ["packet draft"],
  "collect": ["bind stays off the desk"],
  "follow": ["one nudge"],
  "taps": ["illustration send", "bind"],
  "kill": ["not a fit"],
  "fields": { "capture": ["title", "contactName"], "qualify": ["timing"] },
  "rails": ["Bind stays off the desk."],
  "rules": [
    { "text": "Cap this-week cards.", "when": "qualify", "then": "wait", "contains": "this week" }
  ]
}
```

## Rule vocabulary

- `when`: `drop` | `pipe` | `inbound` | `status` | playbook steps `qualify` | `capture` | `do` | `collect` | `follow`
- `then`: `draft` | `queue` | `notify` | `tag` | `escalate` | `wait` | `stop` | `note`
- If filters: `contains`, `ifTag`, `ifStatus`, `ifUnassigned`, `ifOlder`, `ifMoney`, `ifField` + `ifValue`

## Design tips

- One composition per pack face — who / what / when / where / how.
- Rails are hard stops the desk must honor.
- Prefer thin packs; do not duplicate the global card state machine.
- Using a pack copies `rules` onto the desk.
