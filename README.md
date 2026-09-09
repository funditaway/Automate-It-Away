# Automate It Away

One engine. Many workspaces. Thin packs. You only tap exceptions.

Capture → Qualify → Do the work → Get paid → Follow + audit.

Repo: https://github.com/funditaway/Automate-It-Away
Vercel project: automate-it-away (team James Oddo's projects)
Domain: automateitaway.com (pointed)

## Live contracts

- Header `X-Workspace` (optional `X-Pin`)
- `GET /api/health`
- `GET|POST /api/auth` — open workspace + second-phone pin
- `GET|POST /api/jobs` — capture | qualify | ship | kill
- `GET /api/jobs?audit=1` `?money=1` `?inbox=1`
- `GET|POST|DELETE /api/connections`
- `GET|POST /api/worker`
- `GET|POST /api/rules` — per-desk owner rules (When → If → Then + optional Capture widget). Hard stops stay in `api/jobs.js`. Pack workflows string rules (optional delay / branch).
- `GET|POST /api/auth` — workspace includes `nouns` `{ capture, qualify, do, collect, follow }`. Owner `action: "nouns"` saves them.
- Ship waits only when that desk has an owner money-wait rule. Empty desks do not invent $250.
- Demo ship (no live pipe write-back) stays held — never shipped, never billed
- Kill without `confirm: true` → 409
- Whatnot stays down

Widget `POST`s capture to `/api/jobs`. Status page reads health.

Store: file or `/tmp` until `BLOB_READ_WRITE_TOKEN` is set. Then jobs and workspaces live in Vercel Blob and a second phone can open the same queue.

First vertical pack: `packs/consign.json`.
World login: `/login.html` (slug + pin). New desk: `/onboard.html`. Rules: `/rules.html`.
