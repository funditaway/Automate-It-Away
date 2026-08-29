# Automate It Away

One engine. Many workspaces. Thin packs. You only tap exceptions.

Capture → Qualify → Do the work → Get paid → Follow + audit.

Repo: https://github.com/funditaway/Automate-It-Away
Vercel project: automate-it-away (team James Oddo's projects)
Domain: automateitaway.com (claimed, DNS not pointed)

## Live contracts

- Header `X-Workspace` (optional `X-Pin`)
- `GET /api/health`
- `GET|POST /api/auth` — open workspace + second-phone pin
- `GET|POST /api/jobs` — capture | qualify | ship | kill
- `GET /api/jobs?audit=1` `?money=1` `?inbox=1`
- `GET|POST|DELETE /api/connections`
- `GET|POST /api/worker`
- Ship amount > $250 without `confirm: true` → 409 held
- Kill without `confirm: true` → 409
- Whatnot stays down

Widget `POST`s capture to `/api/jobs`. Status page reads health.
Store is file or `/tmp` on lambda — not a shared phone queue yet.

First vertical pack: `packs/consign.json`.
