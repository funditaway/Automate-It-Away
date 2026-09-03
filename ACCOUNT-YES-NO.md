# AIA account — yes / no

Owner: James Oddo. Product: one AIA account, many desks.
Kill belongs to James.

Engine: Capture → Qualify → Do → Collect → Follow + audit.
Empty desks do not invent $250. Ship waits only if THAT desk has a money-wait rule.

## YES (James said push on 2026-09-03)

- Persist `accounts`, `sessions`, `approvals`, `locks` in the same store as jobs.
- `X-Session` + HttpOnly cookie. Second phone can keep a seat without typing the pin every tap.
- Email + password door. Hash only. No email reset.
- Desk name + code still works and now mints a real `acct_*` id.
- Unique account ids (time + random). Email cannot be on two accounts.
- Eight bad email tries → 429 for 15 minutes.
- Account actions: login, password, details, plan, attach, mint, logout, logout-all, sessions, export, mfa.
- Export copy has no pin and no password hash.
- Plan switch stays `charged: false`.
- Account page lists phones, export, leave every phone.
- `scripts/check-account.js` — nine passing contract tests.

## YES (wallets / Ext / X Money — ledger only, 2026-09-03)

- Each adult seat can hold its own wallet. Bills hit THAT wallet.
- Ext (off-desk) work can bill that same seat.
- X Money is a named pay rail. Handle on the seat. Status hold.
- Owner override of a HOLD needs a second tap and a reason.
- People cards show Can / Never / Money / Ext / X handle.
- `scripts/check-wallets.js` isolation tests.

## YES (account page — preview/account-madmax, 2026-09-03)

- `/account` save profile and save password POST `/api/account`, not `/api/auth`.
- Leave this phone calls `logout` then clears local keys.
- Leave every phone calls `logout-all`.
- Phones list from `action: sessions`.
- Export the book from `action: export`. File has no pin and no hash.
- Authenticator card says HOLD. Tap returns 409.
- Wallet card is ledger-only. `charged: false`. No money moves from this page.
- People link is `/people`.
- `scripts/check-account-page.js` gates the page contract.

## NO (do not pretend these shipped)

- Live card charge. `charged` stays false.
- Live X Money pull. No X_MONEY_TOKEN path.
- Insurance premium, COLI, or producer trust through X Money.
- Owner wallet as fallback when a seat wallet is empty.
- A billed wallet on a child family seat.
- Agents sending or holding money.
- Charge Desk / Pro / Crew.
- Email or SMS reset codes.
- Authenticator on. API returns 409 HOLD.
- Public Grok Bot API as a login gate.
- Whatnot.
- Treating a demo ship as a live payout.
- Killing a live job from the account page.
- Moving money from the account page.
- A second dashboard.
- Green-lighting a HOLD pipe (calendar / sms / square / ebay / consign).
- Contacting a customer.
- Merging preview PRs to live without James.

## Ask me if

- Override would pass a HOLD.
- Money out is $250 or more.
- This is a Kill on a live job.
- A customer is named in an outbound message.
- A pipe token is missing, expired, or 401.
- Undo would touch money already moved.
- The artifact is a legal letter or contract.
- Illustration or application would leave the desk.
- Year-2 review would name a customer in outbound.
- Bind or premium language is on a collect card.
- Flood or title would leave the land desk as a send.
- Credit decision would leave the fund desk.
- Payout would leave consign without owner confirm.
- A new official pack would be added.

## Test on a phone after preview (not after a blind deploy)

1. Open `/onboard` — desk name + 4+ digit code.
2. Open `/account` on that phone — profile saves.
3. Set email + password.
4. Leave this phone.
5. Open `/login` with email + password on a second phone.
6. Confirm the same desks list.
7. Export the book. Open the file. No password hash. No pin.
8. Turn on authenticator — page should say HOLD.
9. Ship $251 on a desk WITH a money-wait rule — still 409 held.
10. Ship $251 on an EMPTY desk — does not invent $250.
11. Kill without `confirm: true` → 409.
12. Helper taps Stop → 403.
13. Vita card with "illustration" — STOP on do.
14. Whatnot pipe — stays down.
