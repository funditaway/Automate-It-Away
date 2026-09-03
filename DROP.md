# Drop

One intake. Three ways in. Same queue. Human taps Yes or Stop.

## Ways in

1. **Talk to the desk** (`/drop?mode=talk#talk`, `/chat`)
   Talk or type anything. AIA AI answers. The card is born in the chat. Say **drop it** if you want it on the queue a second time — the first Tell already wrote the card.
2. **Quick drop / manual** (`/drop`, embed)
   Tap a kind. Fill the short card. Drop it. Two taps.
3. **Custom / Advanced** (`?mode=custom` or `?mode=agent`)
   Name your own kind, paste data (**Put data on**), pick pack, seat a crew agent. Draft only.

## World users · accounts · desks

Public drop search sits at the **top** of `/drop`.

- Label: **World users · accounts · desks**.
- Boots with `GET /api/desks?listed=1` so listed world desks paint with no typing.
- Each hit is account · desk · city · what it does.
- Private desks never appear. Closed desks never appear.
- This-phone saved desks stay under the world list.
- Tapping a world desk opens `/drop?ws=` for that desk. Public drop never sees money, Stop, or People.

## Agents with AIA World users

World users drop. Agents draft on the same card. They do not replace the user.

- Grok is the included drafter (`api/_grok.js`). Writes `draft`, `next`, up to 3 recs. Never sends. Never Stop. Never invents money.
- Tell the desk (`drop-chat.js`) posts `POST /api/intake action=do`. Any line becomes a card in the thread plus a desk reply. Key off → engine draft. Key on → Grok draft.
- Crew seats (Foreman, Mapper, Packer, Doer, Rail, Builder, Worker) are optional Advanced labels on the card. Not a public Bot API.
- Public / family droppers Talk or Quick. They cannot see People, Stop, or money.
- Owner / staff tap Yes (copy, text, email, hand) or Stop.
- Bind, illustration send, and coverage stay off the desk unless the owner taps.

## Files

- `widget.html` — Drop UI (`/drop` and `/widget`)
- `drop-pick.js` — World search first, then this-phone desks
- `drop-chat.js` — Tell the desk / type anything → reply + card in thread
- `drop-talk.js` — Talk to the desk
- `drop-now.js` — Quick / recent / after-drop
- `drop-more.js` — Custom kinds
- `drop-agent.js` — Advanced + agents
- `drop-packs.js` — Active packs on this desk (one pack or many)
- `drop-preview.js` — Thread + card preview gate
- `chat.html` — bounce to `/drop?mode=talk#talk`

## Packs on a World user's desk

World users inherit the packs on the **desk they drop onto**.

- **0 packs** — generic Quick chips (home / family kinds).
- **1 pack** — that pack owns Quick chips, Talk guesses, rails, and the pack field. No pack switcher.
- **2+ packs** — chips under the modes: All · Home · Insurance · Consign · …. All merges kinds and rails. One pack acts like the one-pack path.

Insurance (alone or inside All): quote, missed call, sit-down, illustration. Bind stays off Drop. Illustration send is an owner tap. Rail seats itself.

Capture stamps `pack`, `custom.pack`, `custom.packs[]`, `custom.packName`. Grok drafts from that. Nobody sends, binds, or Stops from Drop.
