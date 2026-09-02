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
        note: (process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY)
          ? "Included drafts on the card. Never Send."
          : "Set XAI_API_KEY for included Grok drafts. A desk can also connect Grok, ChatGPT, or Claude on /connections."
      },
      drafts: {
        included: !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY),
        deskAccounts: (mem.connections || []).filter((c) => c && c.lane === "draft" && c.keyPacked).length,
        note: "Owner connects a draft account on /connections. Chat login alone is not enough — paste the API key after login. Drafts only."
      }
    },
    accounts: {
      login: "desk name + desk code — not email",
      session: "hashed token, 14 days, slides on use, cookie + X-Session, max 8 phones",
      mfa: "optional authenticator app. No email codes. No SMS codes.",
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
