const {
  cors, catalog, mem, ready, save, storePath, blobToken, blobReady,
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
      note: "Name register stays HOLD. Collect stays HOLD.",
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
    note: "Name register stays HOLD. Collect stays HOLD.",
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
      note: "Not a launch pipe"
    };
  }
  const wrote = answered.indexOf(id) >= 0;
  return {
    id: row.id,
    provider: id,
    label: row.label || id,
    live: wrote,
    status: wrote ? "live" : "hold",
    note: wrote ? "Pipe wrote back." : "Hold until this pipe answers."
  };
}

async function deskStatus(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  await ready();

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
      ? "A pipe wrote back on this desk."
      : "Orange until a real pipe answers. Catalog matches /api/health.",
    pipes,
    connections: mine.map((c) => honestConnection(c, answered)).filter(Boolean),
    inbound: workspace ? hookUrl(workspace) : "",
    internet: require("./_aia-net").statusOf(),
    mail: require("./_aia-mail").statusOf(),
    wallet,
    aiaTld: strangerTld(aiaTld),
    honesty: {
      rule: "hold until a real pipe answers",
      writeback: "dispatch.ok or dispatch.inbound",
      catalog: "same as /api/health — webhook live; paid pipes hold until set up; whatnot down"
    }
  });
}

async function health(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  // Probe the same persist path onboard uses. Skipping save() when driver is
  // already blob left leftover write=fail + detail=null after a later read.
  if (blobReady()) await save();
  const driver = mem.driver || "file";
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
      collect: catalog().some((p) => p.live && p.id === "webhook") ? "webhook live — other paid pipes on hold" : "demo ship",
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
      mfa: "HOLD — authenticator is not live. No email codes. No SMS codes.",
      create: "Pro AIA account on open",
      plan: "pro",
      status: "free",
      monthly: "later per extra member or staff login",
      charged: false,
      note: "One account per person. Session persists on the shared save. Authenticator stays HOLD — not live on /account."
    },
    domain: "automateitaway.com",
    dns: "pointed",
    internet: require("./_aia-net").statusOf(),
    mail: require("./_aia-mail").statusOf(),
    wallet: require("./_connect-wallet").healthBlock(),
    aiaTld: strangerTld(require("./_aia-tld").healthBlock()),
    repo: "funditaway/Automate-It-Away"
  });
}

async function handler(req, res) {
  if (wantsStatus(req)) return deskStatus(req, res);
  return health(req, res);
}

handler.status = deskStatus;
module.exports = handler;
