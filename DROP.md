# Drop

One intake. Three ways in. Same queue. Human taps Yes or Stop.

## Ways in

1. **Talk to the desk** (`/drop?mode=talk#talk`, `/chat`)
   Talk or type anything. A Desk AI drafts the card. The card is born in the chat. Say **drop it** if you want it on the queue a second time — the first Tell already wrote the card.
2. **Quick drop / manual** (`/drop`, embed)
   Tap a kind. Fill the short card. Drop it. Two taps.
3. **Custom / Advanced** (`?mode=custom` or `?mode=agent`)
   Name your own kind, paste data (**Put data on**), pick pack, seat a crew Desk AI. A Desk AI drafts the card. You still tap Yes or Stop. Draft only.

## World users · accounts · desks

Public drop search sits at the **top** of `/drop`.

- Label: **World users · accounts · desks**.
- Boots with `GET /api/desks?listed=1` so listed world desks paint with no typing.
- Each hit is account · desk · city · what it does.
- Private desks never appear. Closed desks never appear.
- This-phone saved desks stay under the world list.
- Tapping a world desk opens `/drop?ws=` for that desk. Public drop never sees money, Stop, or People.

## Desk AIs with AIA World users

World users drop. Desk AIs draft on the same card. They do not replace the user.

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
- `drop-talk.js` — Talk to the desk. Hear this / empty `#talkStatus` match Talk: A Desk AI drafts the card. You still tap Yes or Stop. Embed `/widget` skips the Talk bar (Hear this / Talk / Quiet), same as chat skips embed. `/drop` still paints Talk. Preview still owns Tell on `/widget`.
- `drop-now.js` — Quick / recent / after-drop
- `drop-more.js` — Custom kinds
- `drop-agent.js` — Advanced + Desk AIs
- `drop-packs.js` — Active packs on this desk (one pack or many)
- `drop-preview.js` — Thread + card preview gate. Talk empty / speaker / placeholder / missing-field asks match `drop-chat.js`: A Desk AI drafts the card. Speaker is Desk AI. You still tap Yes or Stop. One Tell the desk thread — preview reuses `#drop-thread` if Talk already painted it; `desk-nav.js` loads chat after preview. Chat owns empty Tell on `/drop` so one `#drop-thread` does not paint two blank-chat prompts. Preview still owns Tell on `/widget` (embed skips chat). Embed empty Tell skips a second blank-chat prompt, same as chat. One empty tap → one **Type the work. A Desk AI drafts the card.** `/widget` and embed skip the This drop / Counter strip (`#verify-strip`). Embed `/widget` skips the Talk bar. `/widget` and embed skip **Drops from this phone** (`#drop-log-card`). `/drop` still paints Drops from this phone. Full Drop chrome (header / modes / share) stay later.
- Put data on Tell (`#agent-tell` + `aia-tip.js` drop-tell) — What should a Desk AI draft? You still tap Yes or Stop. Not What should the desk do with it.
- Preferred outcome (`drop-agent.js` `#outcome-hint` + `aia-tip.js` drop-outcome) — What a Desk AI should draft next. You still tap Yes or Stop. Not What the desk should do next.
- `chat.html` — bounce to `/drop?mode=talk#talk`

## Packs on a World user's desk

World users inherit the packs on the **desk they drop onto**. An installed pack auto-shapes the queue card. You do not pick a pack on every Drop.

- **0 packs** — generic Quick chips (home / family kinds). Engine may still guess a pack from the words.
- **1 pack** — that pack owns Quick chips, Talk guesses, rails, and the pack field. No pack switcher. The queue card already uses that pack's face.
- **2+ packs** — chips under the modes: All · Home · Insurance · Consign · …. All merges kinds and rails. One pack acts like the one-pack path.

Insurance (alone or inside All): quote, missed call, sit-down, illustration. Bind stays off Drop. Illustration send is an owner tap. Rail seats itself.

Capture stamps `pack`, `custom.pack`, `custom.packs[]`, `custom.packName`. Grok drafts from that. Nobody sends, binds, or Stops from Drop.

## Fan-out · one Drop → many cards

A list or multi-line Drop becomes **more than one** draft queue card. Each card is one item. Desk AIs draft only. You still tap Yes or Stop on each. Collect HOLD. Nothing sent, paid, or bound from Drop.

- Newline list (`milk` / `eggs` / `bread`) or bullets → one card per line (cap 8).
- Quick **A list** with a comma list (`milk, eggs, bread`) → one card per item.
- Named form paste (`Name: Sam` / `Phone: …`) stays **one** card.
- Photo OCR is **not live**. A photo Drop stays one card until vision is wired. Do not fake it.

Same queue chrome. No Cap page. No marketplace charge.
