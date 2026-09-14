# AIA Queue Cockpit

Human-in-the-loop decision queue for AIA — React, TypeScript, Tailwind, Zustand.

```bash
cd queue
npm install
npm run dev
```

Open http://localhost:5173

## Structure

- `src/types.ts` — Decision card models
- `src/store/useQueueStore.ts` — In-memory queue with risk→FIFO sort + sign/reject/delegate
- `src/data/card_ui.json` — Detail pane field schema
- `src/components/QueueCockpit.tsx` — Split-pane HITL cockpit

## Keyboard

- **Enter** or **⌘/Ctrl+Enter** — Authorize & Sign the selected card
