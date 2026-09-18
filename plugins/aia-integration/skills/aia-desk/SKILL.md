---
name: aia-desk
description: >-
  Operate an Automate It Away desk: open a workspace, read the queue, capture
  exceptions, qualify cards, and prepare owner Yes/Stop decisions. Use for live
  AIA desk work, queue triage, or "what's on my desk" requests.
---

# AIA desk operations

## Open a desk

1. Ask for the desk slug (workspace) and pin if they use a second phone.
2. Call `aia_open_desk` with `workspace` (+ `pin` when needed), or set `AIA_WORKSPACE` / `AIA_PIN`.
3. Confirm with `aia_status` or `aia_list_jobs`.

## Triage loop

1. `aia_list_jobs` — scan priority / `needs` / `waitingOn`.
2. For new inbound work, `aia_capture` with a clear `title`, optional `pack`, `notes`, `contactName`.
3. `aia_qualify` on cards missing fields; surface `missing` / `needLine` to the owner.
4. Draft copy when helpful — never tap Yes/Stop as the agent of record.
5. Only call `aia_ship` or `aia_kill` after the owner clearly confirms. Kills require `confirm=true`.

## Reading the queue

- `waitingOn`: `owner` | `helper` | `info`
- Priority cards are the ones that need a human tap now
- Use `view=audit`, `money`, or `inbox` on `aia_list_jobs` for those slices

## Rules of engagement

- One job per reply: show the next owner decision, not a dashboard dump.
- Keep money/bind waits tied to real desk rules — do not invent rails.
- If auth fails, re-open the desk; do not retry destroy actions.
