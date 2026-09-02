const { cors, catalog, PROVIDERS, configured, mem, log, save, ready, workspaceOf, readBody, personOf, isOwner } = require("./_lib");
const crypto = require("crypto");

const AI_PROVIDERS = {
  grok: { label: "Grok", vendor: "xAI", acts: ["draft"], login: "https://console.x.ai/team/default/api-keys", model: "grok-4-fast-non-reasoning", note: "Log in at console.x.ai. Paste the API key. Drafts only." },
  openai: { label: "ChatGPT", vendor: "OpenAI", acts: ["draft"], login: "https://platform.openai.com/api-keys", model: "gpt-4o-mini", note: "Log in at platform.openai.com. Paste the API key. Sign in with ChatGPT does not give drafts." },
  anthropic: { label: "Claude", vendor: "Anthropic", acts: ["draft"], login: "https://console.anthropic.com/settings/keys", model: "claude-sonnet-4-20250514", note: "Log in at console.anthropic.com. Paste the API key. claude.ai chat login is not a draft pipe." }
};
function isAiProvider(id) { return !!AI_PROVIDERS[String(id || "").toLowerCase()]; }
function aiCatalog() {
  return Object.entries(AI_PROVIDERS).map(([id, spec]) => ({ id, label: spec.label, vendor: spec.vendor, acts: spec.acts, login: spec.login, model: spec.model, live: false, connectable: true, lane: "draft", status: "hold", note: spec.note }));
}
function connectSecret() {
  const s = process.env.AIA_CONNECT_SECRET || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN || process.env.XAI_API_KEY || "aia-draft-pilot";
  return crypto.createHash("sha256").update(String(s)).digest();
}
function wrapSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", connectSecret(), iv);
  const enc = Buffer.concat([c.update(String(plain || ""), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
function last4Of(key) { const s = String(key || "").trim(); return s ? s.slice(-4) : ""; }
function publicAi(row) {
  if (!row) return null;
  return { id: row.id, workspace: row.workspace, provider: row.provider, label: row.label, vendor: row.vendor, lane: "draft", acts: ["draft"], live: !!row.keyPacked, status: row.keyPacked ? "live" : "hold", last4: row.last4 || "", model: row.model, login: row.login, createdAt: row.createdAt, note: "Drafts only. Never Send. If this key dies, included drafts or engine recs still run." };
}

const SOON = {
  x: { label: "X", acts: ["list", "notify"], login: "https://developer.x.com/en/portal/dashboard", note: "Log in at developer.x.com. Inbound mention can become a card later. No auto-post. Owner taps Yes." },
  gmail: { label: "Gmail inbound", acts: ["capture"], login: "https://console.cloud.google.com/apis/credentials", note: "Log in at Google Cloud. Mail in becomes a card. Not a send pipe." },
  outlook: { label: "Outlook / Microsoft 365 mail", acts: ["capture"], login: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", note: "Log in at Azure app registrations. Inbox in. Desk does not send the mail." },
  microsoft: { label: "Microsoft 365", acts: ["capture", "book"], login: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", note: "Graph later: mail + calendar. Needs an Azure app. Hold until those keys sit on the box." },
  apple: { label: "Apple Calendar / iCloud", acts: ["book"], login: "https://appleid.apple.com/", note: "No public iCloud mail pipe. Phone calendar file still works. Apple login does not give AIA a send key." },
  facebook: { label: "Facebook Page", acts: ["capture", "list"], login: "https://developers.facebook.com/apps/", note: "Log in at Meta for Developers. Comments can become cards. No auto-post." },
  instagram: { label: "Instagram", acts: ["capture", "list"], login: "https://developers.facebook.com/apps/", note: "Same Meta app as Facebook. Inbox later. Owner still taps Yes to publish." },
  snapchat: { label: "Snapchat", acts: ["notify"], login: "https://kit.snapchat.com/", note: "Log in at Snap Kit. Shown for capture later. Not a live story post." },
  gohighlevel: { label: "GoHighLevel", acts: ["capture", "sync"], login: "https://marketplace.gohighlevel.com/", note: "Log in at GHL marketplace. Lead in as a card. AIA does not send the GHL campaign." },
  salesforce: { label: "Salesforce", acts: ["capture", "sync"], login: "https://login.salesforce.com/", note: "Log in at Salesforce. Contact in. No write-back to the book until that pipe is honest." },
  hubspot: { label: "HubSpot", acts: ["capture", "sync"], login: "https://app.hubspot.com/signup-hubspot/crm", note: "CRM cousin to GHL. Lead in. Desk does not blast the list." },
  linkedin: { label: "LinkedIn", acts: ["list", "notify"], login: "https://www.linkedin.com/developers/apps", note: "Log in at LinkedIn Developers. No auto-post." },
  whatsapp: { label: "WhatsApp Business", acts: ["capture"], login: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started", note: "Inbound chat as a card. AIA does not text the customer by itself." },
  tiktok: { label: "TikTok", acts: ["list"], login: "https://developers.tiktok.com/", note: "Shown for later. Not a live publish pipe." },
  stripe: { label: "Stripe", acts: ["checkout", "payout"], login: "https://dashboard.stripe.com/apikeys", note: "Card and payout later. No keys, no live money." },
  paypal: { label: "PayPal", acts: ["checkout", "payout"], login: "https://developer.paypal.com/dashboard/", note: "Same money rules as Square. Coming soon." },
  shopify: { label: "Shopify", acts: ["list", "sync"], login: "https://admin.shopify.com/", note: "Shop inventory in. Queue still owns Yes." },
  drive: { label: "Google Drive", acts: ["file"], login: "https://console.cloud.google.com/apis/credentials", note: "Packets land in a folder. Coming soon." },
  marketplace: { label: "Facebook / Instagram shop", acts: ["list"], login: "https://developers.facebook.com/apps/", note: "Shop name only. Owner tap still required to post." },
  poshmark: { label: "Poshmark", acts: ["list"], login: "https://poshmark.com/", note: "Resale lane after Consign pipe is honest." },
  mercari: { label: "Mercari", acts: ["list"], login: "https://www.mercari.com/", note: "Same. Shown, not live." },
  quickbooks: { label: "QuickBooks", acts: ["invoice"], login: "https://developer.intuit.com/app/developer/dashboard", note: "Books after Collect. Not a payout." },
  slack: { label: "Slack", acts: ["notify"], login: "https://api.slack.com/apps", note: "Desk ping. Helpers see Needs you." },
  voice: { label: "Missed-call voice", acts: ["capture"], login: "", note: "A call becomes a card. We type it until this ships." }
};

function soonCatalog() {
  return Object.entries(SOON).map(([id, spec]) => ({
    id,
    label: spec.label,
    acts: spec.acts,
    login: spec.login || "",
    live: false,
    connectable: false,
    lane: "soon",
    status: "soon",
    note: spec.note
  }));
}

function inboundOf(workspace) {
  return "https://automateitaway.com/api/hook?workspace=" + encodeURIComponent(workspace);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);

  if (req.method === "GET") {
    const mine = mem.connections.filter((c) => c.workspace === workspace);
    return res.status(200).json({
      workspace,
      inbound: inboundOf(workspace),
      catalog: catalog(),
      ai: aiCatalog().map((p) => {
        const on = mine.find((c) => c.lane === "draft" && c.provider === p.id);
        return on ? Object.assign({}, p, publicAi(on), { note: p.note }) : p;
      }),
      drafts: mine.filter((c) => c.lane === "draft").map(publicAi),
      soon: soonCatalog(),
      helpers: {
        owner: "Connect, drop, Stop, money rules. Draft accounts are owner-only.",
        helper: "Work the queue. Yes when the rule allows. Cannot connect a pipe or tap No."
      },
      note: "Webhook is the cross-internet pipe today. Draft accounts draft only. Coming soon opens the vendor console. It is not a live send pipe.",
      connections: mine.filter((c) => c.lane !== "draft").map((c) => {
        const copy = Object.assign({}, c);
        delete copy.keyPacked;
        delete copy.key;
        return copy;
      })
    });
  }

  if (req.method === "POST") {
    const { person } = personOf(req, workspace);
    if (person && !isOwner(person)) {
      return res.status(403).json({ error: "Owner pin required to connect a pipe." });
    }
    const body = await readBody(req);
    const action = String(body.action || "").toLowerCase();
    const provider = String(body.provider || "").toLowerCase();

    if (isAiProvider(provider) || action === "ai" || action === "ai-start") {
      const spec = AI_PROVIDERS[provider];
      if (!spec) {
        return res.status(400).json({ error: "Pick Grok, ChatGPT, or Claude.", ai: aiCatalog() });
      }
      if (action === "ai-start") {
        return res.status(200).json({
          ok: true,
          provider,
          login: spec.login,
          next: "Log in at " + spec.vendor + ". Make an API key. Paste it here. Chat login alone cannot draft."
        });
      }
      const key = String(body.key || body.token || "").trim();
      if (!key || key.length < 12) {
        return res.status(400).json({
          error: "Log in first, then paste the API key from that account.",
          login: spec.login,
          provider
        });
      }
      mem.connections = mem.connections.filter((c) => !(c.workspace === workspace && c.lane === "draft" && c.provider === provider));
      const row = {
        id: "ai_" + Date.now().toString(36),
        workspace,
        provider,
        label: spec.label,
        vendor: spec.vendor,
        lane: "draft",
        acts: ["draft"],
        model: spec.model,
        login: spec.login,
        keyPacked: wrapSecret(key),
        last4: last4Of(key),
        live: true,
        status: "live",
        createdAt: new Date().toISOString()
      };
      mem.connections.unshift(row);
      log("Draft", "Connected " + spec.label + " · " + workspace, "OK", workspace);
      await save();
      return res.status(201).json({
        ok: true,
        connection: publicAi(row),
        next: spec.label + " drafts on this desk. You still tap Send and Stop."
      });
    }

    if (SOON[provider] || action === "pipe-start") {
      const spec = SOON[provider];
      if (!spec) {
        return res.status(400).json({ error: "Pick a named pipe.", soon: soonCatalog() });
      }
      if (action === "pipe-start") {
        return res.status(200).json({
          ok: true,
          provider,
          login: spec.login || "",
          status: "soon",
          next: spec.login
            ? "Log in at " + spec.label + ". That console does not turn this pipe live. Inbound can use the webhook today."
            : spec.note
        });
      }
      return res.status(409).json({
        error: "Coming soon. Log in to see the vendor console. It is not a live pipe.",
        status: "soon",
        login: spec.login || "",
        catalog: catalog(),
        soon: soonCatalog()
      });
    }
    if (!PROVIDERS[provider]) {
      return res.status(400).json({ error: "Unknown provider", catalog: catalog(), soon: soonCatalog() });
    }
    if (provider === "whatnot") {
      return res.status(409).json({ error: "Whatnot stays down. Not a launch pipe.", status: "down" });
    }
    const row = {
      id: "pipe_" + Date.now().toString(36),
      workspace,
      provider,
      label: PROVIDERS[provider].label,
      live: configured(provider),
      status: provider === "whatnot" ? "down" : configured(provider) ? "live" : "hold",
      hook: body.hook || null,
      inbound: inboundOf(workspace),
      createdAt: new Date().toISOString()
    };
    mem.connections.unshift(row);
    log("Pipe", "Connected " + provider + " · " + workspace, row.live ? "OK" : "Held", workspace);
    await save();
    return res.status(201).json({
      ok: true,
      connection: row,
      inbound: row.inbound,
      next: row.live
        ? "Ship posts to your hook. Your hook writes back to inbound."
        : "Add env keys, then reconnect. Catalog says which keys."
    });
  }

  if (req.method === "DELETE") {
    const { person } = personOf(req, workspace);
    if (person && !isOwner(person)) {
      return res.status(403).json({ error: "Owner pin required to drop a pipe." });
    }
    const id = req.query.id;
    const before = mem.connections.length;
    mem.connections = mem.connections.filter((c) => !(c.id === id && c.workspace === workspace));
    log("Pipe", "Disconnected " + id, "OK", workspace);
    await save();
    return res.status(200).json({ ok: true, removed: before !== mem.connections.length });
  }

  return res.status(405).json({ error: "Use GET, POST, or DELETE" });
};
