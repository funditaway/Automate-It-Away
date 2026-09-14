# AIA Queue — Sovereign Desk HITL Cockpit

Dark command-center UI for reviewing, auditing, and cryptographically signing high-stakes agent decisions.

## Run

```bash
cd queue
npm install
npm run dev
```

Open http://localhost:5173

## Layout

- **Header** — kernel status, node, secure key, ledger hash, Simulate Event
- **Left** — Active Decision Queue sorted critical → high → medium → low, then FIFO
- **Right** — Active Decision Card inspector with payload before/after diff
- **Footer** — Reject & Abort · Delegate to Sub-Agent · YES: AUTHORIZE & SIGN `[ENTER]`

## Stack

React · TypeScript · Tailwind CSS · Zustand

## Keyboard

- **Enter** — sign the selected pending card (skipped when focus is on action buttons)
