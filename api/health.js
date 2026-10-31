const {
  cors, catalog, mem, readyRead, blobToken,
  workspaceOf, personOf, pipesAnswered, answeredProviders, hookUrl
} = require("./_lib");


function strangerTld(row) {
  if (!row || typeof row !== "object") {
    return {
      tld: ".aia",
      status: "watching",
      label: "Watching",
      collect: "hold",
      mint: false,
      live: false,
      note: "Name registration is off for now. Payments are off for now. Nothing is charged.",
      wallet: { connected: false, short: "" }
    };
  }
  const w = row.wallet || {};
  return {
    tld: row.tld || ".aia",
    status: row.status || "watching",
    label: row.label || "Watching",
    collect: "hold",
    mint: false,
    live: !!row.live,
    note: "Name registration is off for now. Payments are off for now. Nothing is charged.",
    wallet: {
      connected: !!w.connected,
      short: w.short || ""
    }
  };
}

function publicStoreDriver(driver) {
  if (driver === "blob") return "shared";
  if (driver === "tmp-file") return "tmp";
  return driver || "file";
}

// Deployed commit from Vercel. Local runs leave the env unset, so both
// health fields stay null. Anything that is not a full 40-char SHA stays
// null too — no other env value is published.
function commitRev() {
  const raw = process.env.VERCEL_GIT_COMMIT_SHA;
  if (typeof raw !== "string") return null;
  const sha = raw.trim();
  if (!/^[0-9a-fA-F]{40}$/.test(sha)) return null;
  return sha;
}

function wantsStatus(req) {
  const url = String((req && req.url) || "");
  if (/\/api\/status(?:\?|$)/.test(url)) return true;
  const q = (req && req.query) || {};
  return q.view === "status" || q.status === "1";
}

function honestConnection(row, answered) {
  const id = row && row.provider;
  if (!id) return null;
  if (id === "whatnot") {
    return {
      id: row.id,
      provider: id,
      label: row.label || "Whatnot",
      live: false,
      status: "down",
      note: "Off for now."
    };
  }
  const wrote = answered.indexOf(id) >= 0;
  return {
    id: row.id,
    provider: id,
    label: row.label || id,
    live: wrote,
    status: wrote ? "live" : "hold",
    note: wrote ? "This connection answered." : "Off until this connection answers."
  };
}

async function deskStatus(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  await readyRead();

  const workspace = workspaceOf(req);
  const { workspace: row, person } = personOf(req, workspace);
  const pipes = catalog();
  const answered = answeredProviders(workspace);
  const wrote = pipesAnswered(workspace);
  const mine = workspace
    ? (mem.connections || []).filter((c) => c && c.workspace === workspace && c.lane !== "draft")
    : [];
  const connect = require("./_connect-wallet");
  const tld = require("./_aia-tld");
  let wallet = connect.emptyPublic();
  if (person) {
    let acc = null;
    try { acc = require("./_account").homeAccount(person, row); } catch (e) { acc = null; }
    wallet = connect.publicOf(acc, connect.currentSession(req));
  }
  let aiaTld = tld.peek(wallet);
  try { aiaTld = await tld.forWallet(wallet); } catch (e) { aiaTld = tld.emptyPublic(wallet); }

  return res.status(200).json({
    ok: true,
    workspace: workspace || "",
    label: row ? (row.biz || row.name || row.slug || "") : "",
    status: wrote ? "live" : "hold",
    answered: wrote,
    answeredPipes: answered,
    note: wrote
      ? "A connection answered on this desk."
      : "Off until a real connection answers. The list matches /api/health.",
    pipes,
    connections: mine.map((c) => honestConnection(c, answered)).filter(Boolean),
    inbound: workspace ? hookUrl(workspace) : "",
    internet: require("./_aia-net").statusOf(),
    mail: require("./_aia-mail").statusOf(),
    wallet,
    aiaTld: strangerTld(aiaTld),
    automation: {
      deskAi: {
        on: !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY),
        note: (process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY)
          ? "A Desk AI can draft."
          : "A Desk AI can't draft on this phone yet."
      }
    },
    honesty: {
      rule: "off until a real connection answers",
      writeback: "dispatch.ok or dispatch.inbound",
      catalog: "same as /api/health — the webhook brings work in and does not take payment; payments are not connected; whatnot down"
    }
  });
}

