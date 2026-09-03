function queryFlag(req) {
  const q = req.query || {};
  const url = String(req.url || "");
  return q.providers === "1" || q.doors === "1" || q.policy === "1" || /[?&](providers|doors|policy)=1/.test(url);
}

function oauthMod() {
  try { return require("./_oauth"); } catch (e) { return null; }
}

function policyOf(oauth) {
  if (oauth && typeof oauth.complianceOf === "function") return oauth.complianceOf();
  return {
    identityOnly: true,
    specialApiAccess: "identity",
    scopesAllowed: ["openid", "email", "profile", "name"],
    scopesNever: ["gmail", "mail.google.com", "drive", "calendar", "payments", "policy", "bind", "premium", "commission"],
    never: ["send", "stop", "pay", "draft", "bind", "premium"],
    privacy: "/legal",
    terms: "/legal",
    home: "https://automateitaway.com",
    pipes: "/connections",
    landOn: "/onboard",
    note: "Identity only. Login is not a pipe. Never Send, Stop, pay, draft, bind, or place premium."
  };
}

function catalog(oauth, q) {
  if (oauth && typeof oauth.publicProviders === "function") return oauth.publicProviders(q);
  return [];
}

function identitiesOf(acc) {
  if (!acc) return [];
  if (!Array.isArray(acc.identities)) acc.identities = [];
  return acc.identities;
}

function publicIdentities(acc) {
  return identitiesOf(acc).map((row) => ({
    provider: row.provider,
    email: row.email || "",
    name: row.name || "",
    linkedAt: row.linkedAt || "",
    verified: !!row.verified
  }));
}

function doorCount(acc) {
  if (!acc) return 0;
  return identitiesOf(acc).length + (acc.password ? 1 : 0) + (acc.pin ? 1 : 0);
}

function handleGet(req, res) {
  if (req.method !== "GET" || !queryFlag(req)) return false;
  const oauth = oauthMod();
  const policy = policyOf(oauth);
  const q = (req.query && req.query.q) || "";
  res.status(200).json({
    ok: true,
    providers: catalog(oauth, q),
    policy: policy,
    landOn: "/onboard",
    note: policy.note
  });
  return true;
}

function start(oauth, body) {
  body = body || {};
  if (oauth && typeof oauth.startOAuth === "function") {
    const started = oauth.startOAuth.length > 1 ? oauth.startOAuth(body.provider || body.id, body) : oauth.startOAuth(body);
    if (started) return started;
  }
  return {
    ok: false,
    status: 409,
    hold: true,
    error: "Hold. That door is on the wall until the app id is on the box. Identity only."
  };
}

function handlePost(req, res, body, ctx) {
  body = body || {};
  const action = String(body.action || "").toLowerCase();
  if (["providers", "oauth-start", "oauth-ask", "ask-other", "link-provider", "unlink-provider", "oauth-finish"].indexOf(action) < 0) {
    return false;
  }
  const oauth = oauthMod();
  const policy = policyOf(oauth);
  if (action === "providers") {
    res.status(200).json({ ok: true, providers: catalog(oauth, body.q), policy: policy, note: policy.note });
    return true;
  }
  if (action === "oauth-start" || action === "oauth-ask" || action === "ask-other" || action === "oauth-finish") {
    const started = start(oauth, body);
    res.status(started.ok ? 200 : (started.status || 409)).json(Object.assign({ policy: policy }, started));
    return true;
  }
  const hooks = ctx || {};
  const auth = typeof hooks.authAccount === "function" ? hooks.authAccount(req) : { found: {}, account: null };
  if (!auth.account || !auth.found || !auth.found.person) {
    res.status(401).json({ ok: false, error: "Sign in first." });
    return true;
  }
  const acc = auth.account;
  if (action === "link-provider") {
    if (oauth && typeof oauth.rememberIdentity === "function") {
      const made = oauth.rememberIdentity(acc, body);
      if (!made.ok) { res.status(made.status || 400).json(made); return true; }
    } else {
      const provider = String(body.provider || body.id || "").toLowerCase();
      if (!provider) { res.status(400).json({ ok: false, error: "Name the door." }); return true; }
      const rows = identitiesOf(acc);
      if (!rows.some((r) => r.provider === provider)) {
        rows.push({ provider: provider, subject: String(body.subject || body.email || provider), email: String(body.email || "").toLowerCase(), name: String(body.name || ""), linkedAt: new Date().toISOString(), verified: true });
      }
    }
    if (typeof hooks.save === "function") hooks.save();
    res.status(200).json({ ok: true, identities: publicIdentities(acc), policy: policy, hint: "Linked. Identity only. Not a pipe." });
    return true;
  }
  const provider = String(body.provider || body.id || body.door || "").toLowerCase();
  if (!provider) { res.status(400).json({ ok: false, error: "Name the door." }); return true; }
  if (oauth && typeof oauth.dropIdentity === "function") {
    const dropped = oauth.dropIdentity(acc, provider);
    if (!dropped.ok) { res.status(dropped.status || 400).json(dropped); return true; }
    if (typeof hooks.save === "function") hooks.save();
    res.status(200).json({ ok: true, identities: dropped.identities || publicIdentities(acc), policy: policy });
    return true;
  }
  const rows = identitiesOf(acc);
  const next = rows.filter((r) => r.provider !== provider);
  if (next.length === rows.length) {
    res.status(404).json({ ok: false, error: "That door is not linked." });
    return true;
  }
  const preview = next.length + (acc.password ? 1 : 0) + (acc.pin ? 1 : 0);
  if (preview < 1) {
    res.status(409).json({ ok: false, error: "Keep at least one door: a linked login, a password, or a desk code." });
    return true;
  }
  acc.identities = next;
  if (typeof hooks.save === "function") hooks.save();
  res.status(200).json({ ok: true, identities: publicIdentities(acc), policy: policy });
  return true;
}

module.exports = { handleGet, handlePost, policyOf, publicIdentities, doorCount, identitiesOf };
