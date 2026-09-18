# AIA Queue — Sovereign Desk HITL Cockpit

Dark command-center UI for reviewing, auditing, and cryptographically signing high-stakes agent decisions. Uses AIA teal / orange branding and the pyramid logo.

## Run

```bash
cd queue
npm install
npm run dev
```

Open http://localhost:5173

## Layout

### Desktop (`md+`)
- Split pane: queue list + Active Decision Card inspector
- Kernel header with logo, node, key, ledger hash, Simulate Event

### Mobile (`< md`)
- Full-width queue list (thumb-sized cards, optional swipe sign/reject)
- Tap opens a slide-up inspector sheet with:
  - Sticky top bar (Back / risk / close)
  - Vertically stacked before/after diffs
  - Sticky bottom action bar: Reject · Delegate · full-width **YES: AUTHORIZE & SIGN**
  - `navigator.vibrate?.(40)` on authorize
- Compact header; ledger/key details behind a status toggle
- Safe-area insets for notched devices (`viewport-fit=cover`)

## Stack

React · TypeScript · Tailwind CSS · Zustand

## Keyboard

- **Enter** — sign selected pending card
- **Escape** — close mobile inspector
