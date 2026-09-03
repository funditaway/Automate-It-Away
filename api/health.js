const { cors, catalog, mem, ready, save, storePath, blobToken, blobProbe } = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  if ((blobToken() || process.env.BLOB_READ_WRITE_TOKEN_STORE_ID || process.env.BLOB_STORE_ID) && mem.driver !== "blob") await save();
  const driver = mem.driver || "file";
  res.status(200).json({
    ok: true,
    product: "Automate It Away",
    engine: ["capture", "qualify", "do", "collect", "follow"],
    phase: "P1",
    store: {
      driver,
      path: mem.path || storePath(),
      jobs: mem.jobs.length,
      connections: mem.connections.length,
      audit: mem.audit.length,
      workspaces: mem.workspaces.length,
      live: driver === "blob" || driver === "file",
      note: driver === "blob"
        ? "Shared blob — second phone can see the same queue"
        : driver === "tmp-file"
          ? "Lambda /tmp — Blob write did not stick"
          : driver === "file"
            ? "File store on this box"
            : "Memory only",
      blob: {
        token: !!blobToken(),
        storeId: !!(process.env.BLOB_READ_WRITE_TOKEN_STORE_ID || process.env.BLOB_STORE_ID),
        write: blobProbe.write,
        read: blobProbe.read,
        status: blobProbe.status,
        url: blobProbe.url ? "set" : null,
        detail: blobProbe.detail
      }
    },
    files: {
      driver: blobToken() ? "blob" : "tmp-file",
      count: (mem.files || []).length,
      note: blobToken()
        ? "Vercel Blob live"
        : "No BLOB_READ_WRITE_TOKEN — files sit in /tmp"
    },
    pipes: catalog(),
    automation: {
      capture: true,
      qualify: "on capture + worker",
      do: "draft only — Send and Stop stay on the desk",
      collect: catalog().some((p) => p.live && p.id === "webhook") ? "webhook live — other paid pipes on hold" : "demo ship",
      follow: "worker + cron",
      inbound: "/api/hook",
      persist: (mem.driver === "blob") ? "shared blob" : "Lambda /tmp until BLOB_READ_WRITE_TOKEN",
      ownerStops: ["kill"],
      grok: {
        on: !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY),
        model: process.env.AIA_GROK_MODEL || "grok-4-fast-non-reasoning",
        endpoint: "https://api.x.ai/v1/chat/completions",
        draftsOnCards: (mem.jobs || []).filter((j) => j && j.grokAt).length,
        measured: (function () {
          const rows = (mem.jobs || []).filter((j) => j && j.grokUsage);
          const prompt = rows.reduce((n, j) => n + (Number(j.grokUsage.prompt) || 0), 0);
          const completion = rows.reduce((n, j) => n + (Number(j.grokUsage.completion) || 0), 0);
          const calls = rows.reduce((n, j) => n + (Number(j.grokUsage.calls) || 0), 0);
          const dollars = prompt * 0.2 / 1e6 + completion * 0.5 / 1e6;
          return {
            jobs: rows.length,
            calls,
            prompt,
            completion,
            dollars: Math.round(dollars * 10000) / 10000,
            note: "List-price estimate on the fast model. Real invoice is on console.x.ai."
          };
        })(),
        heavyChat: "SuperGrok Heavy is the chat plan. It does not fund this key.",
        note: (process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY)
          ? "Included drafts on the card. Never Send."
          : "Set XAI_API_KEY on Vercel from console.x.ai. Chat login is not a draft pipe.",
        spend: {
          list: "$0.20 / 1M in · $0.50 / 1M out on grok-4-fast-non-reasoning",
          perDraft: "~900 in + 250 out · about $0.0003",
          pilotMonth: "1 desk, 20–40 cards/week · under $1",
          busyMonth: "10 desks × 30 drafts/day · about $3",
          prepaid: "Buy $10–25 credits on console.x.ai. Heavy $300 does not add API credit.",
          avoid: "Do not set AIA_GROK_MODEL to grok-4, grok-4.6, or multi-agent for card drafts."
        },
        rate: {
          source: "https://docs.x.ai/docs/rate-limits",
          startTier: "T0 until $50 prepaid API spend",
          tiers: "T0 $0 · T1 $50 · T2 $250 · T3 $1k · T4 $5k",
          languageT0: "Published flagship language models: 37 RPS / 10M TPM at T0",
          multiAgentT0: "Multi-agent is tighter: 9 RPS / 2.5M TPM at T0 — not for every card",
          over: "429 Too Many Requests. Desk keeps the card. Human taps still work.",
          console: "https://console.x.ai/team/default/rate-limits"
        }
      },
      drafts: {
        included: !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY),
        deskAccounts: (mem.connections || []).filter((c) => c && c.lane === "draft" && c.keyPacked).length,
        note: "Owner connects a draft account on /connections. Chat login alone is not enough — paste the API key after login. Drafts only."
      }
    },
    accounts: {
      login: "desk name + desk code, or email + password",
      session: "hashed token, 14 days, slides on use, cookie + X-Session, max 8 phones",
      mfa: "HOLD — authenticator is not live. No email codes. No SMS codes.",
      create: "Pro AIA account on open",
      plan: "pro",
      status: "free",
      monthly: "later per extra member or staff login",
      charged: false,
      note: "One account per person. Session persists on the blob store. Authenticator is opt-in on /account."
    },
    domain: "automateitaway.com",
    dns: "pointed",
    repo: "funditaway/Automate-It-Away"
  });
};
