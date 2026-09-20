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

Public drop search sits on **step one** of `/drop`, under **Which desk gets this**.

- Label: **World users · accounts · desks**.
- Boots with `GET /api/desks?listed=1` so listed world desks paint with no typing.
- Each hit is account · desk · city · what it does.
- Private desks never appear. Closed desks never appear.
- This-phone saved desks sit **above** the world list — a dropper picks a desk they already have before searching the world.
- Tapping a world desk on `/drop` opens `/drop?ws=` for that desk and moves the rail to **Card** — tap a kind (a task, an errand, a list, an idea, a project), type the work, Drop it. Tell stays on the rail. Talk URLs (`?mode=talk#talk`) still open Tell. Tapping a world desk on `/widget` stays on `/widget?ws=` — the slim face does not dump onto Desk · Tell · Card · Check · Share. Public drop never sees money, Stop, or People.

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
- `drop-steps.js` — One step at a time: **Desk · Tell · Card · Check · Share**. Desk is step one — Which desk gets this (`#desk-pick`) sits above the modes, the world search, the Talk bar, and the form. Card is the manual fill — kind chips, Title, What do you need, then I am / name / phone / files. A sticky rail switches steps, sticky Back / Next walks them, and every off-step card is `.step-off`, so a dropper reaches every action without a long scroll. All five pills share one phone row. Picking a desk or opening `/drop?ws=` lands on Card so freeform entry is not two hops past Talk. Talk URLs still open Tell. Step one stays inside a phone screen: it paints the `#drop-on` banner (This drop goes to … Change desk) as initial chrome — not `display:none` — hands the **Drop anything** line (`#drop-sub`) to the Card step it describes, and caps the world desk list. Back / Next hide with `.step-off`, not the `hidden` attribute — a global button display rule beats `hidden`. The rail always carries the vow: **Draft only. You still tap Yes or Stop. Nobody sends money from here.** Cards that load after boot get seated by a `MutationObserver`. `showNote` and the This drop cells reveal the step that holds the field, so no note lands off screen. `/widget`, embed, and `?embed=1` skip the rail — that face is already slim. Those faces also skip the Talk bar. Those faces do not load `drop-steps.js` (`skipSteps()`). `drop-now.js` `slimChrome()` tears down `#drop-steps` if a leftover rail painted. `widget.html` marks `body.widget`; `widgetOn()` / `slimChrome()` hush `#drop-steps` on that mark even when pathname is the `drop.html` rewrite. `AIADesks.widgetHref` (Drop tab) and `desk-nav.js` fallback point at `/drop` so the phone Drop tab paints Desk · Tell · Card · Check · Share. Share / embed keep `/widget` — that face stays slim. `/drop` still paints Desk · Tell · Card · Check · Share. `/drop` still paints `#drop-on` at step one. `/drop?ws=` still paints the rail. Full Drop chrome (header / modes / share) stay on `/drop`.
- `drop-pick.js` — This-phone desks first, then world search under them. World / saved / add-desk pick on `/widget` stays on `/widget?ws=`. `/drop` still opens `/drop?ws=` and still moves the rail to Card. Share links stay `/drop?ws=`.
- `drop-chat.js` — Tell the desk / type anything → reply + card in thread
- `drop-talk.js` — Talk to the desk. Hear this / empty `#talkStatus` match Talk: A Desk AI drafts the card. You still tap Yes or Stop. `/widget`, embed, and `?embed=1` skip the Talk bar (Hear this / Talk / Quiet), same as chat skips embed. slimChrome tears down `#talkBar` (not only `hidden=""`). `html.widget` / `body.widget` / embed CSS is `display:none!important` so `.talk-bar` flex and preview/talk cannot unhide Hear this / Talk / Quiet. `/drop` still paints Talk. Preview still owns Tell on `/widget`.
- `drop-now.js` — Quick / recent / after-drop. `/widget`, embed, and `?embed=1` skip the `#drop-on` banner (This drop goes to … Change desk), tear down `#talkBar` if a leftover bar painted, and tear down `#drop-steps` if a leftover rail painted. `/drop` still paints `#drop-on` at step one (This drop goes to … Change desk) — not `display:none`. `/drop` still paints Talk. Change desk on that banner still points at `/drop`. Recent public desks on `/widget` stay on `/widget?ws=`. `/drop` still opens `/drop?ws=` and still moves the rail to Card. Share links stay `/drop?ws=`. Full Drop chrome (header / modes / share) stay on `/drop`.
- `drop-more.js` — Core kind chips on Card (A task · An errand · A list · An idea · A project). Extra kinds stay on the select. Custom kinds.
- `drop-agent.js` — Advanced + Desk AIs
- `drop-packs.js` — Active packs on this desk (one pack or many)
- `drop-preview.js` — Thread + card preview gate. Talk empty / speaker / placeholder / missing-field asks match `drop-chat.js`: A Desk AI drafts the card. Speaker is Desk AI. You still tap Yes or Stop. One Tell the desk thread — preview reuses `#drop-thread` if Talk already painted it; `desk-nav.js` loads chat after preview. Chat owns empty Tell on `/drop` so one `#drop-thread` does not paint two blank-chat prompts. Preview still owns Tell on `/widget` (embed skips chat). Embed empty Tell skips a second blank-chat prompt, same as chat. One empty tap → one **Type the work. A Desk AI drafts the card.** `/widget` and embed skip the This drop / Counter strip (`#verify-strip`). `/widget`, embed, and `?embed=1` skip the Talk bar (Hear this / Talk / Quiet) — inject tears down `#talkBar`, it does not leave `hidden=""`. `/widget` and embed skip **Drops from this phone** (`#drop-log-card`). `/drop` still paints Drops from this phone. `/widget` skips the Desk · Tell · Card · Check · Share rail. Drop tab `widgetHref` is `/drop`. World / saved / recent pick on `/widget` stays on `/widget?ws=`. `/widget` and embed skip the `#drop-on` banner. `/drop` still paints the rail, Talk, and `#drop-on` at step one. Full Drop chrome (header / modes / share) stay on `/drop`.
- Probe /widget vs /drop Talk: `/widget` and `/widget?embed=1` must not paint Hear this / Talk / Quiet (`#talkBar` absent or `display:none!important` — not only `hidden=""`). `/drop` still paints Talk on Tell. Slim still skips `#drop-steps`, `#drop-on`, Drops from this phone, This drop strip. Collect HOLD. No demo data, no mail send, no live eBay, no money/mint/Bridge, no silent send.
- Probe Drop tab vs /widget: Drop tab / `widgetHref` opens `/drop?ws=` with Desk · Tell · Card · Check · Share, Talk, `#drop-on`, phone log. `/widget` and embed stay slim — no Talk, no steps, no `#drop-on`, no phone log. `/create` still Desk AI draft copy. Collect HOLD. No demo data, no mail send, no live eBay, no money/mint/Bridge, no silent send.
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
