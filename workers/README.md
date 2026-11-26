# Meta.aia worker

`aia-meta-worker.js` is the optional external draft worker for the Meta.aia Official World Pack.

## Rails

- Desk AIs **draft only**. Humans **Yes / Stop / Kill**.
- This process **never** sends mail, pays, unlocks, or binds.
- Collect stays **HOLD** until Yes + a real money pipe.
- When `AIA_WEBHOOK_SECRET` is set, inbound webhooks must carry `X-AIA-Signature: sha256=<hmac>`.

## Run

```bash
AIA_ACCOUNT_SIG=… node workers/aia-meta-worker.js
```

Point a desk webhook / pipe at `http://127.0.0.1:8787/aia/card.created`.

## Env

| Var | Purpose |
| --- | --- |
| `AIA_API_BASE` | AIA API root (default `https://www.automateitaway.com/api`) |
| `AIA_ACCOUNT_SIG` | Bearer for PUT draft write-back |
| `AIA_WEBHOOK_SECRET` | Optional HMAC verify |
| `META_AI_ENDPOINT` | Optional Meta upstream |
| `CLAUDE_API_KEY` | Optional Claude upstream (else local stub drafts) |
| `PORT` | Default `8787` |
