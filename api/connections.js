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

function searchLogin(q) {
  return "https://www.google.com/search?q=" + encodeURIComponent(String(q || "") + " developer API login");
}

const SOON = {
  x: { label: "X", group: "social", acts: ["list", "notify"], login: "https://developer.x.com/en/portal/dashboard", note: "Inbound mention later. No auto-post." },
  threads: { label: "Threads", group: "social", acts: ["list"], login: "https://developers.facebook.com/apps/", note: "Meta app. No auto-post." },
  facebook: { label: "Facebook Page", group: "social", acts: ["capture", "list"], login: "https://developers.facebook.com/apps/", note: "Comments as cards. No auto-post." },
  instagram: { label: "Instagram", group: "social", acts: ["capture", "list"], login: "https://developers.facebook.com/apps/", note: "Same Meta app. Owner taps Yes to publish." },
  snapchat: { label: "Snapchat", group: "social", acts: ["notify"], login: "https://kit.snapchat.com/", note: "Not a live story post." },
  tiktok: { label: "TikTok", group: "social", acts: ["list"], login: "https://developers.tiktok.com/", note: "Not a live publish pipe." },
  youtube: { label: "YouTube", group: "social", acts: ["list"], login: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", note: "Studio later. No auto-upload." },
  pinterest: { label: "Pinterest", group: "social", acts: ["list"], login: "https://developers.pinterest.com/apps/", note: "No auto-pin." },
  reddit: { label: "Reddit", group: "social", acts: ["capture"], login: "https://www.reddit.com/prefs/apps", note: "Thread in as a card. No auto-comment." },
  linkedin: { label: "LinkedIn", group: "social", acts: ["list", "notify"], login: "https://www.linkedin.com/developers/apps", note: "No auto-post." },
  nextdoor: { label: "Nextdoor", group: "social", acts: ["notify"], login: "https://nextdoor.com/", note: "Local board later. No auto-post." },
  gmail: { label: "Gmail inbound", group: "mail", acts: ["capture"], login: "https://console.cloud.google.com/apis/credentials", note: "Mail in becomes a card. Not a send pipe." },
  outlook: { label: "Outlook / Microsoft 365 mail", group: "mail", acts: ["capture"], login: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", note: "Inbox in. Desk does not send the mail." },
  yahoo: { label: "Yahoo Mail", group: "mail", acts: ["capture"], login: "https://developer.yahoo.com/", note: "Inbox later. Not a send pipe." },
  icloudmail: { label: "iCloud Mail", group: "mail", acts: ["capture"], login: "https://appleid.apple.com/", note: "No public iCloud mail key. Use the inbound hook." },
  mailchimp: { label: "Mailchimp", group: "mail", acts: ["notify"], login: "https://login.mailchimp.com/", note: "List later. AIA does not blast the list." },
  klaviyo: { label: "Klaviyo", group: "mail", acts: ["notify"], login: "https://www.klaviyo.com/login", note: "Same. No blast from the desk." },
  microsoft: { label: "Microsoft 365", group: "calendar", acts: ["capture", "book"], login: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", note: "Graph later. Hold until Azure keys sit on the box." },
  apple: { label: "Apple Calendar / iCloud", group: "calendar", acts: ["book"], login: "https://appleid.apple.com/", note: "Phone .ics already works. Apple login is not a send key." },
  calendly: { label: "Calendly", group: "calendar", acts: ["book"], login: "https://calendly.com/app", note: "Booking link later. Desk still owns Yes." },
  shopify: { label: "Shopify", group: "shop", acts: ["list", "sync"], login: "https://admin.shopify.com/", note: "Inventory in. Queue owns Yes." },
  etsy: { label: "Etsy", group: "shop", acts: ["list"], login: "https://www.etsy.com/developers/", note: "List later. Owner taps Yes." },
  amazon: { label: "Amazon seller", group: "shop", acts: ["list", "sync"], login: "https://sellercentral.amazon.com/", note: "Not a live list pipe." },
  marketplace: { label: "Facebook / Instagram shop", group: "shop", acts: ["list"], login: "https://developers.facebook.com/apps/", note: "Owner tap required to post." },
  poshmark: { label: "Poshmark", group: "shop", acts: ["list"], login: "https://poshmark.com/", note: "After Consign pipe is honest." },
  mercari: { label: "Mercari", group: "shop", acts: ["list"], login: "https://www.mercari.com/", note: "Shown, not live." },
  offerup: { label: "OfferUp", group: "shop", acts: ["list"], login: "https://offerup.com/", note: "Shown, not live." },
  craigslist: { label: "Craigslist", group: "shop", acts: ["list"], login: "https://www.craigslist.org/", note: "No public list API. Hand-post." },
  depop: { label: "Depop", group: "shop", acts: ["list"], login: "https://www.depop.com/", note: "Shown, not live." },
  wordpress: { label: "WordPress", group: "shop", acts: ["list"], login: "https://wordpress.com/log-in", note: "Site later. Not a live publish." },
  wix: { label: "Wix", group: "shop", acts: ["list"], login: "https://www.wix.com/", note: "Shown, not live." },
  squarespace: { label: "Squarespace", group: "shop", acts: ["list"], login: "https://www.squarespace.com/", note: "Shown, not live." },
  stripe: { label: "Stripe", group: "pay", acts: ["checkout", "payout"], login: "https://dashboard.stripe.com/apikeys", note: "No live money until keys and owner tap." },
  paypal: { label: "PayPal", group: "pay", acts: ["checkout", "payout"], login: "https://developer.paypal.com/dashboard/", note: "Same money rules as Square." },
  venmo: { label: "Venmo", group: "pay", acts: ["payout"], login: "https://venmo.com/", note: "No live payout." },
  cashapp: { label: "Cash App", group: "pay", acts: ["payout"], login: "https://cash.app/", note: "No live payout." },
  gohighlevel: { label: "GoHighLevel", group: "crm", acts: ["capture", "sync"], login: "https://marketplace.gohighlevel.com/", note: "Lead in as a card. No GHL campaign send." },
  salesforce: { label: "Salesforce", group: "crm", acts: ["capture", "sync"], login: "https://login.salesforce.com/", note: "Contact in. No write-back yet." },
  hubspot: { label: "HubSpot", group: "crm", acts: ["capture", "sync"], login: "https://app.hubspot.com/signup-hubspot/crm", note: "Lead in. Desk does not blast." },
  ams360: { label: "AMS 360", group: "crm", acts: ["capture"], login: "https://www.vertafore.com/solutions/ams360", note: "Insurance AMS. Inbound hook only. No bind, no commission pull." },
  zendesk: { label: "Zendesk", group: "crm", acts: ["capture"], login: "https://www.zendesk.com/login/", note: "Ticket in as a card." },
  intercom: { label: "Intercom", group: "crm", acts: ["capture"], login: "https://app.intercom.com/", note: "Chat in as a card." },
  drive: { label: "Google Drive", group: "files", acts: ["file"], login: "https://console.cloud.google.com/apis/credentials", note: "Packets in a folder later." },
  dropbox: { label: "Dropbox", group: "files", acts: ["file"], login: "https://www.dropbox.com/developers/apps", note: "File later." },
  onedrive: { label: "OneDrive", group: "files", acts: ["file"], login: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", note: "Same Azure app as Microsoft 365." },
  box: { label: "Box", group: "files", acts: ["file"], login: "https://app.box.com/developers/console", note: "File later." },
  notion: { label: "Notion", group: "files", acts: ["file"], login: "https://www.notion.so/my-integrations", note: "Page later. Not a live write." },
  slack: { label: "Slack", group: "talk", acts: ["notify"], login: "https://api.slack.com/apps", note: "Desk ping. Helpers see Needs you." },
  teams: { label: "Microsoft Teams", group: "talk", acts: ["notify"], login: "https://dev.teams.microsoft.com/", note: "Ping later." },
  discord: { label: "Discord", group: "talk", acts: ["notify"], login: "https://discord.com/developers/applications", note: "Channel ping later." },
  telegram: { label: "Telegram", group: "talk", acts: ["capture"], login: "https://my.telegram.org/", note: "Inbound chat as a card." },
  messenger: { label: "Messenger", group: "talk", acts: ["capture"], login: "https://developers.facebook.com/apps/", note: "Chat in. AIA does not send first." },
  whatsapp: { label: "WhatsApp Business", group: "talk", acts: ["capture"], login: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started", note: "Inbound chat as a card." },
  zoom: { label: "Zoom", group: "talk", acts: ["book"], login: "https://marketplace.zoom.us/", note: "Meeting link later." },
  voice: { label: "Missed-call voice", group: "talk", acts: ["capture"], login: "", note: "A call becomes a card. We type it until this ships." },
  quickbooks: { label: "QuickBooks", group: "books", acts: ["invoice"], login: "https://developer.intuit.com/app/developer/dashboard", note: "Books after Collect. Not a payout." },
  xero: { label: "Xero", group: "books", acts: ["invoice"], login: "https://developer.xero.com/", note: "Books later." },
  docusign: { label: "DocuSign", group: "books", acts: ["file"], login: "https://account.docusign.com/", note: "Packet later. Owner still signs." },
  google: { label: "Google search / Cloud", group: "search", acts: ["capture"], login: "https://console.cloud.google.com/", note: "Search the catalog here. Google login is Cloud credentials, not a web-search pipe." },
  maps: { label: "Google Maps", group: "search", acts: ["capture"], login: "https://console.cloud.google.com/google/maps-apis", note: "Place later." },
  zapier: { label: "Zapier", group: "search", acts: ["post"], login: "https://zapier.com/app/login", note: "Send Zaps to the inbound hook today." },
  make: { label: "Make", group: "search", acts: ["post"], login: "https://www.make.com/", note: "Same. Hook is live." }
};

function soonCatalog() {
  return Object.entries(SOON).map(([id, spec]) => ({
    id,
    label: spec.label,
    group: spec.group || "other",
    acts: spec.acts,
    login: spec.login || "",
    live: false,
    connectable: false,
    lane: "soon",
    status: "soon",
    note: spec.note
  }));
}

function slugSite(s) {
  return String(s || "").toLowerCase().replace(/https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function hay(p) {
  return [p.id, p.label, p.group, p.vendor, p.note, (p.acts || []).join(" ")].join(" ").toLowerCase();
}

function searchPipes(q) {
  const needle = String(q || "").trim().toLowerCase();
  const soon = soonCatalog();
  const ai = aiCatalog();
  if (!needle) return { q: "", soon, ai, named: Object.keys(PROVIDERS) };
  const hitSoon = soon.filter((p) => hay(p).indexOf(needle) >= 0);
  const hitAi = ai.filter((p) => hay(p).indexOf(needle) >= 0);
  const named = Object.keys(PROVIDERS).filter((id) => {
    const spec = PROVIDERS[id] || {};
    return (id + " " + (spec.label || "")).toLowerCase().indexOf(needle) >= 0;
  });
  return { q: needle, soon: hitSoon, ai: hitAi, named, missed: !hitSoon.length && !hitAi.length && !named.length };
}

function inboundOf(workspace) {
  const slug = String(workspace || "");
  return slug
    ? "https://automateitaway.com/api/hook?workspace=" + encodeURIComponent(slug)
    : "https://automateitaway.com/api/hook";
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
      groups: ["mail", "calendar", "social", "shop", "pay", "crm", "files", "talk", "books", "search"],
      helpers: {
        owner: "Connect, drop, Stop, money rules. Draft accounts are owner-only.",
        helper: "Work the queue. Yes when the rule allows. Cannot connect a pipe or tap No."
      },
      note: "Webhook is the cross-internet pipe today. Search the wall. Log in opens that vendor. Name any other site — inbound hook still takes the card. Nothing here sends, posts, or pays by itself.",
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

    if (action === "pipe-search") {
      const found = searchPipes(body.q || body.query || body.name);
      return res.status(200).json({
        ok: true,
        inbound: inboundOf(workspace),
        login: found.missed ? searchLogin(body.q || body.name) : "",
        next: found.missed
          ? "No named pipe for that yet. Log in searches the vendor. Use the inbound hook today."
          : "Matches on the wall. Log in opens the vendor. Not a live send pipe.",
        q: found.q,
        soon: found.soon,
        ai: found.ai,
        named: found.named,
        missed: found.missed
      });
    }
    if (action === "pipe-ask") {
      const name = String(body.name || body.q || body.provider || "").trim();
      if (!name) return res.status(400).json({ error: "Name the site." });
      const id = slugSite(name);
      const found = searchPipes(name);
      if (!found.missed) {
        return res.status(200).json({
          ok: true,
          inbound: inboundOf(workspace),
          q: found.q,
          soon: found.soon,
          ai: found.ai,
          named: found.named,
          missed: found.missed,
          next: "That name is already on the wall. Log in there. Inbound hook still works today."
        });
      }
      const login = String(body.login || "").trim() || searchLogin(name);
      return res.status(200).json({
        ok: true,
        asked: { id, label: name.slice(0, 80), group: "search", login, status: "soon", live: false },
        inbound: inboundOf(workspace),
        login,
        next: "No live pipe for " + name + " yet. Inbound hook can take the card today. Log in searches that vendor."
      });
    }

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
      if (action === "pipe-start" && !spec) {
        const label = String(body.name || provider || "").trim() || "that site";
        return res.status(200).json({
          ok: true,
          provider: slugSite(label),
          login: searchLogin(label),
          status: "soon",
          next: "No named pipe for " + label + " yet. Search opens vendor docs. Use the inbound hook today."
        });
      }
      if (!spec) {
        return res.status(400).json({ error: "Pick a named pipe.", soon: soonCatalog() });
      }
      if (action === "pipe-start") {
        return res.status(200).json({
          ok: true,
          provider,
          login: spec.login || searchLogin(spec.label),
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
