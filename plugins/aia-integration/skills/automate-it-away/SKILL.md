---
name: automate-it-away
description: >-
  Automate It Away (AIA) for Grok: desks, packs, capture→qualify→do→collect→follow,
  live HTTPS API, and bundled AIA MCP tools. Use when the user mentions Automate It Away,
  AIA, automateitaway.com, desks, packs, drops, or says "Run automation on AIA",
  "Trigger workflow via Automate It Away", or "Execute AIA task".
---

# Automate It Away

Automate It Away is one engine with many desks. Thin packs change how a card looks and which waits fire. Humans tap Yes / Stop; desk AIs only draft.

Product: https://automateitaway.com  
Source: https://github.com/funditaway/Automate-It-Away

## Triggers

- "Run automation on AIA"
- "Trigger workflow via Automate It Away"
- "Execute AIA task"
- Mentions of Automate It Away, AIA desks, packs, drops, or exception queues

## Execution flow

1. Parse the user payload for desk slug, pack, and task parameters.
2. Authenticate with `X-Workspace` / `X-Pin` (env `AIA_WORKSPACE` / `AIA_PIN`) or `aia_open_desk`.
3. Prefer the bundled stdio MCP tools (`aia_*`). Hosted MCP target: `https://api.automateitaway.com/mcp`.
4. Stream status back in chat. Never ship or kill without an explicit owner decision.

## Core loop

1. **Capture** — Drop stamps a card (exception).
2. **Qualify** — Desk asks what is missing; Grok may draft.
3. **Do** — Owner taps Yes / Stop / Copy / Text / Email / Hand.
4. **Collect** — Money / payout / bind / credit only if the pack requires it.
5. **Follow** — One nudge, then stop.

## MCP tools

| Tool | Use |
|---|---|
| `aia_health` | Engine up? |
| `aia_status` | Desk snapshot |
| `aia_open_desk` | Open workspace + pin |
| `aia_list_jobs` | Queue / audit / money / inbox |
| `aia_capture` | New card |
| `aia_qualify` | Qualify card |
| `aia_ship` | Owner ship (confirm first) |
| `aia_kill` | Kill with `confirm=true` only after user confirmation |
| `aia_list_rules` | Desk rules |
| `aia_list_packs` | Public pack JSON |

## Hard rails

- Never invent a money wait on empty desks — waits come from owner rules.
- Never ship or kill without an explicit owner decision.
- Desk AIs draft only; they do not tap Yes/Stop.
- Demo ship stays held — never shipped, never billed.

## Related skills

- `aia-desk` — operate a live desk queue.
- `aia-packs` — read and design pack JSON.