async function health(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  // GET /api/health is read-only. It re-reads the store but never saves or
  // writes the blob. The old save() here was a write probe for store.blob,
  // which health no longer shows (#236), so every read rewrote aia/store.json.
  await readyRead();
  const driver = mem.driver || "file";
  const rev = commitRev();
  res.status(200).json({
    ok: true,
    product: "Automate It Away",
    engine: ["capture", "qualify", "do", "collect", "follow"],
    store: {
      driver: publicStoreDriver(driver),
      jobs: mem.jobs.length,
      connections: mem.connections.length,
      audit: mem.audit.length,
      workspaces: mem.workspaces.length,
      live: driver === "blob" || driver === "file",
      // Read-only trust state of this instance's store. No names or contents.
      state: require("./_lib").storeState(),
      saving: require("./_lib").storeState() === "not-ready" ? require("./_lib").STORE_PAUSED_LINE : "Saving is on.",
      note: driver === "blob"
        ? "A second phone can see the same queue"
        : driver === "tmp-file"
          ? "This desk did not keep the save"
          : driver === "file"
            ? "Saved on this desk"
            : "Not saved yet"
    },
    files: {
      driver: blobToken() ? "shared" : "tmp",
      count: (mem.files || []).length,
      note: blobToken()
        ? "Photos and files are saved"
        : "Photos and files are not saved for long"
    },
    pipes: catalog(),
    automation: {
      capture: true,
      qualify: "on capture + worker",
      do: "draft only — Yes and Stop stay on the desk",
      collect: require("./_packs").moneyPipeLive()
        ? "A payment connection is set up. Payments stay off until you tap Yes. Nothing is charged."
        : "Payments are off for now. Nothing is charged.",
      follow: "worker + cron",
      inbound: "/api/hook",
      mail: require("./_aia-mail").statusOf(),
      persist: (mem.driver === "blob") ? "shared save" : "this desk may forget the save",
      ownerStops: ["kill"],
      deskAi: {
        on: !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY),
        note: (process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY)
          ? "A Desk AI can draft."
          : "A Desk AI can't draft on this phone yet."
      },
      drafts: {
        included: !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.AIA_GROK_KEY),
        deskAccounts: (mem.connections || []).filter((c) => c && c.lane === "draft" && c.keyPacked).length,
        note: "Owner connects a draft account on Connections. A chat login is not enough. Drafts only."
      }
    },
    accounts: {
      login: "desk name + desk code, or email + password",
      session: "hashed token, 14 days, slides on use, cookie + X-Session, max 8 phones",
      mfa: "Two-step sign-in is off for now. No email codes. No SMS codes.",
      create: "Pro AIA account on open",
      plan: "pro",
      status: "free",
      monthly: "later per extra member or staff login",
      charged: false,
      note: "One account per person. Session persists on the shared save. Two-step sign-in is off for now."
    },
    domain: require("./_public-host").LIVE_DOMAIN,
    rev,
    revShort: rev ? rev.slice(0, 7) : null,
    dns: "pointed",
    internet: require("./_aia-net").statusOf(),
    mail: require("./_aia-mail").statusOf(),
    wallet: require("./_connect-wallet").healthBlock(),
    aiaTld: strangerTld(require("./_aia-tld").healthBlock())
  });
}

async function handler(req, res) {
  if (wantsStatus(req)) return deskStatus(req, res);
  return health(req, res);
}

handler.status = deskStatus;
module.exports = handler;

// Store guard: no saving request answers 2xx while its write was refused.
module.exports = require("./_lib").guardStore(module.exports);
